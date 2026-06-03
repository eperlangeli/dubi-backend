const express = require('express');
const {
  buildNutritionBrainStatus,
  rankSourcesForIngredient,
  scoreIngredientReference,
  validateMacroEnergy
} = require('../services/nutrition-brain');

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

  return router;
};
