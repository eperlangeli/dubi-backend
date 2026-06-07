const express = require('express');
const { getRecipeNutritionAuditStatus } = require('../services/nutrition-brain');
const { buildSourceBackedNutritionFromIngredients } = require('../services/ingredient-macros');

const toFiniteNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const average = (values) => {
  const clean = values.map(toFiniteNumberOrNull).filter((value) => value !== null);
  if (clean.length === 0) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
};

const calculateTrend = (values) => {
  const clean = values.map(toFiniteNumberOrNull).filter((value) => value !== null);
  if (clean.length < 3) {
    return { value: average(clean), isDecreasing: null, difference: 0, status: 'insufficient_data' };
  }

  const recent = clean.slice(-3);
  const older = clean.length >= 6 ? clean.slice(0, -3) : clean.slice(0, clean.length - 1);
  const recentAvg = average(recent);
  const olderAvg = average(older);
  const difference = olderAvg == null ? 0 : recentAvg - olderAvg;

  return {
    value: Math.round(recentAvg * 10) / 10,
    isDecreasing: difference < 0,
    difference: Math.round(difference * 10) / 10,
    status: 'ok'
  };
};

const getSleepHours = (day) => {
  const value = day?.sleep_duration ?? day?.sleep_hours;
  const numeric = toFiniteNumberOrNull(value);
  return numeric && numeric > 0 ? numeric : null;
};

const getRecoveryScore = (day) => {
  const numeric = toFiniteNumberOrNull(day?.recovery_score);
  return numeric && numeric > 0 ? numeric : null;
};

const classifyRecoveryStatus = ({ hrvTrend, sleepTrend, recoveryTrend, poorSleepDays }) => {
  const hasRecoverySignal = [hrvTrend, sleepTrend, recoveryTrend].some((trend) => trend?.status === 'ok' && trend.value != null);
  if (!hasRecoverySignal) return 'normal';

  if (recoveryTrend.value != null) {
    if (recoveryTrend.value < 50) return 'compromised';
    if (recoveryTrend.value > 70 && poorSleepDays === 0 && !(hrvTrend.isDecreasing && hrvTrend.difference <= -4)) {
      return 'excellent';
    }
  }

  if ((hrvTrend.value != null && hrvTrend.value < 35) || poorSleepDays >= 3) return 'compromised';
  if (hrvTrend.isDecreasing && sleepTrend.isDecreasing) return 'compromised';
  return 'normal';
};

const classifyFatigueLevel = ({ recoveryStatus, hrvTrend, sleepTrend, poorSleepDays }) => {
  if (recoveryStatus === 'compromised' || poorSleepDays >= 3) return 'high';
  if (hrvTrend.isDecreasing || sleepTrend.isDecreasing || poorSleepDays >= 1) return 'moderate';
  return 'low';
};

const daysBetween = (from, to) => {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 86400000));
};

const normalizeGender = (gender) => {
  const value = String(gender || '').toLowerCase();
  if (value === 'f' || value === 'female' || value === 'femmina') return 'F';
  return 'M';
};

const normalizeGoal = (goal) => {
  const value = String(goal || 'maintain').toLowerCase().trim();
  if (['definition', 'definizione', 'cut', 'cutting'].includes(value)) return 'definition';
  if (['fatloss', 'fat_loss', 'dimagrimento', 'weight_loss', 'lose_weight'].includes(value)) return 'fat_loss';
  if (['lean_bulk', 'lean bulk', 'massa pulita'].includes(value)) return 'lean_bulk';
  if (['gain', 'muscle_gain', 'massa', 'bulk', 'bulking'].includes(value)) return 'muscle_gain';
  return 'maintain';
};

const parseWorkoutDays = (value) => {
  const direct = Number(value);
  if (Number.isFinite(direct)) return Math.max(0, Math.min(7, direct));
  const match = String(value || '').match(/\d+/);
  return match ? Math.max(0, Math.min(7, Number(match[0]))) : 0;
};

const calculateActivityFactor = (user) => {
  const workoutDays = parseWorkoutDays(user.workout_days);
  const intensity = String(user.workout_intensity || '').toLowerCase();

  if (['alta', 'high', 'intense', 'intensa'].includes(intensity)) {
    return workoutDays >= 7 ? 1.9 : workoutDays >= 5 ? 1.725 : 1.55;
  }

  if (['moderata', 'moderate', 'medium'].includes(intensity)) {
    return workoutDays >= 3 ? 1.55 : workoutDays >= 1 ? 1.375 : 1.2;
  }

  if (['bassa', 'light', 'leggera', 'low'].includes(intensity)) {
    return workoutDays >= 1 ? 1.375 : 1.2;
  }

  if (workoutDays >= 6) return 1.55;
  if (workoutDays >= 3) return 1.55;
  if (workoutDays >= 1) return 1.375;
  return 1.2;
};

const calculateMetabolism = (user) => {
  const gender = normalizeGender(user.gender);
  const weight = Number(user.weight || 0);
  const height = Number(user.height || 0);
  const age = Number(user.age || 0);

  if (!weight || !height || !age) {
    throw new Error('Missing age, height, or weight for metabolism calculation');
  }

  const bmr = gender === 'M'
    ? 10 * weight + 6.25 * height - 5 * age + 5
    : 10 * weight + 6.25 * height - 5 * age - 161;
  const activityFactor = calculateActivityFactor(user);

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(bmr * activityFactor),
    activityFactor
  };
};

const calculateBaseMacroTargets = (user, metabolism) => {
  const goal = normalizeGoal(user.goal);
  const weight = Number(user.weight || 0);
  const gender = normalizeGender(user.gender);
  const minCalories = gender === 'M' ? 1500 : 1200;
  const goalConfig = {
    maintain: { kcalDelta: 0, proteinPerKg: 1.7, fatPerKg: 0.9, floorAtBmr: false },
    definition: { kcalDelta: -450, proteinPerKg: 2.5, fatPerKg: 0.9, floorAtBmr: false },
    fat_loss: { kcalDelta: -625, proteinPerKg: 2.0, fatPerKg: 0.85, floorAtBmr: true },
    lean_bulk: { kcalDelta: 250, proteinPerKg: 2.0, fatPerKg: 1.0, floorAtBmr: false },
    muscle_gain: { kcalDelta: 500, proteinPerKg: 2.0, fatPerKg: 1.0, floorAtBmr: false }
  }[goal];
  const rawCalories = metabolism.tdee + goalConfig.kcalDelta;
  const calories = Math.round(Math.max(minCalories, goalConfig.floorAtBmr ? Math.max(rawCalories, metabolism.bmr) : rawCalories));
  const protein = Math.round(weight * goalConfig.proteinPerKg);
  const fats = Math.round(weight * goalConfig.fatPerKg);
  const carbs = Math.max(50, Math.round((calories - protein * 4 - fats * 9) / 4));

  return { calories, protein, carbs, fats };
};

const makeAdaptiveDecisions = (user, metabolism, physiologicalState, weightTrend) => {
  const minCalories = normalizeGender(user.gender) === 'M' ? 1500 : 1200;
  const goal = normalizeGoal(user.goal);
  const targets = calculateBaseMacroTargets(user, metabolism);

  if (weightTrend.status === 'stagnant' && ['fat_loss', 'definition'].includes(goal)) {
    targets.calories = Math.max(minCalories, Math.round(targets.calories * 0.95));
  }

  if (physiologicalState.recoveryStatus === 'compromised') {
    targets.calories = Math.max(targets.calories, Math.round(metabolism.tdee * 0.85));
    targets.protein = Math.round(targets.protein * 1.1);
    targets.carbs = Math.round(targets.carbs * 1.15);
    targets.recoveryMode = true;
  }

  targets.fats = Math.max(30, targets.fats);
  targets.carbs = Math.max(50, Math.round((targets.calories - targets.protein * 4 - targets.fats * 9) / 4));

  return targets;
};

