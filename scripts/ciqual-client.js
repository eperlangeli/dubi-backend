'use strict';

const fs = require('fs');
const XLSX = require('xlsx');

const CIQUAL_PATH_ENV = 'CIQUAL_XLS_PATH';
const SOURCE_ID = 'ciqual';

let cachedRows = null;
let warnedMissing = false;

const normalize = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const keyOf = (value = '') => normalize(value).replace(/\s+/g, '');

const splitTokens = (value = '') =>
  normalize(value).split(/\s+/).filter((token) => token.length > 1);

const parseNumber = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value)
    .replace(/\u00a0/g, ' ')
    .replace(',', '.')
    .trim();
  if (!text || text === '-' || /^tr$/i.test(text) || /^nd$/i.test(text)) return null;
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
};

const aliases = {
  id: ['alim_code', 'code', 'id', 'food code'],
  nameFr: ['alim_nom_fr', 'nom_fr', 'libelle_fr', 'nom francais', 'name_fr'],
  nameEn: ['alim_nom_en', 'nom_en', 'english_name', 'name_en', 'food name'],
  calories: ['energie,reglement ue (kcal/100 g)', 'energie (kcal/100 g)', 'energie,kcal', 'energie (kcal)', 'kcal'],
  protein: ['proteines (g/100 g)', 'proteines', 'protein'],
  carbs: ['glucides (g/100 g)', 'glucides', 'carbohydrates'],
  fat: ['lipides (g/100 g)', 'lipides', 'fat'],
  fiber: ['fibres alimentaires (g/100 g)', 'fibres alimentaires', 'fibres', 'fiber'],
  vitaminC: ['vitamine c (mg/100 g)', 'vitamine c', 'vitamin c'],
  iron: ['fer (mg/100 g)', 'fer', 'iron'],
  calcium: ['calcium (mg/100 g)', 'calcium'],
  magnesium: ['magnesium (mg/100 g)', 'magnesium', 'magnesio'],
  potassium: ['potassium (mg/100 g)', 'potassium'],
  sodium: ['sodium (mg/100 g)', 'sodium'],
  zinc: ['zinc (mg/100 g)', 'zinc'],
  b12: ['vitamine b12 (ug/100 g)', 'vitamine b12'],
  vitaminD: ['vitamine d (ug/100 g)', 'vitamine d'],
};

const buildHeaderMap = (headers) => {
  const map = new Map();
  headers.forEach((header, index) => {
    const key = keyOf(header);
    if (key && !map.has(key)) map.set(key, index);
  });
  return map;
};

const findIndex = (headerMap, names) => {
  for (const name of names) {
    const exact = keyOf(name);
    if (headerMap.has(exact)) return headerMap.get(exact);
  }

  for (const [headerKey, index] of headerMap.entries()) {
    if (names.some((name) => headerKey.includes(keyOf(name)))) return index;
  }

  return -1;
};

const cell = (row, headerMap, names) => {
  const index = findIndex(headerMap, names);
  return index >= 0 ? row[index] : null;
};

const getMicronutrients = (row, headerMap) => {
  const specs = [
    ['vitamin_c_mg', aliases.vitaminC],
    ['iron_mg', aliases.iron],
    ['calcium_mg', aliases.calcium],
    ['magnesium_mg', aliases.magnesium],
    ['potassium_mg', aliases.potassium],
    ['sodium_mg', aliases.sodium],
    ['zinc_mg', aliases.zinc],
    ['vitamin_b12_ug', aliases.b12],
    ['vitamin_d_ug', aliases.vitaminD],
  ];
  const out = {};

  for (const [key, names] of specs) {
    const value = parseNumber(cell(row, headerMap, names));
    if (value !== null) out[key] = value;
  }

  return out;
};

const normalizeRecord = (row, headerMap) => {
  const id = String(cell(row, headerMap, aliases.id) || '').trim();
  const nameFr = String(cell(row, headerMap, aliases.nameFr) || '').trim();
  const nameEn = String(cell(row, headerMap, aliases.nameEn) || '').trim();
  const displayName = nameEn || nameFr;
  if (!displayName) return null;

  return {
    id: id || keyOf(displayName),
    name: displayName,
    name_it: nameFr || displayName,
    name_fr: nameFr || null,
    name_en: nameEn || null,
    calories: parseNumber(cell(row, headerMap, aliases.calories)),
    protein_g: parseNumber(cell(row, headerMap, aliases.protein)),
    carbs_g: parseNumber(cell(row, headerMap, aliases.carbs)),
    fat_g: parseNumber(cell(row, headerMap, aliases.fat)),
    fiber_g: parseNumber(cell(row, headerMap, aliases.fiber)),
    micronutrients: getMicronutrients(row, headerMap),
  };
};

const loadRows = () => {
  if (cachedRows) return cachedRows;

  const filePath = process.env[CIQUAL_PATH_ENV];
  if (!filePath || !fs.existsSync(filePath)) {
    if (!warnedMissing) {
      console.warn(`[ciqual-client] ${CIQUAL_PATH_ENV} is not set or file was not found; skipping CIQUAL lookup`);
      warnedMissing = true;
    }
    cachedRows = [];
    return cachedRows;
  }

  const workbook = XLSX.readFile(filePath);
  let rows = null;
  let headerIndex = -1;

  for (const sheetName of workbook.SheetNames) {
    const candidateRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: null });
    const candidateHeaderIndex = candidateRows.findIndex((row) =>
      row.some((value) => keyOf(value) === 'alimcode' || keyOf(value).includes('alimnomfr'))
    );
    if (candidateHeaderIndex >= 0) {
      rows = candidateRows;
      headerIndex = candidateHeaderIndex;
      break;
    }
  }

  if (!rows || headerIndex < 0) {
    console.warn('[ciqual-client] Could not find a valid header row in CIQUAL workbook');
    cachedRows = [];
    return cachedRows;
  }

  const headerMap = buildHeaderMap(rows[headerIndex]);
  cachedRows = rows
    .slice(headerIndex + 1)
    .map((row) => normalizeRecord(row, headerMap))
    .filter((record) =>
      record &&
      record.calories !== null &&
      record.protein_g !== null &&
      record.carbs_g !== null &&
      record.fat_g !== null
    );

  return cachedRows;
};

const tokenOverlapScore = (query, candidate) => {
  const queryTokens = splitTokens(query);
  const candidateTokens = splitTokens(candidate);
  if (!queryTokens.length || !candidateTokens.length) return 0;

  const candidateSet = new Set(candidateTokens);
  const matched = queryTokens.filter((token) => candidateSet.has(token)).length;
  const containmentBoost = normalize(candidate).includes(normalize(query)) || normalize(query).includes(normalize(candidate)) ? 0.25 : 0;
  return Math.min(1, matched / Math.max(queryTokens.length, candidateTokens.length) + containmentBoost);
};

const scoreRecord = (query, record) => {
  const scores = [
    tokenOverlapScore(query, record.name),
    tokenOverlapScore(query, record.name_fr || ''),
    tokenOverlapScore(query, record.name_en || ''),
  ];
  return Math.max(...scores);
};

const searchFood = (name, { limit = 3 } = {}) => {
  const rows = loadRows();
  if (!rows.length) return null;

  return rows
    .map((record) => ({
      ...record,
      score: scoreRecord(name, record),
      source_id: SOURCE_ID,
    }))
    .filter((record) => record.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
};

const getById = (ciqualId) => {
  const rows = loadRows();
  if (!rows.length) return null;
  const id = String(ciqualId || '').trim();
  return rows.find((record) => String(record.id) === id) || null;
};

module.exports = {
  searchFood,
  getById,
};
