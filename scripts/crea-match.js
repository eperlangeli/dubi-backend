'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const DATA_DIR = path.join(__dirname, 'data');
const OUTPUT_DIR = path.join(__dirname, 'output');
const REVIEW_PATH = path.join(OUTPUT_DIR, 'crea_match_review.csv');
const UNMATCHED_PATH = path.join(OUTPUT_DIR, 'crea_unmatched.csv');
const DEFAULT_DATASET_PATH = path.join(DATA_DIR, 'crea_dataset.xlsx');
const DATASET_PATH = process.env.CREA_XLS_PATH || process.env.CREA_CSV_PATH || DEFAULT_DATASET_PATH;
const CREA_SOURCE_PAGE = 'https://www.alimentinutrizione.it/tabelle-nutrizionali/ricerca-per-nutriente';
const CREA_API_URL = 'https://www.alimentinutrizione.it/index.php?option=com_ajax&plugin=Alidata&method=Alidata&format=json';
const CREA_NUTRIENTS = {
  '015': 'Energia (kcal)',
  '025': 'Proteine (g/100g)',
  '030': 'Lipidi (g/100g)',
  '040': 'Carboidrati disponibili (g/100g)',
  '060': 'Fibra totale (g/100g)',
};

const normalize = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bd['’]oliva\b/g, 'di oliva')
    .replace(/\bpomodori\b/g, 'pomodoro')
    .replace(/\bzucchine\b/g, 'zucchina')
    .replace(/\bpatate\b/g, 'patata')
    .replace(/\bcarote\b/g, 'carota')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const keyOf = (value) => normalize(value).replace(/\s+/g, '');
const tokens = (value) => normalize(value).split(' ').filter((token) => token.length > 1);

const parseNumber = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\u00a0/g, ' ').replace(',', '.').trim();
  if (!text || text === '-' || /^(tr|nd|n\/a)$/i.test(text)) return null;
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
};

const csvCell = (value) => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const aliases = {
  id: ['codice', 'id', 'codice alimento', 'food code'],
  name: ['alimento', 'nome', 'nome alimento', 'descrizione', 'denominazione'],
  category: ['categoria', 'gruppo', 'gruppo alimentare', 'category'],
  nameEn: ['nome inglese', 'english name', 'name en'],
  calories: ['energia kcal', 'energia (kcal)', 'kcal', 'calorie'],
  protein: ['proteine', 'proteine g', 'protein'],
  fat: ['lipidi', 'grassi', 'fat'],
  carbs: ['carboidrati disponibili', 'carboidrati', 'glucidi', 'carbohydrates'],
  fiber: ['fibra alimentare', 'fibra', 'fiber', 'fibre'],
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
    const key = keyOf(name);
    if (headerMap.has(key)) return headerMap.get(key);
  }
  for (const [key, index] of headerMap.entries()) {
    if (names.some((name) => key.includes(keyOf(name)))) return index;
  }
  return -1;
};

const cell = (row, headerMap, names) => {
  const index = findIndex(headerMap, names);
  return index >= 0 ? row[index] : null;
};

const levenshtein = (a, b) => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = previous[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + cost);
      diagonal = saved;
    }
  }
  return previous[b.length];
};

