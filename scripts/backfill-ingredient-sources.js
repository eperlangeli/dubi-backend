'use strict';

require('dotenv').config();

const DRY_RUN = process.argv.includes('--dry-run');
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY_ENV = ['SUPABASE', 'SERVICE', 'KEY'].join('_');
const serviceKey = process.env[SERVICE_KEY_ENV];
const PAGE_SIZE = 1000;

const requiredEnv = () => {
  if (!SUPABASE_URL) throw new Error('SUPABASE_URL is required');
  if (!serviceKey) throw new Error(`${SERVICE_KEY_ENV} is required`);
};

const normalizeKey = (value = '') =>
  String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b\d+(?:[.,-]\d+)?\s*%/g, ' ')
    .replace(/[^a-z0-9\s_]/g, ' ')
    .replace(/[_\s]+/g, '_')
    .replace(/^_+|_+$/g, '');

const sourceConfidence = (score) => {
  const value = Number(score);
  if (!Number.isFinite(value)) return null;
  return Math.round(Math.max(0, Math.min(1, value > 1 ? value / 100 : value)) * 100) / 100;
};

const numberOrNull = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const supabaseFetch = async (path, options = {}) => {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase request failed ${response.status}: ${text.slice(0, 300)}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
};

const fetchAll = async (table, select) => {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const page = await supabaseFetch(`${table}?select=${encodeURIComponent(select)}`, {
      headers: {
        Range: `${from}-${to}`,
        Prefer: 'count=exact',
      },
    });
    const batch = Array.isArray(page) ? page : [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
};

const findReference = (ingredient, refs) => {
  const ingredientKey = normalizeKey(ingredient.name);
  if (!ingredientKey) return null;

  const exact = refs.find((ref) => ref.normalizedIngredientKey === ingredientKey);
  if (exact) return exact;

  return refs.find((ref) =>
    ref.normalizedIngredientKey.includes(ingredientKey) ||
    ingredientKey.includes(ref.normalizedIngredientKey)
  ) || null;
};

const buildUpdatePayload = (ingredient, reference) => {
  const confidence = sourceConfidence(reference.confidence_score);
  const payload = {
    source_id: reference.source_id,
    source_food_id: reference.source_food_id,
    source_food_name: reference.source_food_name,
    source_confidence: confidence,
    last_verified_at: new Date().toISOString(),
  };

  if (!ingredient.nutritionist_validated && confidence !== null && confidence > 0.85) {
    const calories = numberOrNull(reference.calories_per_100g);
    const protein = numberOrNull(reference.protein_per_100g);
    const carbs = numberOrNull(reference.carbs_per_100g);
    const fat = numberOrNull(reference.fats_per_100g);
    const fiber = numberOrNull(reference.fiber_per_100g);

    if (calories !== null) payload.calories_per_100g = calories;
    if (protein !== null) payload.protein_g = protein;
    if (carbs !== null) payload.carbs_g = carbs;
    if (fat !== null) payload.fat_g = fat;
    if (fiber !== null) payload.fiber_g = fiber;
  }

  return payload;
};

const updateIngredient = async (id, payload) => {
  await supabaseFetch(`ingredients?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(payload),
  });
};

const run = async () => {
  requiredEnv();

  const ingredients = await fetchAll(
    'ingredients',
    'id,name,calories_per_100g,protein_g,carbs_g,fat_g,fiber_g,nutritionist_validated'
  );
  const refs = await fetchAll(
    'nutrition_ingredient_refs',
    'ingredient_key,display_name,source_id,source_food_id,source_food_name,calories_per_100g,protein_per_100g,carbs_per_100g,fats_per_100g,fiber_per_100g,confidence_score,updated_at'
  );

  const normalizedRefs = refs
    .map((ref) => ({
      ...ref,
      normalizedIngredientKey: normalizeKey(ref.ingredient_key || ref.display_name),
    }))
    .filter((ref) => ref.normalizedIngredientKey)
    .sort((a, b) => Number(b.confidence_score || 0) - Number(a.confidence_score || 0));

  const summary = {
    dryRun: DRY_RUN,
    ingredients: ingredients.length,
    references: normalizedRefs.length,
    matched: 0,
    unmatched: 0,
    macrosUpdated: 0,
    sourceOnly: 0,
    unmatchedNames: [],
  };

  for (const ingredient of ingredients) {
    const reference = findReference(ingredient, normalizedRefs);
    if (!reference) {
      summary.unmatched += 1;
      summary.unmatchedNames.push(ingredient.name);
      continue;
    }

    const payload = buildUpdatePayload(ingredient, reference);
    const updatesMacros = Object.prototype.hasOwnProperty.call(payload, 'protein_g') ||
      Object.prototype.hasOwnProperty.call(payload, 'carbs_g') ||
      Object.prototype.hasOwnProperty.call(payload, 'fat_g') ||
      Object.prototype.hasOwnProperty.call(payload, 'calories_per_100g');

    summary.matched += 1;
    if (updatesMacros) summary.macrosUpdated += 1;
    else summary.sourceOnly += 1;

    const line = `${DRY_RUN ? 'MATCH' : 'UPDATE'} ${ingredient.name} -> ${reference.source_food_name} (${reference.source_id}, confidence=${payload.source_confidence ?? 'n/a'})${updatesMacros ? ' +macros' : ''}`;
    console.log(line);

    if (!DRY_RUN) {
      await updateIngredient(ingredient.id, payload);
    }
  }

  console.log(JSON.stringify(summary, null, 2));
  if (summary.unmatchedNames.length) {
    console.log('Unmatched ingredients:');
    for (const name of summary.unmatchedNames) console.log(`- ${name}`);
  }
};

run().catch((error) => {
  console.error('Ingredient source backfill failed:', error);
  process.exitCode = 1;
});
