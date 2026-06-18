'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const REVIEW_PATH = path.join(__dirname, 'output', 'crea_match_review.csv');
const BATCH_SIZE = 10;
const WRITABLE_STATUSES = new Set(['APPROVED', 'APPROVED_LINK_ONLY']);
const EXPECTED_COUNTS = {
  APPROVED: 6,
  APPROVED_LINK_ONLY: 21,
  REJECTED: 2,
};

const getSupabase = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const cleanText = (value) => String(value ?? '').trim();

const loadReviewRows = () => {
  if (!fs.existsSync(REVIEW_PATH)) {
    throw new Error(`Review CSV not found: ${REVIEW_PATH}`);
  }
  const workbook = XLSX.readFile(REVIEW_PATH, { raw: false });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(firstSheet, { defval: '', raw: false }).map((row) => ({
    id: Number(row.dubi_id),
    name: cleanText(row.dubi_name),
    creaCode: cleanText(row.crea_code),
    creaName: cleanText(row.crea_name),
    matchScore: Number(row.match_score),
    reviewStatus: cleanText(row.review_status).toUpperCase(),
    reviewNotes: cleanText(row.review_notes),
  }));
};

const validateReviewRows = (rows) => {
  const counts = { APPROVED: 0, APPROVED_LINK_ONLY: 0, REJECTED: 0 };
  const seenIds = new Set();

  for (const row of rows) {
    if (!Number.isInteger(row.id) || row.id <= 0) {
      throw new Error(`Invalid dubi_id in review CSV: ${row.id}`);
    }
    if (seenIds.has(row.id)) throw new Error(`Duplicate dubi_id in review CSV: ${row.id}`);
    seenIds.add(row.id);
    if (!(row.reviewStatus in counts)) {
      throw new Error(`Unsupported review_status for id ${row.id}: ${row.reviewStatus || '(empty)'}`);
    }
    if (WRITABLE_STATUSES.has(row.reviewStatus)) {
      if (!row.creaCode || !row.creaName) {
        throw new Error(`Missing CREA reference for approved id ${row.id}`);
      }
      if (!Number.isFinite(row.matchScore) || row.matchScore < 0 || row.matchScore > 100) {
        throw new Error(`Invalid match_score for id ${row.id}: ${row.matchScore}`);
      }
    }
    counts[row.reviewStatus] += 1;
  }

  for (const [status, expected] of Object.entries(EXPECTED_COUNTS)) {
    if (counts[status] !== expected) {
      throw new Error(`Expected ${expected} ${status} rows, found ${counts[status]}`);
    }
  }
  return counts;
};

const normalizeName = (value) => cleanText(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const appendCreaNote = (existingNotes, reviewNotes) => {
  const existing = cleanText(existingNotes);
  if (!reviewNotes) return existing;
  const marker = `[CREA match note: ${reviewNotes}]`;
  if (existing.includes(marker)) return existing;
  return [existing, marker].filter(Boolean).join('\n').trim();
};

const loadDatabaseRows = async (supabase, ids) => {
  const { data, error } = await supabase
    .from('ingredients')
    .select('id,name,notes')
    .in('id', ids)
    .order('id', { ascending: true });
  if (error) throw error;
  return new Map((data || []).map((row) => [Number(row.id), row]));
};

const validateDatabaseRows = (reviewRows, databaseRows) => {
  for (const row of reviewRows) {
    const databaseRow = databaseRows.get(row.id);
    if (!databaseRow) throw new Error(`Ingredient id ${row.id} is missing from the database`);
    if (normalizeName(databaseRow.name) !== normalizeName(row.name)) {
      throw new Error(
        `Ingredient name mismatch for id ${row.id}: CSV="${row.name}", DB="${databaseRow.name}"`
      );
    }
  }
};

const updateRow = async (supabase, row, databaseRow, verifiedAt) => {
  const payload = {
    source_food_id: row.creaCode,
    source_food_name: row.creaName,
    source_confidence: Math.round((row.matchScore / 100) * 100) / 100,
    last_verified_at: verifiedAt,
  };

  if (row.reviewStatus === 'APPROVED_LINK_ONLY' && row.reviewNotes) {
    payload.notes = appendCreaNote(databaseRow.notes, row.reviewNotes);
  }

  const { data, error } = await supabase
    .from('ingredients')
    .update(payload)
    .eq('id', row.id)
    .select('id');
  if (error) throw error;
  if (!data || data.length !== 1) throw new Error(`Expected one updated row, received ${data?.length || 0}`);
};

const writeApprovedRows = async (supabase, rows, databaseRows) => {
  const verifiedAt = new Date().toISOString();
  const summary = { APPROVED: 0, APPROVED_LINK_ONLY: 0, errors: [] };

  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE);
    const results = await Promise.all(batch.map(async (row) => {
      try {
        await updateRow(supabase, row, databaseRows.get(row.id), verifiedAt);
        return { row, ok: true };
      } catch (error) {
        return { row, ok: false, error };
      }
    }));

    for (const result of results) {
      if (result.ok) summary[result.row.reviewStatus] += 1;
      else {
        summary.errors.push({
          id: result.row.id,
          name: result.row.name,
          message: result.error.message,
        });
      }
    }
    console.log(`Processed ${Math.min(index + BATCH_SIZE, rows.length)}/${rows.length} approved rows`);
  }
  return summary;
};

const verifyWrittenRows = async (supabase, approvedIds) => {
  const { data, error } = await supabase
    .from('ingredients')
    .select('id,name,source_food_id,source_food_name,source_confidence,last_verified_at')
    .in('id', approvedIds)
    .not('source_food_id', 'is', null)
    .order('id', { ascending: true });
  if (error) throw error;
  return data || [];
};

const main = async () => {
  const reviewRows = loadReviewRows();
  validateReviewRows(reviewRows);

  const supabase = getSupabase();
  const databaseRows = await loadDatabaseRows(supabase, reviewRows.map((row) => row.id));
  validateDatabaseRows(reviewRows, databaseRows);

  const rejectedRows = reviewRows.filter((row) => row.reviewStatus === 'REJECTED');
  for (const row of rejectedRows) {
    console.log(`Skipped REJECTED id ${row.id} ${row.name}: ${row.reviewNotes || 'no reason provided'}`);
  }

  const approvedRows = reviewRows.filter((row) => WRITABLE_STATUSES.has(row.reviewStatus));
  const result = await writeApprovedRows(supabase, approvedRows, databaseRows);
  const verified = await verifyWrittenRows(supabase, approvedRows.map((row) => row.id));

  console.log('\nCREA source write complete');
  console.log('--------------------------');
  console.log(`APPROVED written:      ${result.APPROVED}`);
  console.log(`APPROVED_LINK_ONLY:   ${result.APPROVED_LINK_ONLY}`);
  console.log(`REJECTED (skipped):    ${rejectedRows.length}`);
  for (const row of rejectedRows) {
    console.log(`  - id ${row.id} ${row.name} (${row.reviewNotes || 'no reason provided'})`);
  }
  console.log(`Errors:                 ${result.errors.length}`);
  for (const error of result.errors) {
    console.error(`  - id ${error.id} ${error.name}: ${error.message}`);
  }

  console.log('\nVerification samples:');
  console.table(verified.slice(0, 5));
  console.log(`Verified approved CREA links: ${verified.length}/${approvedRows.length}`);

  if (result.errors.length > 0 || verified.length !== approvedRows.length) {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error('CREA source write failed:', error);
  process.exitCode = 1;
});