const similarity = (left, right) => {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  if (a === b) return 100;

  const editScore = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  const aTokens = tokens(a);
  const bTokens = tokens(b);
  const intersection = aTokens.filter((token) => bTokens.includes(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size || 1;
  const tokenScore = intersection / union;
  const containment = a.includes(b) || b.includes(a) ? 0.12 : 0;
  return Math.round(Math.min(1, editScore * 0.55 + tokenScore * 0.45 + containment) * 100);
};

const categoryCompatibility = (dubiCategory, creaCategory, creaName) => {
  const left = normalize(dubiCategory);
  const right = normalize(`${creaCategory || ''} ${creaName || ''}`);
  const groups = {
    fish: /pesce|pesc|mollusc|crostace|salmone|tonno|merluzzo/,
    meat: /carne|bovin|pollo|tacchin|suino|agnello/,
    vegetable: /verdura|ortagg|vegetal|zucchin|broccol|spinac|carot/,
    fruit: /frutta|mela|banana|aranc|pera|fragol/,
    grain: /cereal|pasta|riso|pane|avena|farina/,
    dairy: /latte|yogurt|formagg|latticin/,
    legume: /legum|fagiol|ceci|lenticch/,
  };
  for (const regex of Object.values(groups)) {
    if (regex.test(left) && regex.test(right)) return 5;
  }
  return 0;
};

const semanticMismatchPenalty = (dubiName, creaName) => {
  const left = normalize(dubiName);
  const right = normalize(creaName);
  const exclusiveFamilies = [
    ['yogurt', 'latte'],
    ['fegato', 'petto'],
    ['fegato', 'fesa'],
    ['olio', 'semi'],
    ['farina', 'olio'],
  ];

  for (const [first, second] of exclusiveFamilies) {
    const leftFirst = left.includes(first);
    const leftSecond = left.includes(second);
    const rightFirst = right.includes(first);
    const rightSecond = right.includes(second);
    if ((leftFirst && rightSecond && !rightFirst) || (leftSecond && rightFirst && !leftFirst)) {
      return 30;
    }
  }
  return 0;
};

const detectHeaderIndex = (rows) => rows.findIndex((row) => {
  const values = row.map(keyOf);
  return values.some((value) => value.includes('alimento') || value === 'nome') &&
    values.some((value) => value.includes('kcal') || value.includes('energiakcal'));
});

const parseDataset = (filePath) => {
  const extension = path.extname(filePath).toLowerCase();
  let sheetRows;
  if (extension === '.csv') {
    const workbook = XLSX.read(fs.readFileSync(filePath), { type: 'buffer', raw: false });
    sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: null });
  } else {
    const workbook = XLSX.readFile(filePath, { raw: false });
    const candidateSheets = workbook.SheetNames.map((name) => ({
      name,
      rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: null }),
    }));
    const selected = candidateSheets.find(({ rows }) => detectHeaderIndex(rows) >= 0);
    if (!selected) throw new Error('Could not find a CREA sheet with food and energy headers');
    sheetRows = selected.rows;
  }

  const headerIndex = detectHeaderIndex(sheetRows);
  if (headerIndex < 0) throw new Error('Could not identify the CREA header row');
  const headerMap = buildHeaderMap(sheetRows[headerIndex]);
  return sheetRows.slice(headerIndex + 1).map((row) => {
    const name = String(cell(row, headerMap, aliases.name) || '').trim();
    if (!name) return null;
    return {
      crea_code: String(cell(row, headerMap, aliases.id) || keyOf(name)).trim(),
      crea_name: name,
      crea_name_en: String(cell(row, headerMap, aliases.nameEn) || '').trim(),
      crea_category: String(cell(row, headerMap, aliases.category) || '').trim(),
      kcal: parseNumber(cell(row, headerMap, aliases.calories)),
      protein_g: parseNumber(cell(row, headerMap, aliases.protein)),
      fat_g: parseNumber(cell(row, headerMap, aliases.fat)),
      carbs_g: parseNumber(cell(row, headerMap, aliases.carbs)),
      fiber_g: parseNumber(cell(row, headerMap, aliases.fiber)),
    };
  }).filter((row) => row && [row.kcal, row.protein_g, row.fat_g, row.carbs_g].some((value) => value !== null));
};

const getSupabase = () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
  }
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const deltaPercent = (dubi, crea) => {
  const left = Number(dubi);
  const right = Number(crea);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  if (left === 0) return right === 0 ? 0 : null;
  return Math.round(Math.abs(left - right) / Math.abs(left) * 1000) / 10;
};

const writeCsv = (filePath, headers, rows) => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map((header) => csvCell(row[header])).join(','));
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
};

