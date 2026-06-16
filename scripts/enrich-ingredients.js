'use strict';

require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const { resolveAndUpdate } = require('./nutrition-source-resolver');

const DRY_RUN = process.argv.includes('--dry-run');
const PAGE_SIZE = 200;

const getSupabaseClient = () => {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!url) throw new Error('SUPABASE_URL is required');
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_KEY is required');

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const fetchIngredientsWithoutSource = async (supabase) => {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('ingredients')
      .select('id,name,source_id')
      .is('source_id', null)
      .order('id', { ascending: true })
      .range(from, to);

    if (error) throw error;
    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
};

const run = async () => {
  const supabase = getSupabaseClient();
  const ingredients = await fetchIngredientsWithoutSource(supabase);
  const summary = {
    total: ingredients.length,
    resolved: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  for (const ingredient of ingredients) {
    const name = String(ingredient.name || '').trim();
    if (!name) {
      summary.skipped += 1;
      continue;
    }

    try {
      const result = await resolveAndUpdate(supabase, ingredient.id, name, { dryRun: DRY_RUN });
      if (result.resolved && result.resolved.found) {
        summary.resolved += 1;
        const action = DRY_RUN ? 'DRY' : 'SAVE';
        console.log(`${action} ${ingredient.id} ${name} -> ${result.resolved.source_food_name} (${result.resolved.source}, confidence=${result.resolved.source_confidence})`);
      } else {
        summary.failed += 1;
        console.log(`MISS ${ingredient.id} ${name}`);
      }
    } catch (error) {
      summary.failed += 1;
      summary.errors.push({ id: ingredient.id, name, error: error.message });
      console.error(`ERROR ${ingredient.id} ${name}: ${error.message}`);
    }
  }

  console.log(`\n${DRY_RUN ? '[DRY RUN] ' : ''}Ingredients without source: ${summary.total}`);
  console.log(`Resolved: ${summary.resolved}`);
  console.log(`Failed: ${summary.failed}`);
  console.log(`Skipped: ${summary.skipped}`);
  console.log(`Errors: ${summary.errors.length}`);

  if (summary.errors.length) {
    console.log(JSON.stringify(summary.errors, null, 2));
    process.exitCode = 1;
  }
};

run().catch((error) => {
  console.error('Ingredient enrichment failed:', error);
  process.exitCode = 1;
});
