'use strict';

require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const { SEASONALITY } = require('../config/seasonality');

const APPLY = process.argv.includes('--apply');
const FAIL_ON_MISSING = process.argv.includes('--fail-on-missing');
const PAGE_SIZE = 500;

const normalizeToken = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const normalizeRegions = (regions = ['all']) => {
  const list = Array.isArray(regions) ? regions : [regions];
  const clean = list
    .map((region) => String(region || '').trim())
    .filter(Boolean);
  return clean.length > 0 ? clean : ['all'];
};

const seasonalityKey = (row = {}) =>
  [
    row.ingredient_id,
    String(row.country || 'IT').toUpperCase(),
    normalizeRegions(row.regions).map(normalizeToken).sort().join('|')
  ].join('::');

const getSupabaseClient = () => {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!url) throw new Error('SUPABASE_URL is required');
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_KEY is required');

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const fetchAll = async (supabase, table, select, queryBuilder) => {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    let query = supabase
      .from(table)
      .select(select)
      .order('id', { ascending: true })
      .range(from, to);

    if (queryBuilder) query = queryBuilder(query);

    const { data, error } = await query;
    if (error) throw error;

    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
};

const ingredientSearchText = (ingredient = {}) =>
  normalizeToken([
    ingredient.seasonal_key,
    ingredient.name,
    ingredient.name_en,
    ingredient.category,
  ].filter(Boolean).join(' '));

const findDefaultRule = (ingredient = {}) => {
  const text = ingredientSearchText(ingredient);
  if (!text) return null;

  return SEASONALITY.defaultProduceRules.find((rule) => {
    if (rule.category !== ingredient.category) return false;
    return Array.from(rule.patterns || []).some((pattern) => {
      const normalizedPattern = normalizeToken(pattern);
      return normalizedPattern && text.includes(normalizedPattern);
    });
  }) || null;
};

const buildSeedRow = (ingredient, rule) => ({
  ingredient_id: ingredient.id,
  country: String(rule.country || SEASONALITY.defaultLocation.country || 'IT').toUpperCase(),
  regions: normalizeRegions(rule.regions),
  months: Array.from(rule.months || []).map(Number).filter((month) => month >= 1 && month <= 12),
  hemisphere: rule.hemisphere || SEASONALITY.defaultLocation.hemisphere || 'north',
  climate_area: rule.climate_area || rule.climateArea || SEASONALITY.defaultLocation.climateArea || 'mediterranean',
  notes: `Seeded from ${SEASONALITY.source} ${SEASONALITY.version}`,
});

const summarizeMissing = (missing = []) => {
  if (!missing.length) return;
  console.log('\nMissing seasonality rules for active produce ingredients:');
  for (const ingredient of missing) {
    console.log(`- #${ingredient.id} ${ingredient.name} (${ingredient.category})`);
  }
};

const applySeedRows = async (supabase, rows = []) => {
  if (!rows.length) return { inserted: 0, updated: 0 };

  const ingredientIds = [...new Set(rows.map((row) => row.ingredient_id))];
  const existing = await fetchAll(
    supabase,
    'ingredient_seasonality',
    'id,ingredient_id,country,regions',
    (query) => query.in('ingredient_id', ingredientIds)
  );
  const existingByKey = new Map(existing.map((row) => [seasonalityKey(row), row]));
  const inserts = [];
  const updates = [];

  for (const row of rows) {
    const existingRow = existingByKey.get(seasonalityKey(row));
    if (existingRow) {
      updates.push({ id: existingRow.id, row });
    } else {
      inserts.push(row);
    }
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from('ingredient_seasonality').insert(inserts);
    if (error) throw error;
  }

  for (const update of updates) {
    const { error } = await supabase
      .from('ingredient_seasonality')
      .update({
        months: update.row.months,
        hemisphere: update.row.hemisphere,
        climate_area: update.row.climate_area,
        notes: update.row.notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', update.id);
    if (error) throw error;
  }

  return { inserted: inserts.length, updated: updates.length };
};

const run = async () => {
  const supabase = getSupabaseClient();
  const produce = await fetchAll(
    supabase,
    'ingredients',
    'id,name,name_en,category,seasonal_key,is_active',
    (query) => query
      .in('category', SEASONALITY.categoriesRequiringSeasonality)
      .eq('is_active', true)
  );

  const matched = [];
  const missing = [];

  for (const ingredient of produce) {
    const rule = findDefaultRule(ingredient);
    if (!rule) {
      missing.push(ingredient);
      continue;
    }

    const row = buildSeedRow(ingredient, rule);
    if (row.months.length === 0) {
      missing.push(ingredient);
      continue;
    }

    matched.push({ ingredient, row });
  }

  const rows = matched.map((entry) => entry.row);
  const summary = {
    mode: APPLY ? 'apply' : 'dry_run',
    produceTotal: produce.length,
    matched: matched.length,
    missing: missing.length,
    version: SEASONALITY.version,
    source: SEASONALITY.source,
  };

  console.log(JSON.stringify(summary, null, 2));
  summarizeMissing(missing);

  if (APPLY) {
    const result = await applySeedRows(supabase, rows);
    console.log(`\nApplied ingredient_seasonality rows: inserted=${result.inserted}, updated=${result.updated}`);
  } else {
    console.log('\nDry run only. Re-run with --apply to write ingredient_seasonality rows.');
  }

  if (FAIL_ON_MISSING && missing.length > 0) {
    process.exitCode = 1;
  }
};

run().catch((error) => {
  console.error('Seasonality seed/audit failed:', error.message);
  process.exitCode = 1;
});