const parseList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
  return String(value)
    .split(/[,;]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
};

const normalizeAllergenList = (value) => {
  const raw = parseList(value);
  const normalized = new Set(raw);

  raw.forEach((item) => {
    if (/latt|latte|dairy|milk|casein|caseina/.test(item)) {
      normalized.add('dairy');
      normalized.add('lactose');
    }
    if (/uov|egg/.test(item)) normalized.add('eggs');
    if (/glutin|gluten|celiach|celiac/.test(item)) normalized.add('gluten');
    if (/arachid|peanut/.test(item)) {
      normalized.add('peanuts');
      normalized.add('nuts');
    }
    if (/frutta secca|noci|nocciol|mandorl|nut/.test(item)) normalized.add('nuts');
    if (/soia|soy/.test(item)) normalized.add('soy');
    if (/sesamo|sesame/.test(item)) normalized.add('sesame');
    if (/pesce|fish/.test(item)) normalized.add('fish');
    if (/crostace|gamber|shellfish|crustacean/.test(item)) normalized.add('shellfish');
    if (/carne rossa|red meat|manzo|bovino|vitello/.test(item)) normalized.add('red_meat');
    if (/no carne|senza carne|non mangio carne|meat free|no meat/.test(item)) normalized.add('meat');
    if (/maiale|pork/.test(item)) normalized.add('pork');
    if (/pollo|chicken/.test(item)) normalized.add('chicken');
    if (/tacchino|turkey/.test(item)) normalized.add('turkey');
    if (/vegetarian/.test(item)) normalized.add('vegetarian_request');
    if (/vegan/.test(item)) normalized.add('vegan_request');
  });

  return Array.from(normalized);
};

const normalizeDiet = (diet) => {
  const value = String(diet || 'omnivore').toLowerCase();
  if (['veg', 'vegetarian', 'vegetariano'].includes(value)) return 'vegetarian';
  if (['vegan', 'vegano'].includes(value)) return 'vegan';
  if (['pescatarian', 'pescetarian', 'pescetariano'].includes(value)) return 'pescatarian';
  return 'omnivore';
};

const TEMPORARY_ANOMALY_CAUSES = new Set([
  'stress',
  'argument',
  'anger',
  'caffeine',
  'alcohol',
  'poor_sleep',
  'intense_training',
  'travel',
  'illness',
  'menstrual_cycle',
  'high_sodium',
  'temporary_stress'
]);

const normalizeAnomalyAttribution = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'unknown';
  if (['yes', 'si', 'sì', 'stress', 'litigata', 'discussione', 'ira', 'rabbia'].includes(raw)) return 'temporary_stress';
  if (['no', 'none', 'nothing', 'normale'].includes(raw)) return 'none_reported';
  return raw.replace(/\s+/g, '_');
};

const decideAnomalyAction = (attribution) => {
  const normalized = normalizeAnomalyAttribution(attribution);

  if (TEMPORARY_ANOMALY_CAUSES.has(normalized)) {
    return {
      attribution: normalized,
      nutritionRelated: false,
      action: 'exclude_and_monitor',
      excludedFromRegeneration: true,
      explanation: 'Temporary non-nutrition cause confirmed. DUBI excludes this data point and keeps the plan unchanged.'
    };
  }

  if (normalized === 'none_reported') {
    return {
      attribution: normalized,
      nutritionRelated: null,
      action: 'monitor_48_72h',
      excludedFromRegeneration: false,
      explanation: 'No external cause confirmed. DUBI monitors the next 48-72 hours before changing nutrition.'
    };
  }

  return {
    attribution: normalized,
    nutritionRelated: null,
    action: 'monitor',
    excludedFromRegeneration: false,
    explanation: 'Attribution recorded. DUBI will use it in the next trend analysis.'
  };
};

const INGREDIENT_SWAP_LIBRARY = [
  {
    role: 'protein',
    match: /pollo|tacchino|manzo|uova|albumi|salmone|tonno|merluzzo|branzino|sgombro|polpo|gamberi|trota|nasello|tofu|tempeh|edamame|yogurt|skyr|kefir|ricotta|fiocchi di latte/i,
    options: [
      { name: 'Petto di pollo', quantity: 150, unit: 'g', diets: ['omnivore'], allergens: [] },
      { name: 'Petto di tacchino fresco', quantity: 150, unit: 'g', diets: ['omnivore'], allergens: [] },
      { name: 'Uova', quantity: 2, unit: 'pz', diets: ['omnivore', 'vegetarian'], allergens: ['eggs'] },
      { name: 'Tonno fresco', quantity: 140, unit: 'g', diets: ['omnivore', 'pescatarian'], allergens: ['fish'] },
      { name: 'Merluzzo', quantity: 160, unit: 'g', diets: ['omnivore', 'pescatarian'], allergens: ['fish'] },
      { name: 'Tofu', quantity: 170, unit: 'g', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: ['soy'] },
      { name: 'Tempeh', quantity: 150, unit: 'g', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: ['soy'] },
      { name: 'Yogurt greco 0-2%', quantity: 170, unit: 'g', diets: ['omnivore', 'vegetarian', 'pescatarian'], allergens: ['dairy'] },
      { name: 'Skyr naturale', quantity: 170, unit: 'g', diets: ['omnivore', 'vegetarian', 'pescatarian'], allergens: ['dairy'] }
    ]
  },
  {
    role: 'carb',
    match: /riso|pasta|quinoa|cous cous|orzo|farro|pane|toast|patate|zucca|avena|crema di riso/i,
    options: [
      { name: 'Riso basmati', quantity: 75, unit: 'g', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: [] },
      { name: 'Quinoa', quantity: 75, unit: 'g', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: [] },
      { name: 'Patate', quantity: 220, unit: 'g', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: [] },
      { name: 'Pasta integrale', quantity: 80, unit: 'g', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: ['gluten'] },
      { name: 'Cous cous', quantity: 75, unit: 'g', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: ['gluten'] },
      { name: 'Patata dolce', quantity: 220, unit: 'g', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: [] },
      { name: 'Fiocchi di avena certificati senza glutine', quantity: 55, unit: 'g', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: [] }
    ]
  },
  {
    role: 'vegetable',
    match: /zucchine|broccoli|spinaci|funghi|pomodoro|pomodorini|carote|asparagi|peperoni|cetrioli|rucola|insalata|fagiolini|finocchi|verdure|minestrone/i,
    options: [
      { name: 'Zucchine', quantity: 180, unit: 'g', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: [] },
      { name: 'Broccoli', quantity: 180, unit: 'g', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: [] },
      { name: 'Spinaci', quantity: 120, unit: 'g', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: [] },
      { name: 'Carote', quantity: 120, unit: 'g', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: [] },
      { name: 'Verdure miste', quantity: 200, unit: 'g', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: [] },
      { name: 'Insalata mista', quantity: 120, unit: 'g', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: [] }
    ]
  },
  {
    role: 'fat',
    match: /olio evo|avocado|noci|mandorle|burro di arachidi|tahina|semi|olive|crema di nocciole/i,
    options: [
      { name: 'Olio EVO', quantity: 10, unit: 'ml', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: [] },
      { name: 'Avocado', quantity: 70, unit: 'g', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: [] },
      { name: 'Semi di chia', quantity: 15, unit: 'g', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: [] },
      { name: 'Tahina', quantity: 15, unit: 'g', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: ['sesame'] },
      { name: 'Mandorle', quantity: 15, unit: 'g', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: ['nuts'] },
      { name: 'Noci', quantity: 15, unit: 'g', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: ['nuts'] }
    ]
  },
  {
    role: 'fruit',
    match: /banana|mela|pera|kiwi|fragole|mirtilli|frutti rossi|lamponi|mango|arancia|frutta|datteri/i,
    options: [
      { name: 'Banana', quantity: 1, unit: 'media', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: [] },
      { name: 'Mela', quantity: 1, unit: 'media', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: [] },
      { name: 'Pera', quantity: 1, unit: 'media', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: [] },
      { name: 'Kiwi', quantity: 1, unit: 'medio', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: [] },
      { name: 'Frutti rossi', quantity: 100, unit: 'g', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: [] },
      { name: 'Mango', quantity: 120, unit: 'g', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: [] }
    ]
  }
];

