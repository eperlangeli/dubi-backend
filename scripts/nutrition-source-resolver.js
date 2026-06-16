'use strict';

require('dotenv').config();

const { searchFood: searchCreaFood } = require('./crea-client');
const { searchFood: searchCiqualFood } = require('./ciqual-client');
const { searchUsdaFood } = require('../services/usda-client');

const DEFAULT_MIN_CONFIDENCE = 0.7;
let warnedUsdaError = false;

const roundConfidence = (value, fallback = 0) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.round(Math.max(0, Math.min(1, number)) * 100) / 100;
};

const buildLocalResult = (source, record) => ({
  found: true,
  source,
  raw_source_id: source,
  source_food_id: String(record.id),
  source_food_name: record.name_it || record.name,
  source_confidence: roundConfidence(record.score),
  data: {
    calories: record.calories,
    protein_g: record.protein_g,
    carbs_g: record.carbs_g,
    fat_g: record.fat_g,
    fiber_g: record.fiber_g,
    micronutrients: record.micronutrients || {},
  },
});

const buildUsdaResult = (record) => ({
  found: true,
  source: 'usda',
  raw_source_id: record.source_id || 'usda_foundation',
  source_food_id: record.source_food_id,
  source_food_name: record.source_food_name,
  source_confidence: roundConfidence(record.source_id === 'usda_foundation' ? 0.86 : 0.82),
  data: {
    calories: Number(record.calories_per_100g || 0),
    protein_g: Number(record.protein_per_100g || 0),
    carbs_g: Number(record.carbs_per_100g || 0),
    fat_g: Number(record.fats_per_100g || 0),
    fiber_g: Number(record.fiber_per_100g || 0),
    micronutrients: {},
  },
});

const notFoundResult = () => ({
  found: false,
  source: null,
  source_food_id: null,
  source_food_name: null,
  source_confidence: 0,
  data: null,
});

const pickBestCandidate = (candidates) => {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  return candidates
    .filter((candidate) => candidate && Number.isFinite(Number(candidate.score)))
    .sort((a, b) => Number(b.score) - Number(a.score))[0] || null;
};

async function resolveIngredient(ingredientName, options = {}) {
  const query = String(ingredientName || '').trim();
  const minConfidence = Number.isFinite(Number(options.minConfidence))
    ? Number(options.minConfidence)
    : DEFAULT_MIN_CONFIDENCE;

  if (!query) return notFoundResult();

  const localSources = [
    ['crea', searchCreaFood],
    ['ciqual', searchCiqualFood],
  ];

  for (const [source, searchFood] of localSources) {
    const matches = await Promise.resolve(searchFood(query, { limit: 3 }));
    const best = pickBestCandidate(matches);
    if (best && Number(best.score) >= minConfidence) {
      return buildLocalResult(source, best);
    }
  }

  try {
    const usdaMatches = await searchUsdaFood(query, { pageSize: 3 });
    const bestUsda = Array.isArray(usdaMatches) && usdaMatches[0] ? usdaMatches[0] : null;
    if (bestUsda) return buildUsdaResult(bestUsda);
  } catch (error) {
    if (!warnedUsdaError) {
      console.warn(`[nutrition-source-resolver] USDA lookup unavailable: ${error.message}`);
      warnedUsdaError = true;
    }
  }

  return notFoundResult();
}

async function resolveAndUpdate(supabaseClient, ingredientId, ingredientName, options = {}) {
  if (!supabaseClient) {
    throw new Error('resolveAndUpdate requires a Supabase client');
  }

  const resolved = await resolveIngredient(ingredientName, options);
  if (!resolved.found) {
    return { updated: false, reason: 'not_found', resolved };
  }

  const payload = {
    source_id: resolved.raw_source_id || resolved.source,
    source_food_id: resolved.source_food_id,
    source_food_name: resolved.source_food_name,
    source_confidence: resolved.source_confidence,
    last_verified_at: new Date().toISOString(),
    calories_per_100g: resolved.data.calories,
    protein_g: resolved.data.protein_g,
    carbs_g: resolved.data.carbs_g,
    fat_g: resolved.data.fat_g,
    fiber_g: resolved.data.fiber_g,
    micronutrients: resolved.data.micronutrients || {},
  };

  if (resolved.data.gi_numeric !== undefined && resolved.data.gi_numeric !== null) {
    payload.gi_numeric = resolved.data.gi_numeric;
  }
  if (resolved.data.polyphenols_mg !== undefined && resolved.data.polyphenols_mg !== null) {
    payload.polyphenols_mg = resolved.data.polyphenols_mg;
  }

  if (options.dryRun) {
    return { updated: false, dryRun: true, payload, resolved };
  }

  const { error, data } = await supabaseClient
    .from('ingredients')
    .update(payload)
    .eq('id', ingredientId)
    .select('id,name,source_id,source_food_id,source_food_name,source_confidence')
    .single();

  if (error) throw error;

  return { updated: true, dryRun: false, payload, resolved, row: data };
}

module.exports = {
  resolveIngredient,
  resolveAndUpdate,
};
