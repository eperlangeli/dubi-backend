'use strict';

const fs = require('fs');

const CREA_PATH_ENV = 'CREA_CSV_PATH';
const SOURCE_ID = 'crea';

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

const parseCsv = (text, delimiter = ';') => {
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
      if (row.some((value) => String(value || '').trim())) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((value) => String(value || '').trim())) rows.push(row);
  return rows;
};

const aliases = {
  id: ['codice', 'id', 'codice alimento', 'codicealimento', 'food code'],
  name: ['alimento', 'nome', 'nome alimento', 'descrizione', 'denominazione', 'name'],
  calories: ['energia kcal', 'energia(kcal)', 'kcal', 'calorie', 'energia'],
  protein: ['proteine', 'proteine g', 'protein', 'proteins'],
  carbs: ['carboidrati disponibili', 'carboidrati', 'glucidi', 'carbohydrate', 'carbs'],
  fat: ['lipidi', 'grassi', 'fat', 'fats'],
  fiber: ['fibra alimentare', 'fibra', 'fiber', 'fibre'],
  vitaminC: ['vitamina c', 'vit c', 'vitamin c'],
  iron: ['ferro', 'iron'],
  calcium: ['calcio', 'calcium'],
  magnesium: ['magnesio', 'magnesium'],
  potassium: ['potassio', 'potassium'],
  sodium: ['sodio', 'sodium'],
  zinc: ['zinco', 'zinc'],
  b12: ['vitamina b12', 'vit b12', 'cobalamina'],
  vitaminD: ['vitamina d', 'vit d'],
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
  const name = String(cell(row, headerMap, aliases.name) || '').trim();
  if (!name) return null;

  return {
    id: id || keyOf(name),
    name,
    name_it: name,
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

  const filePath = process.env[CREA_PATH_ENV];
  if (!filePath || !fs.existsSync(filePath)) {
    if (!warnedMissing) {
      console.warn(`[crea-client] ${CREA_PATH_ENV} is not set or file was not found; skipping CREA lookup`);
      warnedMissing = true;
    }
    cachedRows = [];
    return cachedRows;
  }

  const text = fs.readFileSync(filePath, 'utf8');
  const rows = parseCsv(text, ';');
  const headerIndex = rows.findIndex((row) =>
    row.some((value) => keyOf(value).includes('alimento') || keyOf(value) === 'nome')
  );
  if (headerIndex < 0) {
    console.warn('[crea-client] Could not find a valid header row in CREA CSV');
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

const searchFood = (name, { limit = 3 } = {}) => {
  const rows = loadRows();
  if (!rows.length) return null;

  return rows
    .map((record) => ({
      ...record,
      score: tokenOverlapScore(name, record.name_it || record.name),
      source_id: SOURCE_ID,
    }))
    .filter((record) => record.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
};

const getById = (creaId) => {
  const rows = loadRows();
  if (!rows.length) return null;
  const id = String(creaId || '').trim();
  return rows.find((record) => String(record.id) === id) || null;
};

module.exports = {
  searchFood,
  getById,
};