const withIngredientSwaps = (ingredients, user) => {
  const dietStyle = normalizeDiet(user.diet_style);
  const excludedAllergens = normalizeAllergenList(user.allergies);

  return (Array.isArray(ingredients) ? ingredients : []).map((ingredient) => {
    const name = typeof ingredient === 'string' ? ingredient : ingredient?.name || '';
    const group = INGREDIENT_SWAP_LIBRARY.find((entry) => entry.match.test(name));
    if (!group) return ingredient;

    const alternatives = group.options
      .filter((option) => option.name.toLowerCase() !== name.toLowerCase())
      .filter((option) => option.diets.includes(dietStyle) || dietStyle === 'omnivore')
      .filter((option) => !option.allergens.some((allergen) => excludedAllergens.includes(allergen)))
      .slice(0, 5)
      .map((option) => ({
        name: option.name,
        quantity: option.quantity,
        unit: option.unit,
        role: group.role,
        equivalence: 'DUBI equivalent swap: same nutritional role, adjusted portion'
      }));

    return {
      ...(typeof ingredient === 'string' ? { name: ingredient } : ingredient),
      role: group.role,
      alternatives
    };
  });
};

const PROCESSED_MEAT_PATTERN = /fesa di tacchino|affettat|bresaola|prosciutto|salame|salumi|wurstel|mortadella|speck/i;
const MEAT_PATTERN = /petto di pollo|pollo|manzo|tacchino|vitello|bovino/i;
const RED_MEAT_PATTERN = /manzo|vitello|bovino|bistecca|macinato/i;
const CHICKEN_PATTERN = /petto di pollo|pollo/i;
const TURKEY_PATTERN = /tacchino/i;
const FISH_PATTERN = /salmone|tonno|merluzzo|branzino|sgombro|polpo|gamberi|trota|nasello|pesce/i;
const EGG_PATTERN = /uova|uovo|albumi|omelette|frittata/i;
const DAIRY_PATTERN = /yogurt|skyr|kefir|ricotta|latte|fiocchi di latte|parmigiano|formaggio/i;
const PLANT_PROTEIN_PATTERN = /tofu|tempeh|edamame|ceci|lenticchie|fagioli|legumi/i;
const MAIN_CARB_PATTERN = /riso|noodles|pasta|quinoa|cous cous|orzo|farro|pane|toast|patate|patata|crema di riso|avena/i;
const VEGETABLE_PATTERN = /verdure|zucchine|broccoli|spinaci|funghi|pomodor|carote|asparagi|peperoni|cetrioli|rucola|insalata|fagiolini|finocchi/i;
const SWEET_BREAKFAST_PATTERN = /porridge|yogurt|skyr|chia|pancake|smoothie|ricotta.*miele|crema di riso|frutta|mirtilli|fragole|lamponi|banana|mela|pera|kiwi|mango|cacao|cannella|muesli|overnight|kefir/i;
const SAVORY_BREAKFAST_PATTERN = /toast|uova|omelette|frittata|hummus|tacchino|salmone|patate|tofu scramble|avocado toast|pane/i;
const MAJOR_PROTEIN_PATTERN = /salmone|tonno|merluzzo|branzino|sgombro|polpo|gamberi|trota|nasello|pesce|petto di pollo|pollo|manzo|tacchino|vitello|bovino|uova|uovo|albumi|tofu|tempeh|edamame|ceci|lenticchie|fagioli/i;

const ingredientText = (recipe) => [
  recipe.name,
  recipe.description,
  ...(Array.isArray(recipe.ingredients) ? recipe.ingredients.map((item) => item?.name || item || '') : [])
].join(' ');

const getMainCarbIngredients = (ingredients = []) => (Array.isArray(ingredients) ? ingredients : [])
  .filter((ingredient) => MAIN_CARB_PATTERN.test(String(ingredient?.name || ingredient || '')))
  .filter((ingredient) => !VEGETABLE_PATTERN.test(String(ingredient?.name || ingredient || '')));

const getProteinGroup = (recipe) => {
  const text = ingredientText(recipe);
  if (FISH_PATTERN.test(text)) return 'fish';
  if (MEAT_PATTERN.test(text)) return 'meat';
  if (EGG_PATTERN.test(text)) return 'eggs';
  if (PLANT_PROTEIN_PATTERN.test(text)) return 'plant';
  return 'other';
};

const hasAmbiguousProteinBlend = (ingredients = []) => (Array.isArray(ingredients) ? ingredients : [])
  .some((ingredient) => {
    const name = String(ingredient?.name || ingredient || '');
    const matches = name.match(new RegExp(MAJOR_PROTEIN_PATTERN.source, 'gi')) || [];
    return matches.length > 1 && /,|\/|\s\+\s|\se\s|\sand\s/i.test(name);
  });

const violatesUserFoodRestrictions = (recipe, user) => {
  const restrictions = normalizeAllergenList(user?.allergies);
  if (!restrictions.length) return false;
  const text = ingredientText(recipe);
  if (restrictions.includes('gluten') && /glutine|pasta|pane|toast|cous cous|orzo|farro|seitan/i.test(text)) return true;
  if (restrictions.includes('dairy') && DAIRY_PATTERN.test(text)) return true;
  if (restrictions.includes('lactose') && DAIRY_PATTERN.test(text)) return true;
  if (restrictions.includes('eggs') && EGG_PATTERN.test(text)) return true;
  if (restrictions.includes('fish') && FISH_PATTERN.test(text)) return true;
  if (restrictions.includes('shellfish') && /gamberi|crostace|polpo|shellfish/i.test(text)) return true;
  if (restrictions.includes('red_meat') && RED_MEAT_PATTERN.test(text)) return true;
  if (restrictions.includes('meat') && MEAT_PATTERN.test(text)) return true;
  if (restrictions.includes('pork') && /maiale|pork|prosciutto|salame|speck/i.test(text)) return true;
  if (restrictions.includes('chicken') && CHICKEN_PATTERN.test(text)) return true;
  if (restrictions.includes('turkey') && TURKEY_PATTERN.test(text)) return true;
  if (restrictions.includes('vegetarian_request') && (MEAT_PATTERN.test(text) || FISH_PATTERN.test(text))) return true;
  if (restrictions.includes('vegan_request') && (MEAT_PATTERN.test(text) || FISH_PATTERN.test(text) || EGG_PATTERN.test(text) || DAIRY_PATTERN.test(text))) return true;
  return false;
};

const matchesBreakfastPreference = (recipe, preference) => {
  const pref = String(preference || '').toLowerCase();
  if (!['dolce', 'sweet', 'salata', 'salato', 'savory'].includes(pref)) return true;
  const text = ingredientText(recipe);
  if (['dolce', 'sweet'].includes(pref)) return SWEET_BREAKFAST_PATTERN.test(text) && !SAVORY_BREAKFAST_PATTERN.test(text);
  return SAVORY_BREAKFAST_PATTERN.test(text);
};

const isTrueSnack = (recipe, slot) => {
  if (slot.type !== 'snack') return true;
  const mealTypes = Array.isArray(recipe.meal_type) ? recipe.meal_type : [];
  if (slot.tag) return mealTypes.includes(slot.tag) || Number(recipe.calories || 0) <= 360;
  if (mealTypes.some((type) => ['lunch', 'dinner', 'pre_workout', 'post_workout'].includes(type))) return false;
  if (Number(recipe.calories || 0) > 320) return false;
  const text = ingredientText(recipe);
  return !(FISH_PATTERN.test(text) && MAIN_CARB_PATTERN.test(text));
};