const fetchCreaNutrient = async (nutrientId) => {
  const body = new URLSearchParams({ nut: nutrientId });
  const response = await fetch(CREA_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'user-agent': 'DUBI nutrition source audit/1.0',
    },
    body,
  });
  if (!response.ok) {
    throw new Error(`CREA nutrient ${nutrientId} request failed with HTTP ${response.status}`);
  }
  const payload = await response.json();
  const rows = Array.isArray(payload.data) ? payload.data.flat().filter(Boolean) : [];
  return rows;
};

const downloadCreaDataset = async (filePath) => {
  console.log('CREA local dataset not found. Building an official snapshot from CREA nutrient endpoints...');
  const foods = new Map();

  for (const [nutrientId, label] of Object.entries(CREA_NUTRIENTS)) {
    const rows = await fetchCreaNutrient(nutrientId);
    console.log(`  ${label}: ${rows.length} values`);
    for (const row of rows) {
      const id = String(row.ALI_ID || '').trim();
      if (!id) continue;
      if (!foods.has(id)) {
        foods.set(id, {
          Codice: id,
          Alimento: String(row.ALI_DESC || '').trim(),
        });
      }
      foods.get(id)[label] = parseNumber(row.VALORE_100_GR);
    }
  }

  const records = [...foods.values()].sort((a, b) =>
    String(a.Alimento || '').localeCompare(String(b.Alimento || ''), 'it')
  );
  if (!records.length) throw new Error('CREA endpoints returned no usable food records');

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const workbook = XLSX.utils.book_new();
  const metadata = XLSX.utils.aoa_to_sheet([
    ['Dataset', 'CREA Tabelle di Composizione degli Alimenti'],
    ['Source page', CREA_SOURCE_PAGE],
    ['API endpoint', CREA_API_URL],
    ['Retrieved at', new Date().toISOString()],
    ['Usage note', 'Official CREA data snapshot generated for read-only matching and human review. Cite the original CREA source.'],
  ]);
  const dataSheet = XLSX.utils.json_to_sheet(records, {
    header: ['Codice', 'Alimento', ...Object.values(CREA_NUTRIENTS)],
  });
  XLSX.utils.book_append_sheet(workbook, metadata, 'Metadata');
  XLSX.utils.book_append_sheet(workbook, dataSheet, 'Alimenti');
  XLSX.writeFile(workbook, filePath);
  console.log(`CREA dataset snapshot saved: ${filePath} (${records.length} foods)`);
  return filePath;
};

