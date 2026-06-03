const express = require('express');
const crypto = require('crypto');
const {
  buildNutritionBrainStatus,
  rankSourcesForIngredient,
  scoreIngredientReference,
  validateMacroEnergy
} = require('../services/nutrition-brain');
const { searchUsdaFood } = require('../services/usda-client');
const { buildRecipeAuditFromReferences, normalizeIngredientKey } = require('../services/recipe-audit');

const TEMP_PIPELINE_TOKEN_SHA256 = '0d5b41ee682a1a5bfb1c89719af709a10cd08e1d0c2fe86a500b95ab23b43653';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const hashToken = (value = '') =>
  crypto.createHash('sha256').update(String(value)).digest('hex');

module.exports = (pool = null) => {
  const router = express.Router();

  const requireNutritionAdmin = (req, res, next) => {
    const adminToken = process.env.NUTRITION_ADMIN_TOKEN;
    if (!adminToken) {
      return res.status(503).json({ error: 'NUTRITION_ADMIN_TOKEN is not configured' });
    }
    const provided = req.headers['x-nutrition-admin-token'];
    if (provided !== adminToken) {
      return res.status(403).json({ error: 'Invalid nutrition admin token' });
    }
    return next();
  };

  const requireTemporaryPipelineToken = (req, res, next) => {
    const provided = req.headers['x-dubi-pipeline-token'];
    if (hashToken(provided) !== TEMP_PIPELINE_TOKEN_SHA256) {
      return res.status(403).json({ error: 'Invalid temporary pipeline token' });
    }
    return next();
  };

  router.get('/sources', (req, res) => {
    res.json(buildNutritionBrainStatus());
  });

  router.get('/source-priority', (req, res) => {
    const locale = String(req.query.locale || 'global').toLowerCase();
    const packaged = ['1', 'true', 'yes'].includes(String(req.query.packaged || '').toLowerCase());

    res.json({
      locale,
      packaged,
      priority: rankSourcesForIngredient({ locale, packaged })
    });
  });

  router.post('/validate-macros', (req, res) => {
    const { calories, protein, carbs, fats, toleranceKcal } = req.body || {};
    res.json(validateMacroEnergy({ calories, protein, carbs, fats, toleranceKcal }));
  });

  router.post('/score-reference', (req, res) => {
    res.json({
      score: scoreIngredientReference(req.body || {}),
      reference: req.body || {}
    });
  });

  router.post('/audit-recipes', requireNutritionAdmin, async (req, res) => {
    if (!pool) return res.status(501).json({ error: 'Database pool not configured for recipe audits' });

    try {
      const result = await pool.query(`
        SELECT id, name, calories, protein, carbs, fats, ingredients
        FROM recipes
        WHERE is_active = true
      `);

      const audits = [];
      for (const recipe of result.rows) {
        const macroEnergy = validateMacroEnergy({
          calories: recipe.calories,
          protein: recipe.protein,
          carbs: recipe.carbs,
          fats: recipe.fats
        });
        const ingredientKeys = Array.isArray(recipe.ingredients)
          ? recipe.ingredients.map((item) => String(item.name || '').toLowerCase().trim()).filter(Boolean)
          : [];
        const refs = ingredientKeys.length
          ? await pool.query(`
              SELECT DISTINCT ingredient_key, source_id, confidence_score
              FROM nutrition_ingredient_refs
              WHERE ingredient_key = ANY($1::varchar[])
            `, [ingredientKeys])
          : { rows: [] };
        const sourceIds = [...new Set(refs.rows.map((row) => row.source_id).filter(Boolean))];
        const avgConfidence = refs.rows.length
          ? Math.round(refs.rows.reduce((sum, row) => sum + Number(row.confidence_score || 0), 0) / refs.rows.length)
          : 50;
        const allIngredientsSourceBacked = ingredientKeys.length > 0 && refs.rows.length >= ingredientKeys.length;
        const status = macroEnergy.valid && allIngredientsSourceBacked
          ? 'approved'
          : macroEnergy.valid
            ? 'macro_valid_pending_sources'
            : 'macro_mismatch';
        const confidence = macroEnergy.valid
          ? (allIngredientsSourceBacked ? Math.max(85, avgConfidence) : 60)
          : 35;

        const auditPayload = {
          ingredientKeys,
          sourceBackedIngredientCount: refs.rows.length,
          sourceIds,
          macroEnergy,
          method: 'DUBI nutrition brain recipe audit v1'
        };

        const insert = await pool.query(`
          INSERT INTO recipe_nutrition_audits (
            recipe_id,
            recipe_name,
            declared_calories,
            calculated_calories,
            calorie_delta,
            declared_protein,
            calculated_protein,
            declared_carbs,
            calculated_carbs,
            declared_fats,
            calculated_fats,
            confidence_score,
            status,
            source_ids,
            notes,
            audit_payload
          )
          VALUES ($1,$2,$3,$4,$5,$6,NULL,$7,NULL,$8,NULL,$9,$10,$11,$12,$13)
          RETURNING id, status, confidence_score
        `, [
          recipe.id,
          recipe.name,
          macroEnergy.declaredCalories,
          macroEnergy.calculatedCalories,
          macroEnergy.delta,
          recipe.protein,
          recipe.carbs,
          recipe.fats,
          confidence,
          status,
          sourceIds,
          allIngredientsSourceBacked
            ? 'Recipe macro energy and ingredient source coverage passed.'
            : 'Recipe macro energy is checked; official ingredient source coverage still pending.',
          JSON.stringify(auditPayload)
        ]);

        await pool.query(`
          UPDATE recipes
          SET
            nutrition_audit_status = $1,
            nutrition_confidence_score = $2,
            nutrition_source_ids = $3,
            nutrition_audit_payload = $4
          WHERE id = $5
        `, [status, confidence, sourceIds, JSON.stringify(auditPayload), recipe.id]);

        audits.push({
          recipeId: recipe.id,
          recipeName: recipe.name,
          status,
          confidence,
          auditId: insert.rows[0].id,
          macroEnergy
        });
      }

      res.json({
        audited: audits.length,
        summary: audits.reduce((acc, audit) => {
          acc[audit.status] = (acc[audit.status] || 0) + 1;
          return acc;
        }, {}),
        audits
      });
    } catch (error) {
      console.error('Nutrition recipe audit error:', error);
      res.status(500).json({ error: 'Failed to audit recipes' });
    }
  });

  router.post('/temp-pipeline/ingest-usda', requireTemporaryPipelineToken, async (req, res) => {
    if (!pool) return res.status(501).json({ error: 'Database pool not configured' });

    const limit = Math.max(1, Math.min(40, Number(req.body?.limit || req.query.limit || 20)));
    const offset = Math.max(0, Number(req.body?.offset || req.query.offset || 0));
    const apiKey = process.env.USDA_FDC_API_KEY || 'DEMO_KEY';

    try {
      const recipes = await pool.query(`
        SELECT ingredients
        FROM recipes
        WHERE is_active = true
      `);
      const ingredientMap = new Map();
      for (const row of recipes.rows) {
        const ingredients = Array.isArray(row.ingredients) ? row.ingredients : [];
        for (const ingredient of ingredients) {
          const displayName = String(ingredient.name || '').trim();
          const key = normalizeIngredientKey(displayName);
          if (key && !ingredientMap.has(key)) ingredientMap.set(key, displayName);
        }
      }

      const entries = [...ingredientMap.entries()].slice(offset, offset + limit);
      const summary = { totalUniqueIngredients: ingredientMap.size, offset, limit, saved: 0, missing: 0, errors: 0, items: [] };

      for (const [ingredientKey, displayName] of entries) {
        try {
          const results = await searchUsdaFood(displayName, { apiKey, pageSize: 5 });
          const reference = results[0];
          if (!reference) {
            summary.missing += 1;
            summary.items.push({ ingredientKey, displayName, status: 'missing' });
          } else {
            const confidence = scoreIngredientReference({
              ...reference,
              preparation_match: true,
              locale_match: false
            });
            await pool.query(`
              INSERT INTO nutrition_ingredient_refs (
                ingredient_key,
                display_name,
                source_id,
                source_food_id,
                source_food_name,
                locale,
                preparation_state,
                calories_per_100g,
                protein_per_100g,
                carbs_per_100g,
                fats_per_100g,
                fiber_per_100g,
                confidence_score,
                source_payload,
                updated_at
              )
              VALUES ($1,$2,$3,$4,$5,'global','generic',$6,$7,$8,$9,$10,$11,$12,CURRENT_TIMESTAMP)
              ON CONFLICT (ingredient_key, source_id, source_food_id, preparation_state)
              DO UPDATE SET
                display_name = EXCLUDED.display_name,
                source_food_name = EXCLUDED.source_food_name,
                calories_per_100g = EXCLUDED.calories_per_100g,
                protein_per_100g = EXCLUDED.protein_per_100g,
                carbs_per_100g = EXCLUDED.carbs_per_100g,
                fats_per_100g = EXCLUDED.fats_per_100g,
                fiber_per_100g = EXCLUDED.fiber_per_100g,
                confidence_score = EXCLUDED.confidence_score,
                source_payload = EXCLUDED.source_payload,
                updated_at = CURRENT_TIMESTAMP
            `, [
              ingredientKey,
              displayName,
              reference.source_id,
              reference.source_food_id,
              reference.source_food_name,
              reference.calories_per_100g,
              reference.protein_per_100g,
              reference.carbs_per_100g,
              reference.fats_per_100g,
              reference.fiber_per_100g,
              confidence,
              JSON.stringify(reference)
            ]);
            summary.saved += 1;
            summary.items.push({ ingredientKey, displayName, status: 'saved', source: reference.source_food_name, sourceId: reference.source_id, confidence });
          }
          await sleep(200);
        } catch (error) {
          summary.errors += 1;
          summary.items.push({ ingredientKey, displayName, status: 'error', error: error.message });
          await sleep(400);
        }
      }

      res.json(summary);
    } catch (error) {
      console.error('Temporary USDA ingest error:', error);
      res.status(500).json({ error: 'Failed to ingest USDA references' });
    }
  });

  router.post('/temp-pipeline/audit-recipes', requireTemporaryPipelineToken, async (req, res) => {
    if (!pool) return res.status(501).json({ error: 'Database pool not configured' });

    const limit = Math.max(1, Math.min(40, Number(req.body?.limit || req.query.limit || 20)));
    const offset = Math.max(0, Number(req.body?.offset || req.query.offset || 0));

    try {
      const total = await pool.query('SELECT COUNT(*)::int AS count FROM recipes WHERE is_active = true');
      const recipes = await pool.query(`
        SELECT id, name, calories, protein, carbs, fats, fiber, ingredients
        FROM recipes
        WHERE is_active = true
        ORDER BY name
        LIMIT $1 OFFSET $2
      `, [limit, offset]);

      const getReferenceMap = async (ingredientKeys) => {
        if (!ingredientKeys.length) return {};
        const result = await pool.query(`
          SELECT DISTINCT ON (ingredient_key)
            ingredient_key,
            source_id,
            source_food_id,
            source_food_name,
            calories_per_100g,
            protein_per_100g,
            carbs_per_100g,
            fats_per_100g,
            fiber_per_100g,
            confidence_score
          FROM nutrition_ingredient_refs
          WHERE ingredient_key = ANY($1::varchar[])
          ORDER BY ingredient_key, confidence_score DESC, updated_at DESC
        `, [ingredientKeys]);
        return Object.fromEntries(result.rows.map((row) => [row.ingredient_key, row]));
      };

      const audits = [];
      for (const recipe of recipes.rows) {
        const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
        const keys = ingredients.map((item) => normalizeIngredientKey(item.name)).filter(Boolean);
        const refs = await getReferenceMap(keys);
        const audit = buildRecipeAuditFromReferences(recipe, refs);
        const sourceIds = [...new Set(audit.contributions.map((item) => item.sourceId).filter(Boolean))];

        await pool.query(`
          INSERT INTO recipe_nutrition_audits (
            recipe_id,
            recipe_name,
            declared_calories,
            calculated_calories,
            calorie_delta,
            declared_protein,
            calculated_protein,
            declared_carbs,
            calculated_carbs,
            declared_fats,
            calculated_fats,
            confidence_score,
            status,
            source_ids,
            notes,
            audit_payload
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        `, [
          recipe.id,
          recipe.name,
          audit.declared.calories,
          audit.calculated.calories,
          audit.calorieDelta,
          audit.declared.protein,
          audit.calculated.protein,
          audit.declared.carbs,
          audit.calculated.carbs,
          audit.declared.fats,
          audit.calculated.fats,
          audit.confidence,
          audit.status,
          sourceIds,
          audit.missing.length
            ? `Missing official references for: ${audit.missing.map((item) => item.ingredientName).join(', ')}`
            : 'All ingredients matched to official source references.',
          JSON.stringify(audit)
        ]);

        await pool.query(`
          UPDATE recipes
          SET
            calories = CASE WHEN $1 = 'approved' THEN $2 ELSE calories END,
            protein = CASE WHEN $1 = 'approved' THEN ROUND($3)::int ELSE protein END,
            carbs = CASE WHEN $1 = 'approved' THEN ROUND($4)::int ELSE carbs END,
            fats = CASE WHEN $1 = 'approved' THEN ROUND($5)::int ELSE fats END,
            fiber = CASE WHEN $1 = 'approved' THEN ROUND($6)::int ELSE fiber END,
            nutrition_audit_status = $1,
            nutrition_confidence_score = $7,
            nutrition_source_ids = $8,
            nutrition_audit_payload = $9
          WHERE id = $10
        `, [
          audit.status,
          audit.calculated.calories,
          audit.calculated.protein,
          audit.calculated.carbs,
          audit.calculated.fats,
          audit.calculated.fiber,
          audit.confidence,
          sourceIds,
          JSON.stringify(audit),
          recipe.id
        ]);

        audits.push({ recipeId: recipe.id, recipeName: recipe.name, status: audit.status, confidence: audit.confidence, sourceCoverage: audit.sourceCoverage, calorieDelta: audit.calorieDelta });
      }

      res.json({
        totalRecipes: total.rows[0].count,
        offset,
        limit,
        audited: audits.length,
        summary: audits.reduce((acc, audit) => {
          acc[audit.status] = (acc[audit.status] || 0) + 1;
          return acc;
        }, {}),
        audits
      });
    } catch (error) {
      console.error('Temporary recipe audit error:', error);
      res.status(500).json({ error: 'Failed to audit recipes with sources' });
    }
  });

  router.post('/temp-pipeline/upsert-refs', requireTemporaryPipelineToken, async (req, res) => {
    if (!pool) return res.status(501).json({ error: 'Database pool not configured' });

    const references = Array.isArray(req.body?.references) ? req.body.references.slice(0, 100) : [];
    if (!references.length) return res.status(400).json({ error: 'references array is required' });

    const summary = { received: references.length, saved: 0, skipped: 0, errors: 0 };

    for (const reference of references) {
      const ingredientKey = normalizeIngredientKey(reference.ingredient_key || reference.display_name);
      if (!ingredientKey || !reference.display_name || !reference.source_id || !reference.source_food_id) {
        summary.skipped += 1;
        continue;
      }

      try {
        const confidence = Number(reference.confidence_score) || scoreIngredientReference({
          ...reference,
          preparation_match: true,
          locale_match: false
        });
        await pool.query(`
          INSERT INTO nutrition_ingredient_refs (
            ingredient_key,
            display_name,
            source_id,
            source_food_id,
            source_food_name,
            locale,
            preparation_state,
            calories_per_100g,
            protein_per_100g,
            carbs_per_100g,
            fats_per_100g,
            fiber_per_100g,
            confidence_score,
            source_payload,
            updated_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,'generic',$7,$8,$9,$10,$11,$12,$13,CURRENT_TIMESTAMP)
          ON CONFLICT (ingredient_key, source_id, source_food_id, preparation_state)
          DO UPDATE SET
            display_name = EXCLUDED.display_name,
            source_food_name = EXCLUDED.source_food_name,
            locale = EXCLUDED.locale,
            calories_per_100g = EXCLUDED.calories_per_100g,
            protein_per_100g = EXCLUDED.protein_per_100g,
            carbs_per_100g = EXCLUDED.carbs_per_100g,
            fats_per_100g = EXCLUDED.fats_per_100g,
            fiber_per_100g = EXCLUDED.fiber_per_100g,
            confidence_score = EXCLUDED.confidence_score,
            source_payload = EXCLUDED.source_payload,
            updated_at = CURRENT_TIMESTAMP
        `, [
          ingredientKey,
          reference.display_name,
          reference.source_id,
          String(reference.source_food_id),
          reference.source_food_name,
          reference.locale || 'global',
          reference.calories_per_100g,
          reference.protein_per_100g,
          reference.carbs_per_100g,
          reference.fats_per_100g,
          reference.fiber_per_100g,
          confidence,
          JSON.stringify(reference.source_payload || reference)
        ]);
        summary.saved += 1;
      } catch (error) {
        summary.errors += 1;
      }
    }

    res.json(summary);
  });

  router.get('/temp-pipeline/export-recipes', requireTemporaryPipelineToken, async (req, res) => {
    if (!pool) return res.status(501).json({ error: 'Database pool not configured' });

    try {
      const result = await pool.query(`
        SELECT
          id,
          name,
          description,
          meal_type,
          diet_compatibility,
          allergens,
          calories,
          protein,
          carbs,
          fats,
          fiber,
          ingredients,
          scientific_source,
          evidence_level,
          nutrition_audit_status,
          nutrition_confidence_score,
          nutrition_source_ids,
          nutrition_audit_payload
        FROM recipes
        WHERE is_active = true
        ORDER BY name
      `);

      const recipes = result.rows.map((recipe) => ({
        id: recipe.id,
        name: recipe.name,
        description: recipe.description,
        mealType: recipe.meal_type || [],
        dietCompatibility: recipe.diet_compatibility || [],
        allergens: recipe.allergens || [],
        calories: Number(recipe.calories || 0),
        protein: Number(recipe.protein || 0),
        carbs: Number(recipe.carbs || 0),
        fats: Number(recipe.fats || 0),
        fiber: Number(recipe.fiber || 0),
        ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
        scientificSource: recipe.scientific_source,
        evidenceLevel: recipe.evidence_level,
        nutritionAuditStatus: recipe.nutrition_audit_status,
        nutritionConfidenceScore: Number(recipe.nutrition_confidence_score || 0),
        nutritionSourceIds: recipe.nutrition_source_ids || [],
        nutritionAuditPayload: recipe.nutrition_audit_payload || {}
      }));

      const summary = recipes.reduce((acc, recipe) => {
        const status = recipe.nutritionAuditStatus || 'unknown';
        acc.auditStatuses[status] = (acc.auditStatuses[status] || 0) + 1;
        for (const diet of recipe.dietCompatibility) {
          acc.dietCompatibility[diet] = (acc.dietCompatibility[diet] || 0) + 1;
        }
        return acc;
      }, { totalRecipes: recipes.length, auditStatuses: {}, dietCompatibility: {} });

      res.json({
        generatedAt: new Date().toISOString(),
        sourceMode: 'database',
        title: 'DUBI Ricette con Fonti Nutrizionali Ufficiali',
        summary,
        recipes
      });
    } catch (error) {
      console.error('Temporary recipe export error:', error);
      res.status(500).json({ error: 'Failed to export recipes' });
    }
  });

  return router;
};