const passesNutritionSenseRules = (recipe, slot, user, dayProteinGroups = new Set()) => {
  const text = ingredientText(recipe);
  if (PROCESSED_MEAT_PATTERN.test(text)) return false;
  if (violatesUserFoodRestrictions(recipe, user)) return false;
  if (hasAmbiguousProteinBlend(recipe.ingredients)) return false;
  if (slot.type === 'breakfast' && !matchesBreakfastPreference(recipe, user.breakfast_pref)) return false;
  if (!isTrueSnack(recipe, slot)) return false;
  if (['lunch', 'dinner'].includes(slot.type) && getMainCarbIngredients(recipe.ingredients).length > 1) return false;
  const proteinGroup = getProteinGroup(recipe);
  const dietStyle = normalizeDiet(user?.diet_style || user?.diet);
  if (dietStyle === 'omnivore' && ['lunch', 'dinner'].includes(slot.type) && ['plant', 'other'].includes(proteinGroup)) {
    return false;
  }
  if (['lunch', 'dinner'].includes(slot.type) && ['fish', 'meat'].includes(proteinGroup) && dayProteinGroups.has(proteinGroup)) {
    return false;
  }
  return true;
};

const hasBreadIngredient = (ingredients = []) =>
  ingredients.some((ingredient) => /pane|toast/i.test(String(ingredient?.name || ingredient || '')));

const hasPanCookedProtein = (ingredients = []) =>
  ingredients.some((ingredient) => /petto di pollo|manzo|tacchino/i.test(String(ingredient?.name || ingredient || '')));

const buildCookingGuidance = (ingredients = []) => {
  if (!hasPanCookedProtein(ingredients)) return null;
  return {
    fat: 'Burro di ghee',
    quantity: '5 g',
    method: 'Cuoci pollo, tacchino fresco o manzo in padella con 5 g di burro di ghee; usa olio EVO solo a crudo o a fine cottura.'
  };
};

const scaleQuantity = (ingredient, factor) => {
  const quantity = Number(ingredient?.quantity);
  if (!Number.isFinite(quantity) || !['g', 'ml'].includes(String(ingredient?.unit || '').toLowerCase())) return ingredient;
  return {
    ...ingredient,
    quantity: Math.max(1, Math.round(quantity * factor))
  };
};

const scaleNutrition = (nutrition, factor) => ({
  calories: Math.round(Number(nutrition.calories || 0) * factor),
  protein: Math.round(Number(nutrition.protein || 0) * factor * 10) / 10,
  carbs: Math.round(Number(nutrition.carbs || 0) * factor * 10) / 10,
  fats: Math.round(Number(nutrition.fats || 0) * factor * 10) / 10,
  fiber: Math.round(Number(nutrition.fiber || 0) * factor * 10) / 10,
  source: nutrition.source,
  sourceCoverage: nutrition.sourceCoverage,
  sourceIds: nutrition.sourceIds
});

const adaptRecipeToSlot = ({ ingredients, nutrition, slot }) => {
  const calories = Number(nutrition.calories || 0);
  if (!calories || !slot.calories) return { ingredients, nutrition, portionScale: 1, note: null };
  const rawFactor = slot.calories / calories;
  if (rawFactor >= 0.92 && rawFactor <= 1.08) return { ingredients, nutrition, portionScale: 1, note: null };
  const factor = Math.max(0.75, Math.min(1.25, rawFactor));
  return {
    ingredients: ingredients.map((ingredient) => scaleQuantity(ingredient, factor)),
    nutrition: scaleNutrition(nutrition, factor),
    portionScale: Math.round(factor * 100) / 100,
    note: factor < 1
      ? 'Grammature ridotte per rispettare il target calorico senza rendere il pasto misero.'
      : 'Grammature aumentate in modo controllato per avvicinare il pasto al target dello slot.'
  };
};

const buildRuntimeNutrition = (recipe, ingredients) => {
  const declared = {
    calories: Number(recipe.calories || 0),
    protein: Number(recipe.protein || 0),
    carbs: Number(recipe.carbs || 0),
    fats: Number(recipe.fats || 0),
    fiber: Number(recipe.fiber || 0),
    source: 'recipe_declared'
  };

  if (!hasBreadIngredient(ingredients)) return declared;

  const ingredientNutrition = buildSourceBackedNutritionFromIngredients(ingredients);
  if (!ingredientNutrition || ingredientNutrition.sourceCoverage < 75) return declared;

  return {
    ...ingredientNutrition.totals,
    source: 'ingredient_runtime_official_average',
    sourceCoverage: ingredientNutrition.sourceCoverage,
    sourceIds: ingredientNutrition.sourceIds
  };
};

const timeToHour = (value, fallback) => {
  if (value == null || value === '') return fallback;
  if (typeof value === 'number') return value;
  const hour = Number(String(value).split(':')[0]);
  return Number.isFinite(hour) ? hour : fallback;
};

const getCurrentSeason = (date = new Date()) => {
  const month = date.getUTCMonth() + 1;
  if ([12, 1, 2].includes(month)) return 'winter';
  if ([3, 4, 5].includes(month)) return 'spring';
  if ([6, 7, 8].includes(month)) return 'summer';
  return 'fall';
};

const getTrainingBias = (user) => {
  const time = String(user.training_time || '').toLowerCase();
  if (['morning', 'mattina'].includes(time)) return 'morning';
  if (['lunch', 'pausa pranzo'].includes(time)) return 'midday';
  if (['afternoon', 'pomeriggio'].includes(time)) return 'afternoon';
  if (['evening', 'sera'].includes(time)) return 'evening';
  return 'neutral';
};

const calculateMealStructure = (user, targets) => {
  const dayStart = timeToHour(user.day_start, 7);
  const dayEnd = timeToHour(user.day_end, 22);
  const eatingWindow = Math.max(8, dayEnd - dayStart);
  const trainingBias = getTrainingBias(user);
  let slots;

  if (eatingWindow >= 15) {
    slots = [
      { key: 'breakfast', type: 'breakfast', ratio: 0.22 },
      { key: 'snack_morning', type: 'snack', ratio: 0.08 },
      { key: 'lunch', type: 'lunch', ratio: 0.32 },
      { key: 'snack_afternoon', type: 'snack', ratio: 0.1 },
      { key: 'dinner', type: 'dinner', ratio: 0.23 },
      { key: 'snack_evening', type: 'snack', ratio: 0.05 }
    ];
  } else if (eatingWindow >= 12) {
    slots = [
      { key: 'breakfast', type: 'breakfast', ratio: 0.25 },
      { key: 'lunch', type: 'lunch', ratio: 0.35 },
      { key: 'snack_afternoon', type: 'snack', ratio: 0.1 },
      { key: 'dinner', type: 'dinner', ratio: 0.25 },
      { key: 'snack_evening', type: 'snack', ratio: 0.05 }
    ];
  } else {
    slots = [
      { key: 'breakfast', type: 'breakfast', ratio: 0.27 },
      { key: 'lunch', type: 'lunch', ratio: 0.38 },
      { key: 'snack_afternoon', type: 'snack', ratio: 0.1 },
      { key: 'dinner', type: 'dinner', ratio: 0.25 }
    ];
  }

  if (trainingBias === 'morning') {
    slots = slots.map((slot) => slot.key === 'breakfast'
      ? { ...slot, ratio: slot.ratio + 0.04, tag: 'post_workout' }
      : slot.key === 'dinner'
        ? { ...slot, ratio: slot.ratio - 0.04 }
        : slot);
  }

  if (trainingBias === 'afternoon' || trainingBias === 'evening') {
    slots = slots.map((slot) => slot.key === 'snack_afternoon'
      ? { ...slot, tag: 'pre_workout' }
      : slot.key === 'dinner'
        ? { ...slot, ratio: slot.ratio + 0.03, tag: 'post_workout' }
        : slot.key === 'breakfast'
          ? { ...slot, ratio: slot.ratio - 0.04 }
          : slot);
  }

  const ratioTotal = slots.reduce((sum, slot) => sum + slot.ratio, 0);

  return slots.map((slot) => ({
    ...slot,
    calories: Math.round((targets.calories * slot.ratio) / ratioTotal),
    protein: Math.round((targets.protein * slot.ratio) / ratioTotal),
    carbs: Math.round((targets.carbs * slot.ratio) / ratioTotal),
    fats: Math.round((targets.fats * slot.ratio) / ratioTotal)
  }));
};

