const crypto = require('crypto');
const express = require('express');

const recipeRows = require('../seed-recipes');
const { scoreIngredientReference } = require('../services/nutrition-brain');
const { buildRecipeAuditFromReferences, normalizeIngredientKey } = require('../services/recipe-audit');

const TOKEN_HASH = '48442fcf27ce4a97219695ae4f8bf32fd74ef50a9170b380ea85f330d07a3e3e';

const sha256 = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex');

const requireTempToken = (req, res, next) => {
  const provided = req.headers['x-dubi-pipeline-token'];
  if (!provided || sha256(provided) !== TOKEN_HASH) {
    return res.status(403).json({ error: 'Invalid pipeline token' });
  }
  return next();
};

const recipeParams = (recipe) => [
  recipe.description,
  recipe.servingSize,
  recipe.calories,
  recipe.protein,
  recipe.carbs,
  recipe.fats,
  recipe.fiber,
  recipe.satietyScore,
  recipe.nutrientDensity,
  recipe.processingLevel,
  recipe.glycemicIndex,
  recipe.recoverySupportScore,
  recipe.mealType,
  recipe.cuisine,
  recipe.prepTimeMinutes,
  recipe.costLevel,
  recipe.difficulty,
  recipe.sodiumLevel,
  recipe.addedSugarLevel,
  recipe.mealGoalTags,
  recipe.avoidIf,
  recipe.dietCompatibility,
  recipe.allergens,
  JSON.stringify(recipe.ingredients),
  recipe.scientificSource,
  recipe.evidenceLevel
];

module.exports = (pool = null) => {
  const router = express.Router();

  router.use(requireTempToken);

  router.post('/refs', async (req, res) => {
    if (!pool) return res.status(501).json({ error: 'Database pool not configured' });

    const references = Array.isArray(req.body?.references) ? req.body.references : [];
    let saved = 0;

    for (const item of references) {
      const ingredientKey = item.ingredient_key || item.ingredientKey;
      const displayName = item.display_name || item.displayName || ingredientKey;
      const reference = item.reference || item;
      if (!ingredientKey || !reference.source_id || !reference.source_food_id) continue;

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

      saved += 1;
    }

    res.json({ saved, received: references.length });
  });

  router.post('/recipes', async (req, res) => {
    if (!pool) return res.status(501).json({ error: 'Database pool not configured' });

    const recipeNames = recipeRows.map((recipe) => recipe.name);
    await pool.query(
      'UPDATE recipes SET is_active = false WHERE is_active = true AND NOT (name = ANY($1::varchar[]))',
      [recipeNames]
    );

    let inserted = 0;
    let updated = 0;

    for (const recipe of recipeRows) {
      const existing = await pool.query('SELECT id FROM recipes WHERE name = $1 LIMIT 1', [recipe.name]);
      if (existing.rows.length) {
        await pool.query(`
          UPDATE recipes
          SET
            description = $1,
            serving_size = $2,
            calories = $3,
            protein = $4,
            carbs = $5,
            fats = $6,
            fiber = $7,
            satiety_score = $8,
            nutrient_density = $9,
            processing_level = $10,
            glycemic_index = $11,
            recovery_support = $12,
            meal_type = $13,
            cuisine = $14,
            prep_time_minutes = $15,
            cost_level = $16,
            difficulty = $17,
            sodium_level = $18,
            added_sugar_level = $19,
            meal_goal_tags = $20,
            avoid_if = $21,
            diet_compatibility = $22,
            allergens = $23,
            ingredients = $24,
            scientific_source = $25,
            evidence_level = $26,
            is_active = true,
            nutrition_audit_status = 'pending',
            nutrition_confidence_score = 50,
            nutrition_source_ids = ARRAY[]::varchar[],
            nutrition_audit_payload = '{}'::jsonb
          WHERE id = $27
        `, [...recipeParams(recipe), existing.rows[0].id]);
        updated += 1;
      } else {
        await pool.query(`
          INSERT INTO recipes (
            name,
            description,
            serving_size,
            calories,
            protein,
            carbs,
            fats,
            fiber,
            satiety_score,
            nutrient_density,
            processing_level,
            glycemic_index,
            recovery_support,
            meal_type,
            cuisine,
            prep_time_minutes,
            cost_level,
            difficulty,
            sodium_level,
            added_sugar_level,
            meal_goal_tags,
            avoid_if,
            diet_compatibility,
            allergens,
            ingredients,
            scientific_source,
            evidence_level,
            is_active,
            nutrition_audit_status,
            nutrition_confidence_score,
            nutrition_source_ids,
            nutrition_audit_payload
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,true,'pending',50,ARRAY[]::varchar[],'{}'::jsonb)
        `, [recipe.name, ...recipeParams(recipe)]);
        inserted += 1;
      }
    }

    res.json({ total: recipeRows.length, inserted, updated });
  });

  router.post('/audit', async (req, res) => {
    if (!pool) return res.status(501).json({ error: 'Database pool not configured' });

    const recipes = await pool.query(`
      SELECT id, name, calories, protein, carbs, fats, fiber, ingredients
      FROM recipes
      WHERE is_active = true
      ORDER BY name
    `);

    const summary = {};
    for (const recipe of recipes.rows) {
      const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
      const keys = ingredients.map((item) => normalizeIngredientKey(item.name)).filter(Boolean);
      const refsResult = keys.length
        ? await pool.query(`
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
        `, [keys])
        : { rows: [] };

      const refs = Object.fromEntries(refsResult.rows.map((row) => [row.ingredient_key, row]));
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
          calories = CASE WHEN $1 = 'approved' OR ($1 = 'needs_macro_adjustment' AND $11 = 100) THEN $2 ELSE calories END,
          protein = CASE WHEN $1 = 'approved' OR ($1 = 'needs_macro_adjustment' AND $11 = 100) THEN ROUND($3)::int ELSE protein END,
          carbs = CASE WHEN $1 = 'approved' OR ($1 = 'needs_macro_adjustment' AND $11 = 100) THEN ROUND($4)::int ELSE carbs END,
          fats = CASE WHEN $1 = 'approved' OR ($1 = 'needs_macro_adjustment' AND $11 = 100) THEN ROUND($5)::int ELSE fats END,
          fiber = CASE WHEN $1 = 'approved' OR ($1 = 'needs_macro_adjustment' AND $11 = 100) THEN ROUND($6)::int ELSE fiber END,
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
        recipe.id,
        audit.sourceCoverage
      ]);

      summary[audit.status] = (summary[audit.status] || 0) + 1;
    }

    res.json({ audited: recipes.rows.length, summary });
  });

  router.get('/export', async (req, res) => {
    if (!pool) return res.status(501).json({ error: 'Database pool not configured' });

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
      scientificSource: recipe.scientific_source || null,
      evidenceLevel: recipe.evidence_level || null,
      nutritionAuditStatus: recipe.nutrition_audit_status || 'pending',
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
  });

  return router;
};
