'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const APPLY = process.argv.includes('--apply');
const BATCH_SIZE = 20;
const OUTPUT_DIR = path.join(__dirname, 'output');
const AUDIT_PATH = path.join(OUTPUT_DIR, 'source_id_audit.csv');
const REPORT_PATH = path.join(OUTPUT_DIR, 'source_id_cleanup_report.txt');

const RECOGNIZED_SOURCE_IDS = new Set([
  'usda',
  'usda_foundation',
  'usda_sr_legacy',
  'crea',
  'ciqual',
  'bls',
  'eurofir',
  'producer_barcode',
]);

const csvCell = (value) => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const classifySourceId = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return 'valid';
  const text = String(value).trim();
  const normalized = text.toLowerCase();
  if (RECOGNIZED_SOURCE_IDS.has(normalized)) return 'valid';
  if (/^\d{4,10}$/.test(text)) return 'valid';
  if (/^[A-Z]\d{3,}$/i.test(text)) return 'valid';
  return 'invalid';
};

const appendOriginalSourceToNotes = (notes, sourceId) => {
  const marker = `[source_id original: ${String(sourceId).trim()}]`;
  const existing = String(notes || '').trim();
  if (existing.includes(marker)) return existing;
  return [existing, marker].filter(Boolean).join('\n');
};

const getClient = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const loadIngredients = async (supabase) => {
  const { data, error } = await supabase
    .from('ingredients')
    .select('id,name,source_id,source_food_id,source_food_name,notes')
    .order('id', { ascending: true });
  if (error) throw error;
  return data || [];
};

const writeAudit = (rows) => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const header = ['id', 'name', 'source_id_old', 'source_food_id', 'classification', 'action'];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push([
      row.id,
      row.name,
      row.source_id,
      row.source_food_id,
      row.classification,
      row.action,
    ].map(csvCell).join(','));
  }
  fs.writeFileSync(AUDIT_PATH, `${lines.join('\n')}\n`, 'utf8');
};

const updateInvalidRows = async (supabase, rows) => {
  let updated = 0;
  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE);
    const results = await Promise.all(batch.map(async (row) => {
      const { error } = await supabase
        .from('ingredients')
        .update({
          source_id: null,
          notes: appendOriginalSourceToNotes(row.notes, row.source_id),
        })
        .eq('id', row.id);
      if (error) throw new Error(`Ingredient ${row.id} (${row.name}): ${error.message}`);
      return row.id;
    }));
    updated += results.length;
    console.log(`Updated ${updated}/${rows.length}`);
  }
  return updated;
};

const buildReport = ({ total, valid, invalid, updated, samples }) => {
  const lines = [
    'DUBI source_id cleanup report',
    '=============================',
    `Mode: ${APPLY ? 'APPLY' : 'AUDIT ONLY'}`,
    `Total rows processed: ${total}`,
    `Rows kept unchanged: ${valid}`,
    `Rows classified invalid: ${invalid}`,
    `Rows cleared: ${updated}`,
    '',
    'Sample rows classified for cleanup:',
    ...samples.map((row) => `- ${row.id} | ${row.name} | ${row.source_id}`),
    '',
    `Audit CSV: ${AUDIT_PATH}`,
  ];
  return `${lines.join('\n')}\n`;
};

const main = async () => {
  const supabase = getClient();
  const ingredients = await loadIngredients(supabase);
  const audited = ingredients.map((row) => {
    const classification = classifySourceId(row.source_id);
    return {
      ...row,
      classification,
      action: classification === 'invalid' ? 'clear' : 'keep',
    };
  });
  const invalidRows = audited.filter((row) => row.classification === 'invalid');
  const validRows = audited.filter((row) => row.classification === 'valid');

  writeAudit(audited);
  console.log(`Audit written before updates: ${AUDIT_PATH}`);
  console.log(`Total: ${audited.length} | Valid: ${validRows.length} | Invalid: ${invalidRows.length}`);

  const updated = APPLY ? await updateInvalidRows(supabase, invalidRows) : 0;
  const report = buildReport({
    total: audited.length,
    valid: validRows.length,
    invalid: invalidRows.length,
    updated,
    samples: invalidRows.slice(0, 3),
  });
  fs.writeFileSync(REPORT_PATH, report, 'utf8');
  console.log(report);

  if (!APPLY && invalidRows.length > 0) {
    console.log('No database changes were made. Re-run with --apply after reviewing the CSV.');
  }
};

main().catch((error) => {
  console.error('source_id cleanup failed:', error);
  process.exitCode = 1;
});