const scoreRecipe = (recipe, slot, physiologicalState) => {
  const calorieDistance = Math.abs(Number(recipe.calories || 0) - slot.calories);
  const proteinDistance = Math.abs(Number(recipe.protein || 0) - slot.protein);
  const carbDistance = Math.abs(Number(recipe.carbs || 0) - slot.carbs);
  const fatDistance = Math.abs(Number(recipe.fats || 0) - slot.fats);
  const goalTags = Array.isArray(recipe.meal_goal_tags) ? recipe.meal_goal_tags : [];
  const recoveryBonus = physiologicalState.recoveryStatus === 'compromised' && goalTags.includes('recovery') ? 4 : 0;
  const trainingBonus = slot.tag && goalTags.includes('training_fuel') ? 3 : 0;
  const satietyBonus = goalTags.includes('satiety') ? 2 : 0;
  const sodiumPenalty = recipe.sodium_level === 'high' ? 4 : recipe.sodium_level === 'medium' ? 1 : 0;
  const sugarPenalty = recipe.added_sugar_level === 'high' ? 4 : recipe.added_sugar_level === 'medium' ? 1.5 : 0;
  const wholeFoodBonus = recipe.processing_level === 'whole_food' ? 5 : 0;
  const qualityScore =
    Number(recipe.nutrient_density || 5) * 2 +
    Number(recipe.satiety_score || 5) * 1.5 +
    Number(recipe.recovery_support || 5) * (physiologicalState.recoveryStatus === 'compromised' ? 2 : 1) -
    Math.max(0, Number(recipe.glycemic_index || 50) - 55) * 0.04;
  const processingPenalty = String(recipe.processing_level || '').includes('ultra') ? 6 : 0;
  const slotBonus = Array.isArray(recipe.meal_type) && slot.tag && recipe.meal_type.includes(slot.tag) ? 5 : 0;
  const nutritionAudit = getRecipeNutritionAuditStatus(recipe);
  const officialSourceBonus = nutritionAudit.readyForPrecisionPlan ? 6 : 0;

  return qualityScore + wholeFoodBonus + slotBonus + recoveryBonus + trainingBonus + satietyBonus + officialSourceBonus -
    calorieDistance * 0.045 -
    proteinDistance * 0.08 -
    carbDistance * 0.025 -
    fatDistance * 0.05 -
    processingPenalty - sodiumPenalty - sugarPenalty - nutritionAudit.scoringPenalty;
};

const explainRecipeSelection = (recipe, slot, physiologicalState) => {
  const reasons = [
    `Meal type '${slot.type}' matched to the eating-window structure.`,
    `Calories are compared with the slot target (${slot.calories} kcal).`,
    'Quality score uses satiety, nutrient density, processing level, glycemic index, and recovery support.'
  ];
  const goalTags = Array.isArray(recipe.meal_goal_tags) ? recipe.meal_goal_tags : [];

  if (physiologicalState.recoveryStatus === 'compromised') {
    reasons.push('Recovery mode increases the weight of recovery-support foods.');
  }

  if (slot.tag === 'pre_workout') {
    reasons.push('Pre-workout slot favors available carbohydrate with controlled fat/fiber load.');
  }

  if (slot.tag === 'post_workout') {
    reasons.push('Post-workout slot favors protein plus carbohydrate for recovery support.');
  }

  if (Number(recipe.protein || 0) >= slot.protein) {
    reasons.push('Protein meets or exceeds this slot target.');
  }

  if (goalTags.length > 0) {
    reasons.push(`Recipe goal tags considered: ${goalTags.join(', ')}.`);
  }

  const nutritionAudit = getRecipeNutritionAuditStatus(recipe);
  if (nutritionAudit.readyForPrecisionPlan) {
    reasons.push('Recipe macros are source-backed and approved by the DUBI nutrition audit layer.');
  } else {
    reasons.push(`Nutrition audit status: ${nutritionAudit.auditStatus}; confidence ${nutritionAudit.sourceConfidence}/100. Pending recipes are penalized until source-backed ingredient data are loaded.`);
  }

  return reasons;
};

