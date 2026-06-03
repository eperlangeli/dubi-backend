const fs = require('fs');
const path = require('path');
try {
  require('dotenv').config();
} catch {
  // Local PDF preview can run without installed npm dependencies.
}

const seedRecipes = require('../seed-recipes');

const outputPath = process.env.RECIPES_PDF_DATA_PATH
  || path.resolve(process.cwd(), '..', 'DUBI_Ricette_Ufficiali_Data.json');

const normalizeRecipe = (recipe, sourceMode) => ({
  id: recipe.id || null,
  name: recipe.name,
  description: recipe.description,
  mealType: recipe.meal_type || recipe.mealType || [],
  dietCompatibility: recipe.diet_compatibility || recipe.dietCompatibility || [],
  allergens: recipe.allergens || [],
  calories: Number(recipe.calories || 0),
  protein: Number(recipe.protein || 0),
  carbs: Number(recipe.carbs || 0),
  fats: Number(recipe.fats || 0),
  fiber: Number(recipe.fiber || 0),
  ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
  scientificSource: recipe.scientific_source || recipe.scientificSource || null,
  evidenceLevel: recipe.evidence_level || recipe.evidenceLevel || null,
  nutritionAuditStatus: recipe.nutrition_audit_status || (sourceMode === 'database' ? 'pending' : 'local_preview_not_audited'),
  nutritionConfidenceScore: Number(recipe.nutrition_confidence_score || 0),
  nutritionSourceIds: recipe.nutrition_source_ids || [],
  nutritionAuditPayload: recipe.nutrition_audit_payload || {}
});

const loadFromDatabase = async () => {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

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
    return result.rows.map((recipe) => normalizeRecipe(recipe, 'database'));
  } finally {
    await pool.end();
  }
};

const loadLocalPreview = () => seedRecipes.map((recipe) => normalizeRecipe(recipe, 'local_preview'));

const summarize = (recipes) => recipes.reduce((summary, recipe) => {
  const status = recipe.nutritionAuditStatus || 'unknown';
  summary.auditStatuses[status] = (summary.auditStatuses[status] || 0) + 1;
  for (const diet of recipe.dietCompatibility) {
    summary.dietCompatibility[diet] = (summary.dietCompatibility[diet] || 0) + 1;
  }
  return summary;
}, { totalRecipes: recipes.length, auditStatuses: {}, dietCompatibility: {} });

const run = async () => {
  const useDatabase = Boolean(process.env.DATABASE_URL);
  const sourceMode = useDatabase ? 'database' : 'local_preview';
  const recipes = useDatabase ? await loadFromDatabase() : loadLocalPreview();
  const payload = {
    generatedAt: new Date().toISOString(),
    sourceMode,
    title: sourceMode === 'database'
      ? 'DUBI Ricette con Fonti Nutrizionali Ufficiali'
      : 'DUBI Ricette - Preview Locale Non Auditata',
    summary: summarize(recipes),
    recipes
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ outputPath, sourceMode, ...payload.summary }, null, 2));
};

run().catch((error) => {
  console.error('Recipe PDF data export failed:', error);
  process.exitCode = 1;
});