const main = async () => {
  if (!fs.existsSync(DATASET_PATH)) {
    try {
      await downloadCreaDataset(DATASET_PATH);
    } catch (error) {
      console.warn(`Automatic CREA dataset retrieval failed: ${error.message}`);
      console.log('No database changes were made.');
      console.log(`Download/export the official CREA table and save it as: ${DEFAULT_DATASET_PATH}`);
      return;
    }
  }

  const creaFoods = parseDataset(DATASET_PATH);
  console.log(`Total CREA foods loaded: ${creaFoods.length}`);
  if (!creaFoods.length) throw new Error('The CREA dataset contained no usable food rows');

  const supabase = getSupabase();
  const { data: ingredients, error } = await supabase
    .from('ingredients')
    .select('id,name,name_en,category,calories_per_100g,protein_g,carbs_g,fat_g,fiber_g,source_food_id,source_food_name,source_confidence')
    .eq('is_active', true)
    .order('id', { ascending: true });
  if (error) throw error;

  const matched = [];
  const unmatched = [];
  let high = 0;
  let medium = 0;
  let divergences = 0;

  for (const ingredient of ingredients || []) {
    const ranked = creaFoods.map((food) => {
      const italianScore = similarity(ingredient.name, food.crea_name);
      const englishScore = ingredient.name_en && food.crea_name_en
        ? similarity(ingredient.name_en, food.crea_name_en)
        : 0;
      const score = Math.max(0, Math.min(100,
        Math.max(italianScore, englishScore) +
        categoryCompatibility(ingredient.category, food.crea_category, food.crea_name) -
        semanticMismatchPenalty(ingredient.name, food.crea_name)
      ));
      return { food, score };
    }).sort((a, b) => b.score - a.score);

    const best = ranked[0] || { food: null, score: 0 };
    if (!best.food || best.score < 70) {
      unmatched.push({
        dubi_id: ingredient.id,
        dubi_name: ingredient.name,
        best_crea_name: best.food ? best.food.crea_name : '',
        match_score: best.score,
      });
      continue;
    }

    const confidence = best.score >= 90 ? 'high' : 'medium';
    if (confidence === 'high') high++;
    else medium++;
    const deltas = {
      kcal: deltaPercent(ingredient.calories_per_100g, best.food.kcal),
      protein: deltaPercent(ingredient.protein_g, best.food.protein_g),
      fat: deltaPercent(ingredient.fat_g, best.food.fat_g),
      carbs: deltaPercent(ingredient.carbs_g, best.food.carbs_g),
      fiber: deltaPercent(ingredient.fiber_g, best.food.fiber_g),
    };
    const divergence = Object.values(deltas).some((value) => value !== null && value > 15);
    if (divergence) divergences++;

    matched.push({
      dubi_id: ingredient.id,
      dubi_name: ingredient.name,
      dubi_category: ingredient.category,
      crea_code: best.food.crea_code,
      crea_name: best.food.crea_name,
      match_score: best.score,
      confidence,
      macro_divergence: divergence ? 'YES' : 'NO',
      dubi_kcal: ingredient.calories_per_100g,
      crea_kcal: best.food.kcal,
      delta_kcal_pct: deltas.kcal,
      dubi_protein: ingredient.protein_g,
      crea_protein: best.food.protein_g,
      delta_protein_pct: deltas.protein,
      dubi_fat: ingredient.fat_g,
      crea_fat: best.food.fat_g,
      delta_fat_pct: deltas.fat,
      dubi_carbs: ingredient.carbs_g,
      crea_carbs: best.food.carbs_g,
      delta_carbs_pct: deltas.carbs,
      dubi_fiber: ingredient.fiber_g,
      crea_fiber: best.food.fiber_g,
      delta_fiber_pct: deltas.fiber,
      review_status: 'PENDING',
    });
  }

  const reviewHeaders = [
    'dubi_id', 'dubi_name', 'dubi_category', 'crea_code', 'crea_name',
    'match_score', 'confidence', 'macro_divergence',
    'dubi_kcal', 'crea_kcal', 'delta_kcal_pct',
    'dubi_protein', 'crea_protein', 'delta_protein_pct',
    'dubi_fat', 'crea_fat', 'delta_fat_pct',
    'dubi_carbs', 'crea_carbs', 'delta_carbs_pct',
    'dubi_fiber', 'crea_fiber', 'delta_fiber_pct', 'review_status',
  ];
  writeCsv(REVIEW_PATH, reviewHeaders, matched);
  writeCsv(UNMATCHED_PATH, ['dubi_id', 'dubi_name', 'best_crea_name', 'match_score'], unmatched);

  console.log([
    '',
    'CREA Matching Summary',
    '---------------------',
    `Total DUBI ingredients:   ${(ingredients || []).length}`,
    `High confidence matches:  ${high}`,
    `Medium confidence matches:${medium}`,
    `Low / no match:           ${unmatched.length}`,
    `Macro divergence flags:   ${divergences}`,
    '',
    `Review:   ${REVIEW_PATH} (${matched.length} rows)`,
    `Unmatched:${UNMATCHED_PATH} (${unmatched.length} rows)`,
    '',
    'No database changes were made. Review and approve matches before any import.',
  ].join('\n'));
};

main().catch((error) => {
  console.error('CREA matching failed:', error);
  process.exitCode = 1;
});