module.exports = (pool) => {
  const router = express.Router();
  const authModule = require('./auth')(pool);
  const { verifyToken } = authModule;

  const getUserProfile = async (userId) => {
    try {
      const result = await pool.query(
        `
        SELECT
          u.id,
          u.email,
          COALESCE(o.name, '') AS name,
          COALESCE(o.gender, 'male') AS gender,
          COALESCE(o.age, u.age) AS age,
          COALESCE(o.height, u.height) AS height,
          COALESCE(o.weight, u.weight) AS weight,
          COALESCE(o.goal, u.goal, 'maintain') AS goal,
          o.target_weight,
          o.target_body_fat,
          o.occupation,
          o.workout_days,
          o.workout_duration,
          o.workout_intensity,
          o.daily_steps,
          COALESCE(o.diet, 'omnivore') AS diet_style,
          o.allergies,
          o.sport,
          o.training_time,
          o.breakfast_pref,
          o.day_start,
          o.day_end,
          COALESCE(o.wearable_provider, 'none') AS wearable_provider
        FROM users u
        LEFT JOIN user_onboarding o ON o.user_id = u.id
        WHERE u.id = $1
        `,
        [userId]
      );

      return result.rows[0] || null;
    } catch (error) {
      console.error('User onboarding profile read failed, falling back to users table:', error);
      const fallback = await pool.query(
        `
        SELECT
          id,
          email,
          '' AS name,
          'male' AS gender,
          age,
          height,
          weight,
          COALESCE(goal, 'maintain') AS goal,
          NULL AS target_weight,
          NULL AS target_body_fat,
          NULL AS occupation,
          0 AS workout_days,
          '45-60' AS workout_duration,
          'moderate' AS workout_intensity,
          'unknown' AS daily_steps,
          'omnivore' AS diet_style,
          '' AS allergies,
          NULL AS sport,
          NULL AS training_time,
          'both' AS breakfast_pref,
          NULL AS day_start,
          NULL AS day_end,
          'none' AS wearable_provider
        FROM users
        WHERE id = $1
        `,
        [userId]
      );
      return fallback.rows[0] || null;
    }
  };

  const getWearableDataLast7Days = async (userId) => {
    const result = await pool.query(
      `
      SELECT *
      FROM wearable_data
      WHERE user_id = $1
      ORDER BY synced_at DESC
      LIMIT 7
      `,
      [userId]
    );

    return result.rows.reverse();
  };

  const interpretPhysiologicalState = async (userId) => {
    const wearableData = await getWearableDataLast7Days(userId);

    if (wearableData.length < 3) {
      return {
        status: 'insufficient_data',
        recoveryStatus: 'normal',
        fatigueLevel: 'unknown',
        sympatheticDominance: false,
        glucoseDemand: 'moderate',
        dataPoints: wearableData.length
      };
    }

    const hrvTrend = calculateTrend(wearableData.map((day) => day.hrv));
    const sleepTrend = calculateTrend(wearableData.map(getSleepHours));
    const recoveryTrend = calculateTrend(wearableData.map(getRecoveryScore));
    const activityTrend = calculateTrend(wearableData.map((day) => day.activity_kcal));
    const poorSleepDays = wearableData.filter((day) => {
      const sleepHours = getSleepHours(day);
      return sleepHours != null && sleepHours < 6;
    }).length;
    const avgSteps = average(wearableData.map((day) => day.steps));
    const avgActivityKcal = average(wearableData.map((day) => day.activity_kcal));
    const glucoseDemand = (avgSteps || 0) >= 12000 || (avgActivityKcal || 0) >= 700
      ? 'high'
      : (avgSteps || 0) >= 7000 || (avgActivityKcal || 0) >= 350
        ? 'moderate'
        : 'low';
    const recoveryStatus = classifyRecoveryStatus({
      hrvTrend,
      sleepTrend,
      recoveryTrend,
      poorSleepDays
    });

    return {
      status: 'ok',
      recoveryStatus,
      fatigueLevel: classifyFatigueLevel({ recoveryStatus, hrvTrend, sleepTrend, poorSleepDays }),
      sympatheticDominance: Boolean(hrvTrend.isDecreasing || recoveryStatus === 'compromised'),
      glucoseDemand,
      trends: { hrv: hrvTrend, sleep: sleepTrend, recovery: recoveryTrend, activity: activityTrend },
      poorSleepDays,
      dataPoints: wearableData.length
    };
  };

  const analyzeWeightTrend = async (userId) => {
    const result = await pool.query(
      `
      SELECT weight, logged_at
      FROM weight_history
      WHERE user_id = $1
      ORDER BY logged_at DESC
      LIMIT 21
      `,
      [userId]
    );
    const weights = result.rows.reverse();

    if (weights.length < 10) return { status: 'insufficient_data', dataPoints: weights.length };

    const recentWindow = weights.slice(-7);
    const previousWindow = weights.slice(-14, -7);
    const previousAvg = average(previousWindow.map((row) => row.weight));
    const recentAvg = average(recentWindow.map((row) => row.weight));

    if (previousAvg == null || recentAvg == null || previousWindow.length < 3 || recentWindow.length < 3) {
      return { status: 'insufficient_data', dataPoints: weights.length };
    }

    const firstDate = weights[0].logged_at;
    const lastDate = weights[weights.length - 1].logged_at;
    const observationDays = daysBetween(firstDate, lastDate);
    const delta = recentAvg - previousAvg;
    const weeklyDelta = observationDays > 0 ? delta / Math.max(1, observationDays / 7) : delta;

    return {
      status: Math.abs(weeklyDelta) < 0.2 ? 'stagnant' : weeklyDelta < 0 ? 'decreasing' : 'increasing',
      delta: Math.round(delta * 10) / 10,
      weeklyDelta: Math.round(weeklyDelta * 10) / 10,
      recentAverage: Math.round(recentAvg * 10) / 10,
      previousAverage: Math.round(previousAvg * 10) / 10,
      observationDays,
      rollingWindowDays: 7,
      dataPoints: weights.length
    };
  };

  const decideRegenerationFromWeight = ({ user, weightTrend, latestWeight, force = false, reason = null }) => {
    if (force) {
      return {
        shouldRegenerate: true,
        reason: reason || 'manual_regeneration',
        explanation: 'Plan regeneration was requested explicitly.'
      };
    }

    if (!weightTrend || weightTrend.status === 'insufficient_data') {
      return {
        shouldRegenerate: false,
        reason: 'insufficient_weight_data',
        explanation: 'DUBI needs enough weight entries across about 14 days before changing the plan from weight trend alone.'
      };
    }

    if (Number(weightTrend.observationDays || 0) < 13) {
      return {
        shouldRegenerate: false,
        reason: 'trend_window_too_short',
        explanation: 'Weight data does not yet cover a full two-week trend window, so DUBI keeps the plan stable.'
      };
    }

    const goal = String(user?.goal || '').toLowerCase();
    const targetWeight = Number(user?.target_weight || 0);
    const currentWeight = Number(latestWeight || user?.weight || 0);
    const nearTarget = targetWeight > 0 && currentWeight > 0 && Math.abs(currentWeight - targetWeight) <= 1;

    if (nearTarget) {
      return {
        shouldRegenerate: false,
        reason: 'near_target_weight',
        explanation: 'Current weight is close to target; DUBI keeps the plan stable.'
      };
    }

    if (['fatloss', 'fat_loss', 'definition', 'cut'].includes(goal)) {
      if (weightTrend.status === 'stagnant') {
        return {
          shouldRegenerate: true,
          reason: 'fat_loss_stagnation',
          explanation: 'Weight trend is stagnant during a fat-loss goal, so DUBI recalibrates calories and meals.'
        };
      }
      if (weightTrend.status === 'increasing') {
        return {
          shouldRegenerate: true,
          reason: 'fat_loss_weight_increase',
          explanation: 'Weight is increasing during a fat-loss goal, so DUBI recalibrates the plan.'
        };
      }
    }

    if (['gain', 'muscle_gain'].includes(goal)) {
      if (weightTrend.status === 'decreasing' || Number(weightTrend.weeklyDelta || 0) < 0.3) {
        return {
          shouldRegenerate: true,
          reason: 'gain_not_progressing',
          explanation: 'Weight is not increasing during a gain goal, so DUBI increases support for progress.'
        };
      }
    }

    return {
      shouldRegenerate: false,
      reason: 'trend_acceptable',
      explanation: 'Weight trend is compatible with the current goal.'
    };
  };

  const queryRecipes = async ({ dietStyle, excludedAllergens, mealType, season }) => {
    const result = await pool.query(
      `
      SELECT *
      FROM recipes
      WHERE is_active = true
        AND (diet_compatibility IS NULL OR diet_compatibility @> ARRAY[$1]::varchar[])
        AND (meal_type IS NULL OR meal_type && ARRAY[$2]::varchar[])
        AND COALESCE(processing_level, 'whole_food') = 'whole_food'
        AND (
          $3::varchar[] = ARRAY[]::varchar[]
          OR allergens IS NULL
          OR NOT (allergens && $3::varchar[])
        )
        AND (
          is_seasonal = false
          OR seasons IS NULL
          OR seasons && ARRAY[$4]::varchar[]
        )
      `,
      [dietStyle, mealType, excludedAllergens, season]
    );

    return result.rows;
  };

  const queryRecipeFallback = async ({ dietStyle, excludedAllergens, mealType }) => {
    const result = await pool.query(
      `
      SELECT *
      FROM recipes
      WHERE is_active = true
        AND (diet_compatibility IS NULL OR diet_compatibility @> ARRAY[$1]::varchar[])
        AND COALESCE(processing_level, 'whole_food') = 'whole_food'
        AND (
          $2::varchar[] = ARRAY[]::varchar[]
          OR allergens IS NULL
          OR NOT (allergens && $2::varchar[])
        )
        AND (meal_type IS NULL OR meal_type && ARRAY[$3]::varchar[])
      `,
      [dietStyle, excludedAllergens, mealType]
    );

    return result.rows;
  };

  const selectRecipeForSlot = async ({ user, slot, usedRecipeIds, physiologicalState, dayProteinGroups, weeklyProteinCounts }) => {
    const dietStyle = normalizeDiet(user.diet_style);
    const excludedAllergens = normalizeAllergenList(user.allergies);
    const season = getCurrentSeason();
    let candidates = await queryRecipes({
      dietStyle,
      excludedAllergens,
      mealType: slot.type,
      season
    });
    let filterLevel = 'strict';

    const applySenseRules = (recipes) => recipes.filter((recipe) => passesNutritionSenseRules(recipe, slot, user, dayProteinGroups));

    candidates = applySenseRules(candidates)
      .filter((recipe) => Math.abs(Number(recipe.calories || 0) - slot.calories) <= 180);

    if (candidates.length === 0) {
      candidates = applySenseRules(await queryRecipes({
        dietStyle,
        excludedAllergens,
        mealType: slot.type,
        season
      }));
      filterLevel = 'relaxed_calories';
    }

    if (candidates.length === 0) {
      candidates = applySenseRules(await queryRecipeFallback({
        dietStyle,
        excludedAllergens,
        mealType: slot.type
      }));
      filterLevel = 'diet_allergy_no_season';
    }

    if (candidates.length === 0) return null;

    const scored = candidates
      .map((recipe) => {
        const proteinGroup = getProteinGroup(recipe);
        const meatRotationBonus = dietStyle === 'omnivore'
          && ['lunch', 'dinner'].includes(slot.type)
          && proteinGroup === 'meat'
          && Number(weeklyProteinCounts?.meat || 0) < 3
          ? 8
          : 0;
        return {
          ...recipe,
          dubi_score: scoreRecipe(recipe, slot, physiologicalState) + meatRotationBonus
        };
      });
    const unused = scored.filter((recipe) => !usedRecipeIds.has(String(recipe.id)));
    const poolForSlot = unused.length > 0 ? unused : scored;
    const sorted = poolForSlot.sort((a, b) => b.dubi_score - a.dubi_score);

    const selected = sorted[0];
    const selectedNutritionAudit = getRecipeNutritionAuditStatus(selected);
    const displayIngredients = withIngredientSwaps(selected.ingredients || [], user);
    const runtimeNutrition = buildRuntimeNutrition(selected, displayIngredients);
    const adaptation = adaptRecipeToSlot({
      ingredients: displayIngredients,
      nutrition: runtimeNutrition,
      slot
    });
    const finalIngredients = adaptation.ingredients;
    const finalNutrition = adaptation.nutrition;
    const cookingGuidance = buildCookingGuidance(finalIngredients);
    const selectedProteinGroup = getProteinGroup(selected);
    if (['lunch', 'dinner'].includes(slot.type) && ['fish', 'meat'].includes(selectedProteinGroup)) {
      dayProteinGroups.add(selectedProteinGroup);
      weeklyProteinCounts[selectedProteinGroup] = Number(weeklyProteinCounts[selectedProteinGroup] || 0) + 1;
    }
    usedRecipeIds.add(String(selected.id));

    return {
      id: selected.id,
      name: selected.name,
      description: selected.description,
      ingredients: finalIngredients,
      slot: slot.key,
      mealType: slot.type,
      cuisine: selected.cuisine,
      practical: {
        prepTimeMinutes: selected.prep_time_minutes,
        costLevel: selected.cost_level,
        difficulty: selected.difficulty,
        cookingGuidance,
        portionScale: adaptation.portionScale,
        portionNote: adaptation.note
      },
      target: {
        calories: slot.calories,
        protein: slot.protein,
        carbs: slot.carbs,
        fats: slot.fats
      },
      nutrition: {
        calories: finalNutrition.calories,
        protein: finalNutrition.protein,
        carbs: finalNutrition.carbs,
        fats: finalNutrition.fats,
        fiber: finalNutrition.fiber,
        source: finalNutrition.source,
        sourceCoverage: finalNutrition.sourceCoverage,
        sourceIds: finalNutrition.sourceIds
      },
      quality: {
        satietyScore: selected.satiety_score,
        nutrientDensity: selected.nutrient_density,
        processingLevel: selected.processing_level,
        glycemicIndex: selected.glycemic_index,
        recoverySupport: selected.recovery_support,
        sodiumLevel: selected.sodium_level,
        addedSugarLevel: selected.added_sugar_level,
        score: Math.round(selected.dubi_score * 10) / 10,
        nutritionAuditStatus: selectedNutritionAudit.auditStatus,
        nutritionConfidenceScore: selectedNutritionAudit.sourceConfidence,
        sourceBackedMacros: selectedNutritionAudit.readyForPrecisionPlan || finalNutrition.source === 'ingredient_runtime_official_average',
        runtimeMacroSource: finalNutrition.source
      },
      filters: {
        level: filterLevel,
        dietStyle,
        excludedAllergens,
        season,
        mealGoalTags: selected.meal_goal_tags || [],
        avoidIf: selected.avoid_if || []
      },
      scienceTrace: {
        reasons: [
          ...explainRecipeSelection(selected, slot, physiologicalState),
          'Nutrition sense guard applied: breakfast preference, snack suitability, no processed deli meats, and one main carb source for main meals.',
          ...(adaptation.note ? [adaptation.note] : []),
          ...(cookingGuidance ? [cookingGuidance.method] : [])
        ],
        scoringInputs: {
          satietyScore: selected.satiety_score,
          nutrientDensity: selected.nutrient_density,
          processingLevel: selected.processing_level,
          glycemicIndex: selected.glycemic_index,
          recoverySupport: selected.recovery_support,
          sodiumLevel: selected.sodium_level,
          addedSugarLevel: selected.added_sugar_level,
          mealGoalTags: selected.meal_goal_tags,
          avoidIf: selected.avoid_if,
          nutritionAudit: selectedNutritionAudit
        },
        source: selected.scientific_source,
        evidenceLevel: selected.evidence_level
      },
      scientificSource: selected.scientific_source,
      evidenceLevel: selected.evidence_level
    };
  };

  const generateMeals = async (user, targets, physiologicalState) => {
    const structure = calculateMealStructure(user, targets);
    const days = [];
    const usedRecipeIds = new Set();
    const weeklyProteinCounts = { meat: 0, fish: 0 };

    for (let day = 0; day < 7; day += 1) {
      const meals = [];
      const dayProteinGroups = new Set();

      for (const slot of structure) {
        const selected = await selectRecipeForSlot({
          user,
          slot,
          usedRecipeIds,
          physiologicalState,
          dayProteinGroups,
          weeklyProteinCounts
        });

        if (selected) meals.push(selected);
      }

      const totals = meals.reduce(
        (sum, meal) => ({
          calories: sum.calories + Number(meal.nutrition.calories || 0),
          protein: sum.protein + Number(meal.nutrition.protein || 0),
          carbs: sum.carbs + Number(meal.nutrition.carbs || 0),
          fats: sum.fats + Number(meal.nutrition.fats || 0),
          fiber: sum.fiber + Number(meal.nutrition.fiber || 0)
        }),
        { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 }
      );

      days.push({
        day,
        meals,
        totals,
        targetDelta: {
          calories: totals.calories - targets.calories,
          protein: totals.protein - targets.protein,
          carbs: totals.carbs - targets.carbs,
          fats: totals.fats - targets.fats
        }
      });
    }

    return {
      version: 'fase2-layer4-v1',
      scientificBasis: [
        'Mifflin-St Jeor metabolic estimate',
        'Mifflin-St Jeor with nutritionist-reviewed PAL lookup by training days and intensity',
        'Goal macros from g/kg protein and fat, with carbohydrates calculated by difference',
        'Safety -> Recovery -> Goal -> Performance priority tree',
        'Protein target by body weight and goal',
        'Recipe filtering by diet, allergens, meal type, seasonality, breakfast preference, and snack suitability',
        'Recipe scoring by satiety, nutrient density, processing level, glycemic index, recovery support',
        'Weekly diversity guard avoids repeating the same recipe while alternatives exist',
        'Per-slot macro distance checks calories, protein, carbohydrates, and fats',
        'Meal sense guard: one main carb source, no processed deli meats, no repeated fish/meat twice in one day',
        'Portion adaptation adjusts gram weights when a recipe is nutritionally right but too high or too low for the slot'
      ],
      slots: structure,
      days
    };
  };

  const savePlan = async (userId, plan) => {
    const result = await pool.query(
      `
      INSERT INTO user_plans (
        user_id,
        calories,
        protein,
        carbs,
        fat,
        meals_count,
        goal,
        plan_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
      `,
      [
        userId,
        plan.caloriesTarget,
        plan.proteinTarget,
        plan.carbsTarget,
        plan.fatsTarget,
        plan.mealStructure?.slots?.length || 0,
        plan.goal,
        JSON.stringify(plan)
      ]
    );

    return result.rows[0];
  };

  const generateAdaptivePlan = async (userId, options = {}) => {
    const user = await getUserProfile(userId);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    const physiologicalState = await interpretPhysiologicalState(userId);
    const metabolism = calculateMetabolism(user);
    const weightTrend = await analyzeWeightTrend(userId);
    const targets = makeAdaptiveDecisions(user, metabolism, physiologicalState, weightTrend);
    const mealStructure = await generateMeals(user, targets, physiologicalState);
    const regenerationDecision = options.regenerationDecision || null;
    const plan = {
      userId,
      generatedAt: new Date().toISOString(),
      goal: user.goal,
      bmr: metabolism.bmr,
      tdee: metabolism.tdee,
      activityFactor: metabolism.activityFactor,
      caloriesTarget: targets.calories,
      proteinTarget: targets.protein,
      carbsTarget: targets.carbs,
      fatsTarget: targets.fats,
      recoveryMode: targets.recoveryMode || false,
      physiologicalState,
      weightTrend,
      regeneration: regenerationDecision ? {
        reason: regenerationDecision.reason,
        explanation: regenerationDecision.explanation,
        triggeredBy: options.triggeredBy || 'ai_engine'
      } : null,
      mealStructure,
      message: 'FASE 2 aligned. Layers 0-4 generate adaptive targets and meals.'
    };
    const savedPlan = await savePlan(userId, plan);

    return { user, plan, savedPlan };
  };

  router.get('/test', (req, res) => {
    res.json({
      message: 'DUBI AI Engine FASE 1 is running',
      layers: [
        'Layer 0: Data Acquisition',
        'Layer 1: Physiological Interpretation',
        'Layer 2: Metabolic Modeling',
        'Layer 3: Adaptive Decisions baseline',
        'Layer 4: Meal Generation Pipeline'
      ],
      nextSteps: 'Layer 5: Anomaly Attribution'
    });
  });

  router.post('/generate-plan', verifyToken, async (req, res) => {
    try {
      const { plan, savedPlan } = await generateAdaptivePlan(req.userId, {
        triggeredBy: 'manual_generate'
      });

      res.json({ success: true, plan, savedPlanId: savedPlan.id });
    } catch (error) {
      console.error('AI plan generation error:', error);
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  router.post('/regenerate', verifyToken, async (req, res) => {
    try {
      const { reason } = req.body || {};
      const user = await getUserProfile(req.userId);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const weightTrend = await analyzeWeightTrend(req.userId);
      const latestWeightResult = await pool.query(
        `
        SELECT weight
        FROM weight_history
        WHERE user_id = $1
        ORDER BY logged_at DESC
        LIMIT 1
        `,
        [req.userId]
      );
      const latestWeight = latestWeightResult.rows[0]?.weight || user.weight;
      const regenerationDecision = decideRegenerationFromWeight({
        user,
        weightTrend,
        latestWeight,
        force: true,
        reason
      });
      const { plan, savedPlan } = await generateAdaptivePlan(req.userId, {
        regenerationDecision,
        triggeredBy: 'manual_regenerate'
      });

      res.json({
        success: true,
        regenerated: true,
        decision: regenerationDecision,
        plan,
        savedPlanId: savedPlan.id
      });
    } catch (error) {
      console.error('AI plan regeneration error:', error);
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  router.post('/weight/log', verifyToken, async (req, res) => {
    try {
      const weight = Number(req.body?.weight);

      if (!Number.isFinite(weight) || weight < 30 || weight > 300) {
        return res.status(400).json({ error: 'Valid weight is required' });
      }

      const logged = await pool.query(
        `
        INSERT INTO weight_history (user_id, weight)
        VALUES ($1, $2)
        RETURNING *
        `,
        [req.userId, weight]
      );

      await pool.query('UPDATE users SET weight = $1 WHERE id = $2', [weight, req.userId]);
      await pool.query(
        `
        UPDATE user_onboarding
        SET weight = $1, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $2
        `,
        [weight, req.userId]
      );

      const user = await getUserProfile(req.userId);
      const weightTrend = await analyzeWeightTrend(req.userId);
      const regenerationDecision = decideRegenerationFromWeight({
        user,
        weightTrend,
        latestWeight: weight
      });

      let regeneratedPlan = null;
      let savedPlanId = null;

      if (regenerationDecision.shouldRegenerate) {
        const generated = await generateAdaptivePlan(req.userId, {
          regenerationDecision,
          triggeredBy: 'weight_log'
        });
        regeneratedPlan = generated.plan;
        savedPlanId = generated.savedPlan.id;
      }

      res.json({
        success: true,
        weight: logged.rows[0],
        weightTrend,
        decision: regenerationDecision,
        regenerated: Boolean(regeneratedPlan),
        plan: regeneratedPlan,
        savedPlanId
      });
    } catch (error) {
      console.error('AI weight log error:', error);
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  router.post('/anomaly/confirm', verifyToken, async (req, res) => {
    try {
      const {
        anomaly_type,
        metric,
        current_value,
        baseline_value,
        delta_percent,
        attribution,
        note,
        payload
      } = req.body || {};

      if (!anomaly_type) {
        return res.status(400).json({ error: 'anomaly_type is required' });
      }

      const decision = decideAnomalyAction(attribution);
      const result = await pool.query(
        `
        INSERT INTO user_anomaly_events (
          user_id,
          anomaly_type,
          metric,
          current_value,
          baseline_value,
          delta_percent,
          user_attribution,
          user_note,
          nutrition_related,
          action,
          excluded_from_regeneration,
          payload
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING *
        `,
        [
          req.userId,
          anomaly_type,
          metric || null,
          current_value ?? null,
          baseline_value ?? null,
          delta_percent ?? null,
          decision.attribution,
          note || null,
          decision.nutritionRelated,
          decision.action,
          decision.excludedFromRegeneration,
          JSON.stringify(payload || {})
        ]
      );

      res.json({
        success: true,
        event: result.rows[0],
        decision
      });
    } catch (error) {
      console.error('AI anomaly confirmation error:', error);
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  router.get('/plan/current', verifyToken, async (req, res) => {
    try {
      const result = await pool.query(
        `
        SELECT *
        FROM user_plans
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [req.userId]
      );

      if (result.rows.length === 0) return res.status(404).json({ error: 'No active plan' });

      res.json({ plan: result.rows[0] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/swaps', verifyToken, async (req, res) => {
    try {
      const result = await pool.query(
        `
        SELECT swap_key, day_index, meal_key, item_index, original_ingredient, replacement_ingredient, had_at_home, updated_at
        FROM user_ingredient_swaps
        WHERE user_id = $1
        ORDER BY updated_at DESC
        `,
        [req.userId]
      );

      res.json({ swaps: result.rows });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/swaps', verifyToken, async (req, res) => {
    try {
      const {
        swap_key,
        day_index,
        meal_key,
        item_index,
        original_ingredient,
        replacement_ingredient,
        had_at_home
      } = req.body || {};

      if (!swap_key || !replacement_ingredient) {
        return res.status(400).json({ error: 'swap_key and replacement_ingredient are required' });
      }

      const result = await pool.query(
        `
        INSERT INTO user_ingredient_swaps (
          user_id,
          swap_key,
          day_index,
          meal_key,
          item_index,
          original_ingredient,
          replacement_ingredient,
          had_at_home,
          updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
        ON CONFLICT (user_id, swap_key)
        DO UPDATE SET
          day_index = EXCLUDED.day_index,
          meal_key = EXCLUDED.meal_key,
          item_index = EXCLUDED.item_index,
          original_ingredient = EXCLUDED.original_ingredient,
          replacement_ingredient = EXCLUDED.replacement_ingredient,
          had_at_home = EXCLUDED.had_at_home,
          updated_at = NOW()
        RETURNING *
        `,
        [
          req.userId,
          swap_key,
          day_index ?? null,
          meal_key || null,
          item_index ?? null,
          original_ingredient || null,
          replacement_ingredient,
          had_at_home ?? null
        ]
      );

      res.json({ success: true, swap: result.rows[0] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
