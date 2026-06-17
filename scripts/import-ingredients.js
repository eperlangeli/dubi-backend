'use strict';

require('dotenv').config();

const fs = require('fs');
const os = require('os');
const path = require('path');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 100;

const toKey = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();

const toText = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
};

const toNumber = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().replace(',', '.');
  if (!text || text === '-' || text.toLowerCase() === 'null') return null;
  const number = Number.parseFloat(text);
  return Number.isFinite(number) ? number : null;
};

const toInteger = (value) => {
  const number = toNumber(value);
  return number === null ? null : Math.round(number);
};

const toBoolean = (value) => {
  if (value === true) return true;
  if (value === 1) return true;
  const text = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  return ['si', '1', 'true', 'yes', 'y'].includes(text);
};

const toTextArray = (value) => {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.map(toText).filter(Boolean);
  return String(value)
    .split(/[,;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const normalizeGlycemicIndex = (value) => {
  const text = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  if (!text || text === '-') return null;
  const compact = text.replace(/[^a-z0-9]+/g, '');
  if (['basso', 'low'].includes(compact)) return 'low';
  if (['medio', 'medium', 'med', 'bassomedio', 'mediobasso', 'lowmedium', 'mediumlow'].includes(compact)) return 'medium';
  if (['alto', 'high', 'medioalto', 'altomedio', 'mediumhigh', 'highmedium'].includes(compact)) return 'high';

  const numeric = toInteger(value);
  if (numeric === null) return text;
  if (numeric <= 55) return 'low';
  if (numeric <= 69) return 'medium';
  return 'high';
};

const normalizeSourceId = (value) => {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return null;
  if (text.includes('usda')) return 'usda_foundation';
  if (text.includes('ciqual')) return 'ciqual';
  if (text.includes('crea')) return 'crea';
  if (text.includes('bls')) return 'bls';
  if (text.includes('eurofir')) return 'eurofir';
  return text.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
};

const CATEGORY_MAP = new Map([
  ['proteineanimali', 'protein_animal'],
  ['animalprotein', 'protein_animal'],
  ['proteinanimale', 'protein_animal'],
  ['proteinevegetali', 'protein_plant'],
  ['plantprotein', 'protein_plant'],
  ['legumi', 'legume'],
  ['legume', 'legume'],
  ['uova', 'egg'],
  ['egg', 'egg'],
  ['cereali', 'grain'],
  ['grain', 'grain'],
  ['verdure', 'vegetable'],
  ['vegetable', 'vegetable'],
  ['frutta', 'fruit'],
  ['fruit', 'fruit'],
  ['fruttaseccasemi', 'nut_seed'],
  ['nutsseeds', 'nut_seed'],
  ['grassioli', 'fat'],
  ['fatsoil', 'fat'],
  ['latticini', 'dairy'],
  ['dairy', 'dairy'],
  ['altlatte', 'dairy_alt'],
  ['alternativelatte', 'dairy_alt'],
  ['integratori', 'supplement'],
  ['supplement', 'supplement'],
  ['spezie', 'spice'],
  ['spice', 'spice'],
]);

const normalizeCategory = (value) => {
  const text = toText(value);
  if (!text) return null;
  return CATEGORY_MAP.get(toKey(text)) || text.trim().toLowerCase().replace(/\s+/g, '_');
};

const alias = {
  id: ['id'],
  name: ['name', 'nome', 'nome italiano', 'nomeitaliano'],
  nameEn: ['name_en', 'nome en', 'nomeen'],
  category: ['cat', 'categoria', 'category'],
  subcategory: ['subcat', 'sottocategoria', 'subcategory'],
  calories: ['kcal', 'kcal /100g', 'kcal 100g', 'kcalper100g', 'calories'],
  protein: ['prot', 'prot g', 'proteine', 'protein', 'protein g'],
  carbs: ['carbs', 'carb g', 'carboidrati', 'carb'],
  fat: ['fat', 'grassi g', 'grassi', 'fats'],
  fiber: ['fiber', 'fibra g', 'fibra'],
  gi: ['gi', 'ig'],
  portion: ['portion', 'porzione g', 'porzioneg'],
  timing: ['timing'],
  slots: ['slots', 'slot'],
  omnivore: ['omni', 'onniv', 'onnivoro', 'onniv.'],
  pescatarian: ['pesc', 'pescetariano', 'pesc.'],
  vegetarian: ['veg', 'vegetariano', 'veg.'],
  vegan: ['vegan'],
  gluten: ['ag', 'glutine', 'gluten'],
  dairy: ['ad', 'latte', 'dairy'],
  lactose: ['lattosio', 'lactose'],
  eggs: ['ae', 'uova', 'eggs'],
  fish: ['af', 'pesce', 'fish'],
  shellfish: ['ash', 'crostacei', 'shellfish'],
  nuts: ['an', 'fr.secca', 'fr secca', 'fruttasecca', 'nuts'],
  peanuts: ['ap', 'arachidi', 'peanuts'],
  soy: ['aso', 'soia', 'soy'],
  sesame: ['ase', 'sesamo', 'sesame'],
  mollusks: ['molluschi', 'mollusks'],
  celiac: ['oc', 'celiaci', 'celiac'],
  lactoseIntolerant: ['int.latt.', 'int latt', 'intolleranza lattosio', 'intolleranzalattosio'],
  diabetic: ['od', 'diabetici', 'diabetic'],
  gerd: ['gerd'],
  ibs: ['ol', 'ibs', 'low fodmap', 'lowfodmap'],
  histamine: ['istamina', 'histamine'],
  gout: ['gotta', 'gout'],
  renal: ['ore', 'renale', 'renal'],
  nickel: ['nichel', 'nickel'],
  source: ['fonte', 'source'],
  healthTags: ['health_tags', 'health tags', 'healthtags'],
  primaryBenefit: ['primary_benefit', 'beneficio principale', 'beneficioprincipale'],
  scienceNote: ['science_note', 'nota scientifica', 'notascientifica'],
  validato: ['validato', 'validated'],
  macroOk: ['macro ok', 'macro ok?', 'macrook', 'macro'],
  notes: ['nota', 'notes', 'note nutrizionista', 'notenutrizionista'],
  correction: ['correzione applicata'],
};

const buildHeaderMap = (headerRow) => {
  const map = new Map();
  headerRow.forEach((header, index) => {
    const key = toKey(header);
    if (key && !map.has(key)) map.set(key, index);
  });
  return map;
};

const getIndex = (headerMap, aliases) => {
  for (const candidate of aliases) {
    const key = toKey(candidate);
    if (headerMap.has(key)) return headerMap.get(key);
  }
  return -1;
};

const getCell = (row, headerMap, aliases) => {
  const index = getIndex(headerMap, aliases);
  return index >= 0 ? row[index] : undefined;
};

const hasUsefulHeader = (row) => {
  const keys = new Set(row.map(toKey).filter(Boolean));
  return (
    (keys.has('nomeitaliano') || keys.has('name')) &&
    (keys.has('kcal') || keys.has('kcal100g') || keys.has('kcalper100g')) &&
    (keys.has('timing') || keys.has('slot'))
  );
};

const findHeaderIndex = (rows) => {
  const limit = Math.min(rows.length, 12);
  for (let index = 0; index < limit; index += 1) {
    if (hasUsefulHeader(rows[index] || [])) return index;
  }
  throw new Error('Could not find a valid ingredient header row');
};

const isSectionRowName = (name) => {
  const text = String(name || '').trim();
  return !text || text.startsWith('▶') || text.startsWith('-') || text.startsWith('─');
};

const addIfDefined = (target, key, value) => {
  if (value !== undefined) target[key] = value;
};

const buildIngredientPayload = (row, headerMap, { sheetKind }) => {
  const name = toText(getCell(row, headerMap, alias.name));
  if (isSectionRowName(name)) return { skipped: true, reason: 'empty_or_section_row' };

  const category = normalizeCategory(getCell(row, headerMap, alias.category));
  if (!category) return { skipped: true, reason: 'missing_category', name };

  const payload = {
    name,
    category,
    updated_at: new Date().toISOString(),
  };

  const id = toInteger(getCell(row, headerMap, alias.id));
  if (id !== null) payload.id = id;

  addIfDefined(payload, 'name_en', toText(getCell(row, headerMap, alias.nameEn)));
  addIfDefined(payload, 'subcategory', toText(getCell(row, headerMap, alias.subcategory)));
  addIfDefined(payload, 'calories_per_100g', toNumber(getCell(row, headerMap, alias.calories)));
  addIfDefined(payload, 'protein_g', toNumber(getCell(row, headerMap, alias.protein)));
  addIfDefined(payload, 'carbs_g', toNumber(getCell(row, headerMap, alias.carbs)));
  addIfDefined(payload, 'fat_g', toNumber(getCell(row, headerMap, alias.fat)));
  addIfDefined(payload, 'fiber_g', toNumber(getCell(row, headerMap, alias.fiber)));
  addIfDefined(payload, 'glycemic_index', normalizeGlycemicIndex(getCell(row, headerMap, alias.gi)));

  const giNumeric = toInteger(getCell(row, headerMap, alias.gi));
  if (giNumeric !== null) payload.gi_numeric = giNumeric;

  const portion = toInteger(getCell(row, headerMap, alias.portion));
  if (portion !== null) payload.typical_portion_g = portion;

  payload.meal_timing = toTextArray(getCell(row, headerMap, alias.timing));
  payload.template_slots = toTextArray(getCell(row, headerMap, alias.slots));
  payload.compatible_omnivore = toBoolean(getCell(row, headerMap, alias.omnivore));
  payload.compatible_pescatarian = toBoolean(getCell(row, headerMap, alias.pescatarian));
  payload.compatible_vegetarian = toBoolean(getCell(row, headerMap, alias.vegetarian));
  payload.compatible_vegan = toBoolean(getCell(row, headerMap, alias.vegan));

  payload.allergen_gluten = toBoolean(getCell(row, headerMap, alias.gluten));
  payload.allergen_dairy = toBoolean(getCell(row, headerMap, alias.dairy));
  payload.allergen_lactose = toBoolean(getCell(row, headerMap, alias.lactose));
  payload.allergen_eggs = toBoolean(getCell(row, headerMap, alias.eggs));
  payload.allergen_fish = toBoolean(getCell(row, headerMap, alias.fish));
  payload.allergen_shellfish = toBoolean(getCell(row, headerMap, alias.shellfish));
  payload.allergen_nuts = toBoolean(getCell(row, headerMap, alias.nuts));
  payload.allergen_peanuts = toBoolean(getCell(row, headerMap, alias.peanuts));
  payload.allergen_soy = toBoolean(getCell(row, headerMap, alias.soy));
  payload.allergen_sesame = toBoolean(getCell(row, headerMap, alias.sesame));
  payload.allergen_mollusks = toBoolean(getCell(row, headerMap, alias.mollusks));

  payload.ok_celiac = toBoolean(getCell(row, headerMap, alias.celiac));
  payload.ok_lactose_intolerant = toBoolean(getCell(row, headerMap, alias.lactoseIntolerant));
  payload.ok_diabetic = toBoolean(getCell(row, headerMap, alias.diabetic));
  payload.ok_gerd = toBoolean(getCell(row, headerMap, alias.gerd));
  payload.ok_ibs_fodmap = toBoolean(getCell(row, headerMap, alias.ibs));
  payload.ok_histamine = toBoolean(getCell(row, headerMap, alias.histamine));
  payload.ok_gout = toBoolean(getCell(row, headerMap, alias.gout));
  payload.ok_renal = toBoolean(getCell(row, headerMap, alias.renal));
  payload.ok_nickel = toBoolean(getCell(row, headerMap, alias.nickel));

  payload.is_active = true;
  payload.nutritionist_validated = sheetKind === 'corrected' ||
    toBoolean(getCell(row, headerMap, alias.validato));

  const source = toText(getCell(row, headerMap, alias.source));
  const sourceId = normalizeSourceId(source);
  if (sourceId) payload.source_id = sourceId;

  const healthTags = toTextArray(getCell(row, headerMap, alias.healthTags));
  if (healthTags.length) payload.health_tags = healthTags;

  addIfDefined(payload, 'primary_benefit', toText(getCell(row, headerMap, alias.primaryBenefit)));
  addIfDefined(payload, 'science_note', toText(getCell(row, headerMap, alias.scienceNote)));

  const notes = toText(getCell(row, headerMap, alias.notes));
  const correction = toText(getCell(row, headerMap, alias.correction));
  if (notes) {
    payload.notes = notes;
  } else if (correction && correction !== '0') {
    payload.notes = `Correzione applicata: ${correction}`;
  }

  return { payload };
};

const locateWorkbook = () => {
  const args = process.argv.slice(2);
  const fileArgIndex = args.findIndex((arg) => arg === '--file');
  const inlineFileArg = args.find((arg) => arg.startsWith('--file='));
  const positional = args.find((arg) => !arg.startsWith('--'));
  const explicitPath = process.env.INGREDIENTS_XLSX_PATH ||
    process.env.EXCEL_PATH ||
    (inlineFileArg ? inlineFileArg.slice('--file='.length) : null) ||
    (fileArgIndex >= 0 ? args[fileArgIndex + 1] : null) ||
    positional;

  const candidates = [
    explicitPath,
    path.join(process.cwd(), 'DUBI_Ingredienti_v2.xlsx'),
    path.join(process.cwd(), '..', 'DUBI_Ingredienti_v2.xlsx'),
    path.join(os.homedir(), 'Downloads', 'DUBI_Ingredienti_v2.xlsx'),
  ].filter(Boolean).map((candidate) => path.resolve(candidate));

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`DUBI_Ingredienti_v2.xlsx not found. Checked: ${candidates.join(', ')}`);
  }
  return found;
};

const readSheetPayloads = (sheet, sheetKind) => {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: null });
  const headerIndex = findHeaderIndex(rows);
  const headerMap = buildHeaderMap(rows[headerIndex]);
  const dataRows = rows.slice(headerIndex + 1);
  const summary = {
    rowsRead: 0,
    rowsPrepared: 0,
    rowsSkipped: 0,
    skippedNotValidated: 0,
    skippedMacroNotOk: 0,
    errors: [],
  };
  const payloads = [];

  dataRows.forEach((row, offset) => {
    const excelRowNumber = headerIndex + offset + 2;
    const name = toText(getCell(row, headerMap, alias.name));
    if (isSectionRowName(name)) {
      summary.rowsSkipped += 1;
      return;
    }

    summary.rowsRead += 1;
    if (sheetKind === 'new_validated' && !toBoolean(getCell(row, headerMap, alias.validato))) {
      summary.rowsSkipped += 1;
      summary.skippedNotValidated += 1;
      return;
    }
    if (sheetKind === 'new_validated') {
      const macroIndex = getIndex(headerMap, alias.macroOk);
      if (macroIndex >= 0 && !toBoolean(row[macroIndex])) {
        summary.rowsSkipped += 1;
        summary.skippedMacroNotOk += 1;
        return;
      }
    }

    try {
      const result = buildIngredientPayload(row, headerMap, { sheetKind });
      if (result.skipped) {
        summary.rowsSkipped += 1;
        summary.errors.push({ row: excelRowNumber, name: result.name || name, reason: result.reason });
        return;
      }
      payloads.push(result.payload);
      summary.rowsPrepared += 1;
    } catch (error) {
      summary.rowsSkipped += 1;
      summary.errors.push({ row: excelRowNumber, name, reason: error.message });
    }
  });

  return { summary, payloads };
};

