const express = require('express');
const {
  buildNutritionBrainStatus,
  rankSourcesForIngredient,
  scoreIngredientReference,
  validateMacroEnergy
} = require('../services/nutrition-brain');

module.exports = () => {
  const router = express.Router();

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

  return router;
};
