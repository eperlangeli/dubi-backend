const { Pool } = require('pg');
require('dotenv').config();

const { buildRecipeAuditFromReferences, normalizeIngredientKey } = require('../services/recipe-audit');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

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

const saveAudit = async (recipe, audit) => {
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
};

const run = async () => {
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
    const refs = await getReferenceMap(keys);
    const audit = buildRecipeAuditFromReferences(recipe, refs);
    await saveAudit(recipe, audit);
    summary[audit.status] = (summary[audit.status] || 0) + 1;
    console.log(`${audit.status.toUpperCase()} ${recipe.name} coverage=${audit.sourceCoverage}% delta=${audit.calorieDelta}`);
  }

  console.log(JSON.stringify(summary, null, 2));
};

run()
  .catch((error) => {
    console.error('Recipe source audit failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
