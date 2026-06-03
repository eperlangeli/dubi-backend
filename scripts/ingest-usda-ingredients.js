const { Pool } = require('pg');
require('dotenv').config();

const { searchUsdaFood } = require('../services/usda-client');
const { normalizeIngredientKey } = require('../services/recipe-audit');
const { scoreIngredientReference } = require('../services/nutrition-brain');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const getIngredientDisplayMap = async () => {
  const result = await pool.query(`
    SELECT ingredients
    FROM recipes
    WHERE is_active = true
  `);

  const map = new Map();
  for (const row of result.rows) {
    const ingredients = Array.isArray(row.ingredients) ? row.ingredients : [];
    for (const ingredient of ingredients) {
      const displayName = String(ingredient.name || '').trim();
      const key = normalizeIngredientKey(displayName);
      if (key && !map.has(key)) map.set(key, displayName);
    }
  }
  return map;
};

const saveReference = async (ingredientKey, displayName, reference) => {
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
};

const run = async () => {
  if (!process.env.USDA_FDC_API_KEY) {
    throw new Error('USDA_FDC_API_KEY is required');
  }

  const limit = Number(process.env.USDA_INGEST_LIMIT || process.argv[2] || 0);
  const ingredientMap = await getIngredientDisplayMap();
  const entries = [...ingredientMap.entries()].slice(0, limit > 0 ? limit : undefined);
  const summary = { total: entries.length, saved: 0, missing: 0, errors: 0 };

  for (const [ingredientKey, displayName] of entries) {
    try {
      const results = await searchUsdaFood(displayName, { pageSize: 5 });
      const best = results[0];
      if (!best) {
        summary.missing += 1;
        console.log(`MISS ${ingredientKey} -> ${displayName}`);
      } else {
        await saveReference(ingredientKey, displayName, best);
        summary.saved += 1;
        console.log(`SAVE ${ingredientKey} -> ${best.source_food_name} (${best.source_id})`);
      }
      await sleep(250);
    } catch (error) {
      summary.errors += 1;
      console.error(`ERROR ${ingredientKey}: ${error.message}`);
      await sleep(500);
    }
  }

  console.log(JSON.stringify(summary, null, 2));
};

run()
  .catch((error) => {
    console.error('USDA ingredient ingestion failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
