const express = require('express');

const average = (values) => {
  const clean = values.map(Number).filter(Number.isFinite);
  if (clean.length === 0) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
};

const calculateTrend = (values) => {
  const clean = values.map(Number).filter(Number.isFinite);
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

const normalizeGender = (gender) => {
  const value = String(gender || '').toLowerCase();
  if (value === 'f' || value === 'female' || value === 'femmina') return 'F';
  return 'M';
};

const calculateActivityFactor = (user) => {
  let pal = 1.2;
  const workoutDays = Number(user.workout_days || 0);
  const intensity = String(user.workout_intensity || '').toLowerCase();
  const duration = String(user.workout_duration || '').toLowerCase();
  const steps = String(user.daily_steps || '').toLowerCase();

  if (workoutDays >= 5) pal += 0.3;
  else if (workoutDays >= 3) pal += 0.2;
  else if (workoutDays >= 1) pal += 0.1;

  if (['intense', 'high', 'alta'].includes(intensity)) pal += 0.15;
  else if (['moderate', 'moderata'].includes(intensity)) pal += 0.08;
  else if (['light', 'leggera'].includes(intensity)) pal += 0.03;

  if (duration.includes('90')) pal += 0.1;
  else if (duration.includes('60')) pal += 0.08;
  else if (duration.includes('45')) pal += 0.05;

  if (steps.includes('15000')) pal += 0.25;
  else if (steps.includes('10000')) pal += 0.2;
  else if (steps.includes('5000')) pal += 0.1;
  else pal += 0.08;

  return Math.round(Math.min(pal, 1.9) * 100) / 100;
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
  const goal = user.goal || 'maintain';
  const weight = Number(user.weight || 0);
  const proteinPerKg = {
    fatLoss: 2.0,
    fat_loss: 2.0,
    maintain: 1.6,
    gain: 2.0,
    muscle_gain: 2.0,
    definition: 1.8,
    cut: 1.8
  }[goal] || 1.8;
  const fatRatio = {
    fatLoss: 0.25,
    fat_loss: 0.25,
    maintain: 0.3,
    gain: 0.28,
    muscle_gain: 0.28,
    definition: 0.25,
    cut: 0.25
  }[goal] || 0.28;
  const protein = Math.round(weight * proteinPerKg);
  const fats = Math.round((metabolism.tdee * fatRatio) / 9);
  const carbs = Math.max(0, Math.round((metabolism.tdee - protein * 4 - fats * 9) / 4));

  return { calories: metabolism.tdee, protein, carbs, fats };
};

const makeAdaptiveDecisions = (user, metabolism, physiologicalState, weightTrend) => {
  const goal = user.goal || 'maintain';
  const minCalories = normalizeGender(user.gender) === 'M' ? 1500 : 1200;
  const goalAdjustments = {
    fatLoss: -0.2,
    fat_loss: -0.2,
    maintain: 0,
    gain: 0.15,
    muscle_gain: 0.15,
    definition: -0.15,
    cut: -0.15
  };
  const targets = calculateBaseMacroTargets(user, metabolism);
  const adjustment = goalAdjustments[goal] ?? 0;

  targets.calories = Math.max(minCalories, Math.round(metabolism.tdee * (1 + adjustment)));

  if (weightTrend.status === 'stagnant' && ['fatLoss', 'fat_loss', 'definition', 'cut'].includes(goal)) {
    targets.calories = Math.max(minCalories, Math.round(targets.calories * 0.95));
  }

  if (physiologicalState.recoveryStatus === 'compromised') {
    targets.calories = Math.max(targets.calories, Math.round(metabolism.tdee * 0.85));
    targets.protein = Math.round(targets.protein * 1.1);
    targets.carbs = Math.round(targets.carbs * 1.15);
    targets.recoveryMode = true;
  }

  targets.fats = Math.max(30, Math.round((targets.calories * 0.28) / 9));
  targets.carbs = Math.max(0, Math.round((targets.calories - targets.protein * 4 - targets.fats * 9) / 4));

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

const INGREDIENT_SWAP_LIBRARY = [
  {
    role: 'protein',
    match: /pollo|tacchino|manzo|bresaola|uova|albumi|salmone|tonno|merluzzo|branzino|sgombro|polpo|gamberi|trota|nasello|tofu|tempeh|seitan|edamame|yogurt|skyr|kefir|ricotta|fiocchi di latte|proteine/i,
    options: [
      { name: 'Petto di pollo', quantity: 150, unit: 'g', diets: ['omnivore'], allergens: [] },
      { name: 'Fesa di tacchino', quantity: 150, unit: 'g', diets: ['omnivore'], allergens: [] },
      { name: 'Uova', quantity: 2, unit: 'pz', diets: ['omnivore', 'vegetarian'], allergens: ['eggs'] },
      { name: 'Tonno al naturale', quantity: 120, unit: 'g', diets: ['omnivore', 'pescatarian'], allergens: ['fish'] },
      { name: 'Merluzzo', quantity: 160, unit: 'g', diets: ['omnivore', 'pescatarian'], allergens: ['fish'] },
      { name: 'Tofu', quantity: 170, unit: 'g', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: ['soy'] },
      { name: 'Tempeh', quantity: 150, unit: 'g', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: ['soy'] },
      { name: 'Seitan', quantity: 150, unit: 'g', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: ['gluten'] },
      { name: 'Yogurt greco 0-2%', quantity: 170, unit: 'g', diets: ['omnivore', 'vegetarian', 'pescatarian'], allergens: ['dairy'] },
      { name: 'Skyr naturale', quantity: 170, unit: 'g', diets: ['omnivore', 'vegetarian', 'pescatarian'], allergens: ['dairy'] },
      { name: 'Proteine vegetali in polvere', quantity: 25, unit: 'g', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: [] }
    ]
  },
  {
    role: 'carb',
    match: /riso|pasta|quinoa|cous cous|orzo|farro|pane|toast|piadina|wrap|gallette|crackers|patate|zucca|avena|granola|crema di riso/i,
    options: [
      { name: 'Riso basmati', quantity: 75, unit: 'g', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: [] },
      { name: 'Quinoa', quantity: 75, unit: 'g', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: [] },
      { name: 'Patate', quantity: 220, unit: 'g', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: [] },
      { name: 'Pasta integrale', quantity: 80, unit: 'g', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: ['gluten'] },
      { name: 'Cous cous', quantity: 75, unit: 'g', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: ['gluten'] },
      { name: 'Pane senza glutine', quantity: 70, unit: 'g', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: [] },
      { name: 'Gallette di riso', quantity: 3, unit: 'pz', diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian'], allergens: [] },
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
      ? { ...slot, ratio: slot.ratio + 0.04, tag: 'pre_workout' }
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
  const qualityScore =
    Number(recipe.nutrient_density || 5) * 2 +
    Number(recipe.satiety_score || 5) * 1.5 +
    Number(recipe.recovery_support || 5) * (physiologicalState.recoveryStatus === 'compromised' ? 2 : 1) -
    Math.max(0, Number(recipe.glycemic_index || 50) - 55) * 0.04;
  const processingPenalty = String(recipe.processing_level || '').includes('ultra') ? 6 : 0;
  const slotBonus = Array.isArray(recipe.meal_type) && slot.tag && recipe.meal_type.includes(slot.tag) ? 5 : 0;

  return qualityScore + slotBonus + recoveryBonus + trainingBonus + satietyBonus -
    calorieDistance * 0.045 -
    proteinDistance * 0.08 -
    carbDistance * 0.025 -
    fatDistance * 0.05 -
    processingPenalty - sodiumPenalty - sugarPenalty;
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

  return reasons;
};

module.exports = (pool) => {
  const router = express.Router();
  const authModule = require('./auth')(pool);
  const { verifyToken } = authModule;

  const getUserProfile = async (userId) => {
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
    const sleepTrend = calculateTrend(wearableData.map((day) => day.sleep_hours));
    const activityTrend = calculateTrend(wearableData.map((day) => day.activity_kcal));
    const avgSteps = average(wearableData.map((day) => day.steps));
    const avgActivityKcal = average(wearableData.map((day) => day.activity_kcal));
    const glucoseDemand = (avgSteps || 0) >= 12000 || (avgActivityKcal || 0) >= 700
      ? 'high'
      : (avgSteps || 0) >= 7000 || (avgActivityKcal || 0) >= 350
        ? 'moderate'
        : 'low';

    return {
      status: 'ok',
      recoveryStatus: hrvTrend.value != null && hrvTrend.value < 35 ? 'compromised' : 'normal',
      fatigueLevel: hrvTrend.isDecreasing && sleepTrend.isDecreasing ? 'high' : 'low',
      sympatheticDominance: Boolean(hrvTrend.isDecreasing),
      glucoseDemand,
      trends: { hrv: hrvTrend, sleep: sleepTrend, activity: activityTrend },
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
      LIMIT 14
      `,
      [userId]
    );
    const weights = result.rows.reverse();

    if (weights.length < 6) return { status: 'insufficient_data', dataPoints: weights.length };

    const split = Math.floor(weights.length / 2);
    const olderAvg = average(weights.slice(0, split).map((row) => row.weight));
    const recentAvg = average(weights.slice(split).map((row) => row.weight));
    const delta = recentAvg - olderAvg;

    return {
      status: Math.abs(delta) < 0.2 ? 'stagnant' : delta < 0 ? 'decreasing' : 'increasing',
      delta: Math.round(delta * 10) / 10,
      recentAverage: Math.round(recentAvg * 10) / 10,
      dataPoints: weights.length
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

  const queryRecipeFallback = async (mealType) => {
    const result = await pool.query(
      `
      SELECT *
      FROM recipes
      WHERE is_active = true
        AND (meal_type IS NULL OR meal_type && ARRAY[$1]::varchar[])
      `,
      [mealType]
    );

    return result.rows;
  };

  const selectRecipeForSlot = async ({ user, slot, usedRecipeIds, physiologicalState }) => {
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

    candidates = candidates.filter((recipe) => Math.abs(Number(recipe.calories || 0) - slot.calories) <= 180);

    if (candidates.length === 0) {
      candidates = await queryRecipes({
        dietStyle,
        excludedAllergens,
        mealType: slot.type,
        season
      });
      filterLevel = 'relaxed_calories';
    }

    if (candidates.length === 0) {
      candidates = await queryRecipeFallback(slot.type);
      filterLevel = 'meal_type_only';
    }

    if (candidates.length === 0) return null;

    const scored = candidates
      .map((recipe) => ({
        ...recipe,
        dubi_score: scoreRecipe(recipe, slot, physiologicalState)
      }));
    const unused = scored.filter((recipe) => !usedRecipeIds.has(String(recipe.id)));
    const poolForSlot = unused.length > 0 ? unused : scored;
    const sorted = poolForSlot.sort((a, b) => b.dubi_score - a.dubi_score);

    const selected = sorted[0];
    usedRecipeIds.add(String(selected.id));

    return {
      id: selected.id,
      name: selected.name,
      description: selected.description,
      ingredients: withIngredientSwaps(selected.ingredients || [], user),
      slot: slot.key,
      mealType: slot.type,
      cuisine: selected.cuisine,
      practical: {
        prepTimeMinutes: selected.prep_time_minutes,
        costLevel: selected.cost_level,
        difficulty: selected.difficulty
      },
      target: {
        calories: slot.calories,
        protein: slot.protein,
        carbs: slot.carbs,
        fats: slot.fats
      },
      nutrition: {
        calories: selected.calories,
        protein: selected.protein,
        carbs: selected.carbs,
        fats: selected.fats,
        fiber: selected.fiber
      },
      quality: {
        satietyScore: selected.satiety_score,
        nutrientDensity: selected.nutrient_density,
        processingLevel: selected.processing_level,
        glycemicIndex: selected.glycemic_index,
        recoverySupport: selected.recovery_support,
        sodiumLevel: selected.sodium_level,
        addedSugarLevel: selected.added_sugar_level,
        score: Math.round(selected.dubi_score * 10) / 10
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
        reasons: explainRecipeSelection(selected, slot, physiologicalState),
        scoringInputs: {
          satietyScore: selected.satiety_score,
          nutrientDensity: selected.nutrient_density,
          processingLevel: selected.processing_level,
          glycemicIndex: selected.glycemic_index,
          recoverySupport: selected.recovery_support,
          sodiumLevel: selected.sodium_level,
          addedSugarLevel: selected.added_sugar_level,
          mealGoalTags: selected.meal_goal_tags,
          avoidIf: selected.avoid_if
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

    for (let day = 0; day < 7; day += 1) {
      const meals = [];

      for (const slot of structure) {
        const selected = await selectRecipeForSlot({
          user,
          slot,
          usedRecipeIds,
          physiologicalState
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
        'Dynamic PAL activity adjustment',
        'Safety -> Recovery -> Goal -> Performance priority tree',
        'Protein target by body weight and goal',
        'Recipe filtering by diet, allergens, meal type, seasonality',
        'Recipe scoring by satiety, nutrient density, processing level, glycemic index, recovery support',
        'Weekly diversity guard avoids repeating the same recipe while alternatives exist',
        'Per-slot macro distance checks calories, protein, carbohydrates, and fats'
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
      const userId = req.userId;
      const user = await getUserProfile(userId);

      if (!user) return res.status(404).json({ error: 'User not found' });

      const physiologicalState = await interpretPhysiologicalState(userId);
      const metabolism = calculateMetabolism(user);
      const weightTrend = await analyzeWeightTrend(userId);
      const targets = makeAdaptiveDecisions(user, metabolism, physiologicalState, weightTrend);
      const mealStructure = await generateMeals(user, targets, physiologicalState);
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
        mealStructure,
        message: 'FASE 2 aligned. Layers 0-4 generate adaptive targets and meals.'
      };
      const savedPlan = await savePlan(userId, plan);

      res.json({ success: true, plan, savedPlanId: savedPlan.id });
    } catch (error) {
      console.error('AI plan generation error:', error);
      res.status(500).json({ error: error.message });
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