const getSupabaseClient = () => {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!url) throw new Error('SUPABASE_URL is required');
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_KEY is required');

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const upsertBatches = async (supabase, rows, onConflict) => {
  let upserted = 0;
  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE);
    const { error } = await supabase
      .from('ingredients')
      .upsert(batch, { onConflict });

    if (error) throw error;
    upserted += batch.length;
  }
  return upserted;
};

const upsertPayloads = async (payloads) => {
  const withId = payloads.filter((row) => row.id !== undefined && row.id !== null);
  const withoutId = payloads.filter((row) => row.id === undefined || row.id === null);
  const supabase = getSupabaseClient();

  const byId = withId.length ? await upsertBatches(supabase, withId, 'id') : 0;
  const byName = withoutId.length ? await upsertBatches(supabase, withoutId, 'name') : 0;
  return { byId, byName, total: byId + byName };
};

const printDryRun = (label, payloads) => {
  console.log(`\n[DRY RUN] ${label}: ${payloads.length} rows would be upserted`);
  console.log(JSON.stringify(payloads, null, 2));
};

const run = async () => {
  const workbookPath = locateWorkbook();
  const workbook = XLSX.readFile(workbookPath);
  const [sheet1Name, sheet2Name] = workbook.SheetNames;

  if (!sheet1Name || !sheet2Name) {
    throw new Error('Workbook must contain at least two sheets');
  }

  const corrected = readSheetPayloads(workbook.Sheets[sheet1Name], 'corrected');
  const newValidated = readSheetPayloads(workbook.Sheets[sheet2Name], 'new_validated');
  const allPayloads = [...corrected.payloads, ...newValidated.payloads];

  if (DRY_RUN) {
    printDryRun(sheet1Name, corrected.payloads);
    printDryRun(sheet2Name, newValidated.payloads);
  } else {
    const result = await upsertPayloads(allPayloads);
    corrected.summary.upserted = corrected.payloads.length;
    newValidated.summary.upserted = newValidated.payloads.length;
    corrected.summary.upsertMode = 'id/name split';
    newValidated.summary.upsertMode = 'id/name split';
    corrected.summary.actualUpserted = result.byId + Math.max(0, result.byName - newValidated.payloads.length);
    newValidated.summary.actualUpserted = newValidated.payloads.length;
  }

  const errors = [...corrected.summary.errors, ...newValidated.summary.errors];
  console.log(`\nWorkbook: ${workbookPath}`);
  console.log(`[OK] Sheet 1 (${sheet1Name}): ${corrected.summary.rowsRead} rows read, ${corrected.payloads.length} ${DRY_RUN ? 'prepared' : 'upserted'}`);
  console.log(`[OK] Sheet 2 (${sheet2Name}): ${newValidated.payloads.length} validated macro-ok rows, ${newValidated.payloads.length} ${DRY_RUN ? 'prepared' : 'upserted'} (${newValidated.summary.skippedNotValidated} skipped - VALIDATO != SI, ${newValidated.summary.skippedMacroNotOk} skipped - MACRO OK != SI)`);
  console.log(`[ERR] Errors: ${errors.length}`);

  if (errors.length) {
    console.log(JSON.stringify(errors, null, 2));
    process.exitCode = 1;
  }
};

run().catch((error) => {
  console.error('Ingredient import failed:', error);
  process.exitCode = 1;
});
