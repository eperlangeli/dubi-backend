'use strict';

const { searchUsdaFood } = require('./usda-client');
const { scoreIngredientReference } = require('./nutrition-brain');

// TODO: call resolveIngredientSource on insert when an admin ingredient route exists.

const PAGE_SIZE = 1000;
const SERVICE_KEY_ENV = ['SUPABASE', 'SERVICE', 'KEY'].join('_');

const getSupabaseConfig = () => ({
  url: (process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
  serviceKey: process.env[SERVICE_KEY_ENV],
});

const normalizeIngredientKey = (value = '') =>
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

const buildResolvedData = (reference) => ({
  source_id: reference.source_id,
  source_food_id: reference.source_food_id,
  source_food_name: reference.source_food_name,
  source_confidence: sourceConfidence(reference.confidence_score),
  macros: {
    calories_per_100g: Number(reference.calories_per_100g || 0),
    protein_g: Number(reference.protein_per_100g || 0),
    carbs_g: Number(reference.carbs_per_100g || 0),
    fat_g: Number(reference.fats_per_100g || 0),
    fiber_g: Number(reference.fiber_per_100g || 0),
  },
});

const supabaseFetch = async (path, options = {}) => {
  const { url, serviceKey } = getSupabaseConfig();
  if (!url || !serviceKey) {
    throw new Error(`SUPABASE_URL and ${SERVICE_KEY_ENV} are required for ingredient source resolution`);
  }

  const response = await fetch(`${url}/rest/v1/${path}`, {
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

const fetchAllRefs = async () => {
  const rows = [];
  const select = 'ingredient_key,display_name,source_id,source_food_id,source_food_name,calories_per_100g,protein_per_100g,carbs_per_100g,fats_per_100g,fiber_per_100g,confidence_score';

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const batch = await supabaseFetch(`nutrition_ingredient_refs?select=${encodeURIComponent(select)}`, {
      headers: {
        Range: `${from}-${to}`,
        Prefer: 'count=exact',
      },
    });
    const page = Array.isArray(batch) ? batch : [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows
    .map((reference) => ({
      ...reference,
      normalizedIngredientKey: normalizeIngredientKey(reference.ingredient_key || reference.display_name),
    }))
    .filter((reference) => reference.normalizedIngredientKey)
    .sort((a, b) => Number(b.confidence_score || 0) - Number(a.confidence_score || 0));
};

const findLocalReference = async (ingredientName) => {
  const key = normalizeIngredientKey(ingredientName);
  if (!key) return null;

  const refs = await fetchAllRefs();
  return refs.find((reference) => reference.normalizedIngredientKey === key) ||
    refs.find((reference) =>
      reference.normalizedIngredientKey.includes(key) ||
      key.includes(reference.normalizedIngredientKey)
    ) ||
    null;
};

const saveUsdaReference = async (ingredientName, reference, confidenceScore) => {
  const ingredientKey = normalizeIngredientKey(ingredientName);
  const payload = {
    ingredient_key: ingredientKey,
    display_name: ingredientName,
    source_id: reference.source_id,
    source_food_id: reference.source_food_id,
    source_food_name: reference.source_food_name,
    locale: 'global',
    preparation_state: 'generic',
    calories_per_100g: reference.calories_per_100g,
    protein_per_100g: reference.protein_per_100g,
    carbs_per_100g: reference.carbs_per_100g,
    fats_per_100g: reference.fats_per_100g,
    fiber_per_100g: reference.fiber_per_100g,
    confidence_score: confidenceScore,
    source_payload: reference,
    updated_at: new Date().toISOString(),
  };

  const response = await supabaseFetch('nutrition_ingredient_refs?on_conflict=ingredient_key,source_id,source_food_id,preparation_state', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(payload),
  });

  return Array.isArray(response) && response[0] ? response[0] : payload;
};

async function resolveIngredientSource(ingredientName) {
  const localReference = await findLocalReference(ingredientName);
  if (localReference) return buildResolvedData(localReference);

  const usdaResults = await searchUsdaFood(ingredientName, { pageSize: 5 });
  const best = usdaResults[0];
  if (!best) return null;

  const confidenceScore = scoreIngredientReference({
    ...best,
    preparation_match: false,
    locale_match: false,
  });
  const confidence = sourceConfidence(confidenceScore);
  if (confidence === null || confidence < 0.7) return null;

  const saved = await saveUsdaReference(ingredientName, best, confidenceScore);
  return buildResolvedData(saved);
}

module.exports = {
  resolveIngredientSource,
  normalizeIngredientKey,
};
