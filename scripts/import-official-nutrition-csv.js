const fs = require('fs');
const { Pool } = require('pg');
require('dotenv').config();

const { normalizeIngredientKey } = require('../services/recipe-audit');
const { scoreIngredientReference } = require('../services/nutrition-brain');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const parseCsv = (text, delimiter = ',') => {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(field);
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  return rows;
};

const numberFromCell = (value) => {
  const text = String(value ?? '').replace(',', '.').trim();
  if (!text || text === '-' || text.toLowerCase() === 'tr') return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
};

const getColumn = (row, header, envName, fallbackNames = []) => {
  const configured = process.env[envName];
  const names = [configured, ...fallbackNames].filter(Boolean).map((name) => name.toLowerCase());
  const index = header.findIndex((name) => names.includes(String(name).toLowerCase()));
  return index >= 0 ? row[index] : null;
};

const importRow = async (header, row, sourceId, locale) => {
  const displayName = getColumn(row, header, 'NUTRITION_CSV_NAME_COLUMN', ['name', 'food', 'alim_nom_fr', 'nome', 'alimento']);
  if (!displayName) return false;

  const reference = {
    source_id: sourceId,
    source_food_id: getColumn(row, header, 'NUTRITION_CSV_ID_COLUMN', ['id', 'code', 'alim_code']) || normalizeIngredientKey(displayName),
    source_food_name: displayName,
    calories_per_100g: numberFromCell(getColumn(row, header, 'NUTRITION_CSV_CALORIES_COLUMN', ['calories', 'energy_kcal', 'energie kcal', 'energia kcal'])),
    protein_per_100g: numberFromCell(getColumn(row, header, 'NUTRITION_CSV_PROTEIN_COLUMN', ['protein', 'proteins', 'proteine', 'proteines'])),
    carbs_per_100g: numberFromCell(getColumn(row, header, 'NUTRITION_CSV_CARBS_COLUMN', ['carbs', 'carbohydrate', 'glucides', 'carboidrati'])),
    fats_per_100g: numberFromCell(getColumn(row, header, 'NUTRITION_CSV_FATS_COLUMN', ['fat', 'fats', 'lipides', 'grassi'])),
    fiber_per_100g: numberFromCell(getColumn(row, header, 'NUTRITION_CSV_FIBER_COLUMN', ['fiber', 'fibre', 'fibres', 'fibra']))
  };

  if ([reference.calories_per_100g, reference.protein_per_100g, reference.carbs_per_100g, reference.fats_per_100g].some((value) => value === null)) {
    return false;
  }

  const ingredientKey = normalizeIngredientKey(displayName);
  const confidence = scoreIngredientReference({
    ...reference,
    locale_match: locale === 'it' || locale === 'eu',
    preparation_match: true
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
    displayName,
    reference.source_id,
    reference.source_food_id,
    reference.source_food_name,
    locale,
    reference.calories_per_100g,
    reference.protein_per_100g,
    reference.carbs_per_100g,
    reference.fats_per_100g,
    reference.fiber_per_100g,
    confidence,
    JSON.stringify(reference)
  ]);

  return true;
};

const run = async () => {
  const sourceId = process.env.NUTRITION_CSV_SOURCE_ID;
  const csvPath = process.env.NUTRITION_CSV_PATH || process.argv[2];
  const delimiter = process.env.NUTRITION_CSV_DELIMITER || ',';
  const locale = process.env.NUTRITION_CSV_LOCALE || 'eu';

  if (!sourceId) throw new Error('NUTRITION_CSV_SOURCE_ID is required, for example ciqual, crea, bls, or eurofir');
  if (!csvPath) throw new Error('NUTRITION_CSV_PATH or first command argument is required');

  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'), delimiter);
  const header = rows.shift().map((name) => String(name).trim());
  const summary = { sourceId, total: rows.length, imported: 0, skipped: 0 };

  for (const row of rows) {
    const imported = await importRow(header, row, sourceId, locale);
    if (imported) summary.imported += 1;
    else summary.skipped += 1;
  }

  console.log(JSON.stringify(summary, null, 2));
};

run()
  .catch((error) => {
    console.error('Official nutrition CSV import failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
