const express = require('express');
const {
  generateDayPlan,
  generateBreakfastOptions,
  calcDailyGiSummary,
  buildWeeklyMealContext
} = require('../services/mealEngine');
const { buildDailyBiometricAdaptation } = require('../services/daily-adaptation');
const { WORKOUT_NUTRITION } = require('../config/workout-nutrition');

const ALLOWED_BREAKFAST_CHOICES = new Set(['dolce', 'salata', 'skip']);
const DEFAULT_TRAINING_TIME_SLOT = 'afternoon';

function normalizeBreakfastChoiceInput(value) {
  if (value === undefined || value === null) return null;
  const choice = String(value).trim().toLowerCase();
  return ALLOWED_BREAKFAST_CHOICES.has(choice) ? choice : undefined;
}

function normalizeWorkoutTimeSlotInput(value) {
  if (value === undefined || value === null || value === '') return null;
  const token = String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_');

  if (!token || ['varies', 'variable', 'varia', 'varie', 'unknown', 'unset', 'unconfirmed'].includes(token)) {
    return null;
  }

  return WORKOUT_NUTRITION.timeSlotAliases[token]
    || (WORKOUT_NUTRITION.allowedTimeSlots.includes(token) && token !== 'unset' ? token : null);
}

function planMealTypes(plan = {}) {
  return Array.isArray(plan.meals)
    ? plan.meals.map((meal) => meal?.mealType).filter(Boolean)
    : [];
}

function planHasWorkoutBlocks(plan = {}) {
  const mealTypes = planMealTypes(plan);
  return mealTypes.includes('pre_workout') && mealTypes.includes('post_workout');
}

function trainingStateFromPlan(plan = {}) {
  const workoutNutrition = plan.workoutNutrition || {};
  const active = workoutNutrition.active === true;
  return {
    hasTraining: plan.has_training ?? plan.isTrainingDay ?? active,
    resolved: plan.training_resolved ?? workoutNutrition.resolved ?? null,
    defaulted: plan.training_defaulted ?? workoutNutrition.defaulted ?? null,
    timeSlot: plan.training_time_slot ?? workoutNutrition.time_slot ?? null
  };
}

function trainingStateFromContext(context = {}) {
  const userProfile = context.userProfile || {};
  return {
    hasTraining: userProfile.trainingPlanned === true || userProfile.trainingPerformed === true,
    resolved: userProfile.trainingResolved === true,
    defaulted: userProfile.trainingDefaulted === true,
    timeSlot: userProfile.trainingTimeSlot || null
  };
}

function savedPlanNeedsTrainingRefresh(plan = {}, context = {}) {
  const saved = trainingStateFromPlan(plan);
  const current = trainingStateFromContext(context);

  if (!plan.mealGrammarAudit || !plan.mealAssemblyAudit || !plan.plantVarietyAudit || !plan.weeklyRotationAudit || !plan.seasonality_filter) {
    return true;
  }

  if (saved.hasTraining !== current.hasTraining) return true;
  if (!current.hasTraining) return false;
  if (!planHasWorkoutBlocks(plan)) return true;
  return saved.resolved !== current.resolved
    || saved.defaulted !== current.defaulted
    || saved.timeSlot !== current.timeSlot;
}

// ─── Formule scientifiche DUBI ────────────────────────────────────────────────

const calculateBMR = (weight, height, age, sex = 'male') => {
  // Mifflin-St Jeor (standard clinico)
  if (sex === 'male') return 10 * weight + 6.25 * height - 5 * age + 5;
  return 10 * weight + 6.25 * height - 5 * age - 161;
};

const calculateActivityKcal = (workoutDays = 0, workoutIntensity = 'moderate', bmr = 0) => {
  // Base sedentaria (~20% BMR)
  const base = Math.round(bmr * 0.2);
  if (!workoutDays || workoutDays <= 0) return base;

  const sessionKcal = {
    light: 250,     leggera: 250,    low: 250,
    moderate: 450,  moderata: 450,
    high: 650,      alta: 650,
    very_high: 850, molto_alta: 850,
  };
  const perSession = sessionKcal[String(workoutIntensity).toLowerCase()] || 450;
  return base + Math.round((perSession * Math.min(Number(workoutDays), 7)) / 7);
};

const calculateTDEE = (bmr, activityKcal = 500) => Math.round(bmr + activityKcal);

const GOAL_MACRO_RULES = Object.freeze({
  // Deficit/surplus and protein targets validated by the DUBI nutritionist.
  // fat_loss: Helms et al. 2014 (-20%, 2.2 g/kg to preserve lean mass).
  // definition: conservative -10% for already-lean users, 2.2 g/kg.
  // gain: Iraki et al. 2019 (+15%); Morton et al. 2018 protein plateau around 1.6 g/kg.
  // maintenance: 0%; Morton et al. 2018 1.6 g/kg.
  fat_loss: Object.freeze({ calorieMultiplier: 0.8, proteinPerKg: 2.2, label: 'fatLoss' }),
  definition: Object.freeze({ calorieMultiplier: 0.9, proteinPerKg: 2.2, label: 'definition' }),
  gain: Object.freeze({ calorieMultiplier: 1.15, proteinPerKg: 1.6, label: 'gain' }),
  maintenance: Object.freeze({ calorieMultiplier: 1, proteinPerKg: 1.6, label: 'maintenance' })
});

// Fat is the dynamic residual after protein and carbs, constrained to the AMDR
// range from the Institute of Medicine (20-35%); DUBI keeps the practical target
// window at 25-35% for standard plans and adjusts carbs to stay inside it.
const FAT_FRACTION_RANGE = Object.freeze({ min: 0.25, max: 0.35 });

const DEFAULT_CARB_FRACTION_BY_GOAL = Object.freeze({
  fat_loss: 0.40,
  definition: 0.45,
  gain: 0.50,
  maintenance: 0.45
});

const normalizeGoalForMacros = (goal) => {
  const normalized = String(goal || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_');

  if (['fat_loss', 'fatloss', 'weight_loss', 'lose_weight', 'dimagrimento'].includes(normalized)) return 'fat_loss';
  if (['definition', 'definizione', 'cut', 'cutting'].includes(normalized)) return 'definition';
  if (['gain', 'muscle_gain', 'massa', 'bulk', 'bulking', 'lean_bulk'].includes(normalized)) return 'gain';
  return 'maintenance';
};

// ─── Sport groups ─────────────────────────────────────────────────────────────

const SPORT_GROUP_MAP = {
  // ENDURANCE — alto fabbisogno calorico, carbo dominanti
  nuoto: 'endurance',             swimming: 'endurance',          swim: 'endurance',
  'nuoto sincronizzato': 'endurance', 'synchronized swimming': 'endurance',
  corsa: 'endurance',             running: 'endurance',           run: 'endurance',
  maratona: 'endurance',          marathon: 'endurance',
  mezzofondo: 'endurance',        'middle distance': 'endurance',
  ciclismo: 'endurance',          cycling: 'endurance',           bici: 'endurance',         bike: 'endurance',
  triathlon: 'endurance',
  canottaggio: 'endurance',       rowing: 'endurance',
  canoa: 'endurance',             kayak: 'endurance',
  'sci di fondo': 'endurance',    'nordic ski': 'endurance',      'cross country': 'endurance',

  // TEAM SPORT — carboidrati alti, stop-and-go intermittente
  calcio: 'team_sport',           soccer: 'team_sport',           football: 'team_sport',
  basket: 'team_sport',           basketball: 'team_sport',
  pallavolo: 'team_sport',        volleyball: 'team_sport',
  rugby: 'team_sport',
  hockey: 'team_sport',           'hockey su ghiaccio': 'team_sport',
  tennis: 'team_sport',
  padel: 'team_sport',
  handball: 'team_sport',         pallamano: 'team_sport',
  baseball: 'team_sport',
  'sci alpino': 'team_sport',     'alpine skiing': 'team_sport',  'alpine ski': 'team_sport',  sci: 'team_sport',
  surf: 'team_sport',             kitesurf: 'team_sport',         kiteboard: 'team_sport',
  scherma: 'team_sport',          fencing: 'team_sport',

  // STRENGTH — proteine dominanti, forza e ipertrofia
  palestra: 'strength',           gym: 'strength',                'weight training': 'strength',
  powerlifting: 'strength',
  crossfit: 'strength',
  arrampicata: 'strength',        climbing: 'strength',           bouldering: 'strength',
  lotta: 'strength',              wrestling: 'strength',
  judo: 'strength',
  mma: 'strength',                'mixed martial arts': 'strength',
  ginnastica: 'strength',         gymnastics: 'strength',         'ginnastica artistica': 'strength',
  boxe: 'strength',               boxing: 'strength',             pugilato: 'strength',
  karate: 'strength',             taekwondo: 'strength',
  'arti marziali': 'strength',    'martial arts': 'strength',
  sprint: 'strength',             'atletica velocita': 'strength', velocita: 'strength',

  // LOW INTENSITY — fabbisogno ridotto, macro bilanciati
  yoga: 'low_intensity',
  pilates: 'low_intensity',
  golf: 'low_intensity',
  'tiro con larco': 'low_intensity',  'tiro con l arco': 'low_intensity',  archery: 'low_intensity',  equestrian: 'low_intensity',
  equitazione: 'low_intensity',       'horse riding': 'low_intensity',     cavallo: 'low_intensity',
  'danza sportiva': 'low_intensity',  'dance sport': 'low_intensity',
  'danza classica': 'low_intensity',  ballet: 'low_intensity',             balletto: 'low_intensity',
  danza: 'low_intensity',             dance: 'low_intensity',
};

const SPORT_GROUP_PROFILES = {
  endurance: {
    tdeeBonus: 0.10,   // +10% TDEE — alto dispendio aerobico
    protein: 0.18,     // 18% kcal → proteine
    carbs:   0.57,     // 57% kcal → carboidrati
    fat:     0.25,     // 25% kcal → grassi
  },
  team_sport: {
    tdeeBonus: 0.05,   // +5% TDEE — intermittente intenso
    protein: 0.22,     // 22%
    carbs:   0.53,     // 53%
    fat:     0.25,     // 25%
  },
  strength: {
    tdeeBonus: 0.00,   // nessun bonus extra (già coperto da intensità)
    protein: 0.32,     // 32% — proteine dominanti per ipertrofia
    carbs:   0.43,     // 43%
    fat:     0.25,     // 25%
  },
  low_intensity: {
    tdeeBonus: -0.05,  // -5% TDEE — fabbisogno ridotto
    protein: 0.23,     // 23%
    carbs:   0.47,     // 47%
    fat:     0.30,     // 30% — grassi leggermente più alti
  },
};

const getSportGroup = (sport) => {
  if (!sport) return null;
  const normalized = String(sport)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .trim();
  return SPORT_GROUP_MAP[normalized] || null;
};

const normalizeSports = (sports, legacySport = null) => {
  const values = Array.isArray(sports)
    ? sports
    : (typeof sports === 'string' ? sports.split(',') : []);
  const normalized = [...new Set(values
    .map((sport) => String(sport || '').trim())
    .filter(Boolean))];

  if (normalized.length) return normalized.slice(0, 5);
  return legacySport ? [String(legacySport).trim()].filter(Boolean) : [];
};

const getSportGroups = (sports = []) => [...new Set(
  normalizeSports(sports).map(getSportGroup).filter(Boolean)
)];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const blendSportProfiles = (sportGroups = []) => {
  const groups = [...new Set(sportGroups)].filter((group) => SPORT_GROUP_PROFILES[group]);
  if (!groups.length) return null;

  const blended = groups.reduce((result, group) => {
    const profile = SPORT_GROUP_PROFILES[group];
    result.tdeeBonus += profile.tdeeBonus;
    result.protein += profile.protein;
    result.carbs += profile.carbs;
    result.fat += profile.fat;
    return result;
  }, { tdeeBonus: 0, protein: 0, carbs: 0, fat: 0 });

  for (const field of Object.keys(blended)) blended[field] /= groups.length;

  // Defensive bounds preserve every current single-sport profile while keeping
  // future mixed profiles inside the supported nutritional envelope.
  blended.tdeeBonus = clamp(blended.tdeeBonus, -0.05, 0.10);
  blended.protein = clamp(blended.protein, 0.18, 0.32);
  blended.carbs = clamp(blended.carbs, 0.40, 0.60);
  blended.fat = clamp(blended.fat, 0.20, 0.30);

  const macroTotal = blended.protein + blended.carbs + blended.fat;
  blended.protein /= macroTotal;
  blended.carbs /= macroTotal;
  blended.fat /= macroTotal;

  return { ...blended, groups };
};

// ─── Calcolo macro ────────────────────────────────────────────────────────────

const calculateMacros = (tdee, goal, blendedProfile = null, weightKg = 70) => {
  // Accepting a group string keeps this helper compatible with older callers.
  const sportProfile = typeof blendedProfile === 'string'
    ? (SPORT_GROUP_PROFILES[blendedProfile]
      ? { ...SPORT_GROUP_PROFILES[blendedProfile], groups: [blendedProfile] }
      : null)
    : blendedProfile;

  const adjustedTdee = sportProfile
    ? Math.round(tdee * (1 + sportProfile.tdeeBonus))
    : tdee;

  const normalizedGoal = normalizeGoalForMacros(goal);
  const goalRule = GOAL_MACRO_RULES[normalizedGoal] || GOAL_MACRO_RULES.maintenance;
  const calories = Math.round(adjustedTdee * goalRule.calorieMultiplier);
  const safeWeightKg = Number.isFinite(Number(weightKg)) && Number(weightKg) > 0 ? Number(weightKg) : 70;
  const protein = Math.round(safeWeightKg * goalRule.proteinPerKg);
  const proteinCalories = protein * 4;
  const desiredCarbFraction = sportProfile?.carbs
    || DEFAULT_CARB_FRACTION_BY_GOAL[normalizedGoal]
    || DEFAULT_CARB_FRACTION_BY_GOAL.maintenance;
  const desiredCarbs = Math.max(0, Math.round((calories * desiredCarbFraction) / 4));
  const minFatCalories = calories * FAT_FRACTION_RANGE.min;
  const maxFatCalories = calories * FAT_FRACTION_RANGE.max;
  const carbLowerBound = Math.max(0, Math.ceil((calories - proteinCalories - maxFatCalories) / 4));
  const carbUpperBound = Math.max(carbLowerBound, Math.floor((calories - proteinCalories - minFatCalories) / 4));
  const practicalMinCarbs = 50;
  const carbFloor = practicalMinCarbs <= carbUpperBound
    ? Math.max(carbLowerBound, practicalMinCarbs)
    : carbLowerBound;
  const carbs = clamp(desiredCarbs, carbFloor, carbUpperBound);
  const fat = Math.max(0, Math.round((calories - proteinCalories - carbs * 4) / 9));

  const sportGroups = sportProfile?.groups || [];
  const sportGroup = sportGroups.length ? sportGroups.join('+') : 'none';
  const actualMacroSplit = {
    protein: calories > 0 ? Number(((protein * 4) / calories).toFixed(4)) : 0,
    carbs: calories > 0 ? Number(((carbs * 4) / calories).toFixed(4)) : 0,
    fat: calories > 0 ? Number(((fat * 9) / calories).toFixed(4)) : 0,
  };

  return {
    calories,
    protein,
    carbs,
    fat,
    sportGroup,
    sportGroups,
    sportProfile: sportGroups.length > 1 ? `${sportGroups.join('-')}_blend` : sportGroup,
    macroSplit: actualMacroSplit,
    tdeeBonus: sportProfile ? Number(sportProfile.tdeeBonus.toFixed(4)) : 0,
    goalMacroRule: {
      goal: normalizedGoal,
      label: goalRule.label,
      calorieMultiplier: goalRule.calorieMultiplier,
      proteinPerKg: goalRule.proteinPerKg,
      fatFractionRange: FAT_FRACTION_RANGE,
      scienceReferences: [
        'Helms et al. 2014',
        'Iraki et al. 2019',
        'Morton et al. 2018',
        'Institute of Medicine AMDR'
      ]
    }
  };
};

// ─── Pathology helpers ────────────────────────────────────────────────────────

const normalizePathologyToken = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^ok_/, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const parsePathologiesFromAllergies = (text) => {
  if (!text) return [];
  const t = String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const result = [];
  const add = (p) => {
    const n = normalizePathologyToken(p);
    if (n && !result.includes(n)) result.push(n);
  };
  if (/gerd|reflusso|reflux|acido|acidita/.test(t))             add('gerd');
  if (/ibs|fodmap|colon irritabile/.test(t))                    add('ibs_fodmap');
  if (/celiac|celiachia|celiaco|glutine|gluten/.test(t))        add('celiac');
  if (/diabet/.test(t))                                         add('diabetic');
  if (/lattosio|lactose|\bdairy\b|\blatte\b|\bmilk\b/.test(t)) add('lactose_intolerant');
  if (/nichel|nickel/.test(t))                                  add('nickel');
  if (/istamina|histamine/.test(t))                             add('histamine');
  if (/gotta|gout|iperuricemia|uric/.test(t))                   add('gout');
  if (/renale|renal|kidney/.test(t))                            add('renal');
  return result;
};

// ─── Router ───────────────────────────────────────────────────────────────────

module.exports = (pool) => {
  const router = express.Router();
  const authModule = require('./auth')(pool);
  const { verifyToken } = authModule;

  const requireHealthDataConsent = async (userId, res) => {
    const { rows } = await pool.query(
      'SELECT health_data_consent FROM user_onboarding WHERE user_id = $1',
      [userId]
    );
    if (!rows[0]?.health_data_consent) {
      res.status(403).json({ error: 'health_data_consent_required' });
      return false;
    }
    return true;
  };

const httpError = (status, error, extra = {}) => {
    const err = new Error(error);
    err.status = status;
    err.payload = { error, ...extra };
    return err;
  };

  const toIsoDate = (date) => date.toISOString().slice(0, 10);

  const parseIsoDate = (value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  };

  const addUtcDays = (date, days) => {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  };

  const getWeekStartForDate = (value) => {
    const date = parseIsoDate(value);
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - day + 1);
    return toIsoDate(date);
  };

  const getWeekDatesForDate = (value) => {
    const weekStart = getWeekStartForDate(value);
    const start = parseIsoDate(weekStart);
    return Array.from({ length: 7 }, (_, index) => toIsoDate(addUtcDays(start, index)));
  };

  const loadSavedPlansForWeek = async (userId, targetDate) => {
    const weekStart = getWeekStartForDate(targetDate);
    const weekEnd = toIsoDate(addUtcDays(parseIsoDate(weekStart), 6));
    const { rows } = await pool.query(
      `SELECT plan_date, plan_data
       FROM daily_plans
       WHERE user_id = $1
         AND plan_date >= $2
         AND plan_date <= $3
       ORDER BY plan_date ASC`,
      [userId, weekStart, weekEnd]
    );

    return new Map((rows || []).map((row) => [String(row.plan_date).slice(0, 10), row.plan_data || {}]));
  };

  const loadWeeklyPlanContext = async (userId, targetDate) => {
    const weekStart = getWeekStartForDate(targetDate);
    const weekEnd = toIsoDate(addUtcDays(parseIsoDate(weekStart), 6));
    const { rows } = await pool.query(
      `SELECT plan_date, plan_data
       FROM daily_plans
       WHERE user_id = $1
         AND plan_date >= $2
         AND plan_date <= $3
         AND plan_date <> $4
       ORDER BY plan_date ASC`,
      [userId, weekStart, weekEnd, targetDate]
    );

    return buildWeeklyMealContext(rows, { weekStart, weekEnd });
  };

  const buildIngredientPlanContext = async (userId, targetDate, breakfastChoice = null) => {
    const profileResult = await pool.query(
      `SELECT uo.*, u.age, u.weight, u.height, u.goal, u.is_minor, u.parental_consent_status
       FROM user_onboarding uo
       JOIN users u ON u.id = uo.user_id
       WHERE uo.user_id = $1
       ORDER BY uo.created_at DESC LIMIT 1`,
      [userId]
    );

    if (profileResult.rows.length === 0) {
      throw httpError(404, 'User profile not found. Complete onboarding first.');
    }

    const row = profileResult.rows[0];

    if (row.is_minor && row.parental_consent_status !== 'approved') {
      throw httpError(403, 'parental_consent_required', {
        parental_consent_status: row.parental_consent_status || 'pending',
      });
    }

    if (!row.health_data_consent) {
      throw httpError(403, 'health_data_consent_required');
    }

    // Ricalcola macro sempre dal profilo corrente (mai da meal_plans cache)
    const sex          = String(row.gender || 'M').toUpperCase().startsWith('F') ? 'female' : 'male';
    const bmr          = calculateBMR(Number(row.weight) || 70, Number(row.height) || 170, Number(row.age) || 25, sex);
    const actKcal      = calculateActivityKcal(row.workout_days, row.workout_intensity, bmr);
    const tdee         = calculateTDEE(bmr, actKcal);
    const sports       = normalizeSports(row.sports, row.sport);
    const sportGroups  = getSportGroups(sports);
    const sportProfile = blendSportProfiles(sportGroups);
    const freshMacros  = calculateMacros(tdee, row.goal || 'maintain', sportProfile, Number(row.weight) || 70);
    const dailyAdaptation = await buildDailyBiometricAdaptation(pool, {
      userId,
      targetDate,
      baseTargets: freshMacros,
      profile: row,
      bmr,
      tdee
    });
    const adaptedMacros = dailyAdaptation.adjustedTargets || freshMacros;
    const trainingSignal = dailyAdaptation.signals?.training || {};
    const confirmedTimeSlot = normalizeWorkoutTimeSlotInput(trainingSignal.trainingTimeSlot);
    const habitualTimeSlot = normalizeWorkoutTimeSlotInput(row.training_time);
    const trainingMissed = trainingSignal.missedTraining === true || trainingSignal.status === 'confirmed_no';
    const hasTraining = !trainingMissed && (
      trainingSignal.planned === true
      || trainingSignal.performedTraining === true
    );
    const workoutTimeSlot = hasTraining
      ? (confirmedTimeSlot || habitualTimeSlot || DEFAULT_TRAINING_TIME_SLOT)
      : null;
    const trainingResolved = hasTraining && Boolean(confirmedTimeSlot);
    const trainingDefaulted = hasTraining && !confirmedTimeSlot;
    const workoutSport = trainingSignal.trainingSport || sports[0] || row.sport || null;
    const workoutSportGroup = getSportGroup(workoutSport)
      || sportProfile?.groups?.[0]
      || sportGroups[0]
      || 'none';
    const weeklyPlanContext = await loadWeeklyPlanContext(userId, targetDate);

    const userProfile = {
      userId,
      goal:               row.goal || 'maintain',
      dietaryStyle:       row.diet || 'omnivore',
      allergiesText:      row.allergies || '',
      pathologies:        parsePathologiesFromAllergies(row.allergies),
      workoutDays:        Number(row.workout_days) || 0,
      trainingTime:       workoutTimeSlot,
      trainingTimeSlot:   workoutTimeSlot,
      trainingStatus:     trainingSignal.status || null,
      trainingPlanned:    hasTraining,
      trainingPerformed:  trainingSignal.performedTraining === true,
      trainingMissed,
      trainingResolved,
      trainingDefaulted,
      trainingHabitualTimeSlot: habitualTimeSlot,
      trainingConfirmedTimeSlot: confirmedTimeSlot,
      trainingSport:      workoutSport,
      trainingSportGroup: workoutSportGroup,
      sportGroup:         sportProfile?.groups?.[0] ?? sportGroups[0] ?? 'none',
      sportGroups,
      dailyCalorieTarget: adaptedMacros.calories,
      dailyProteinTarget: adaptedMacros.protein,
      dailyCarbTarget:    adaptedMacros.carbs,
      dailyFatTarget:     adaptedMacros.fat,
      weightKg:           Number(row.weight) || 70,
      breakfastPref:      row.breakfast_pref || 'both',
      breakfastChoice:    breakfastChoice,
      breakfastChoiceReason: breakfastChoice ? 'breakfast_choice' : null,
      weeklyPlanContext,
    };

    return {
      row,
      sports,
      sportGroups,
      freshMacros,
      dailyAdaptation,
      adaptedMacros,
      userProfile,
    };
  };

  const attachPlanContext = (plan, context) => {
    plan.dailyAdaptation = context.dailyAdaptation;
    plan.baseTargets = context.dailyAdaptation.baseTargets || context.freshMacros;
    plan.adjustedTargets = context.adaptedMacros;
    plan.adaptationSignature = context.dailyAdaptation.signature;
    plan.sports = context.sports;
    plan.sport_groups = context.sportGroups;
    plan.sport_profile = context.freshMacros.sportProfile;
    plan.macro_split = context.freshMacros.macroSplit;
    return plan;
  };

  const saveDailyIngredientPlan = async (userId, targetDate, plan) => {
    await pool.query(
      `INSERT INTO daily_plans (user_id, plan_date, plan_data)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, plan_date)
       DO UPDATE SET plan_data = EXCLUDED.plan_data, generated_at = NOW()`,
      [userId, targetDate, JSON.stringify(plan)]
    );
  };

  const generateAndSaveIngredientPlan = async (userId, targetDate, breakfastChoice = null, options = {}) => {
    const context = options.context || await buildIngredientPlanContext(userId, targetDate, breakfastChoice);

    if (options.syncMealPlans !== false) {
      pool.query(
        'INSERT INTO meal_plans (user_id, calories, protein, carbs, fat) VALUES ($1, $2, $3, $4, $5)',
        [
          userId,
          context.adaptedMacros.calories,
          context.adaptedMacros.protein,
          context.adaptedMacros.carbs,
          context.adaptedMacros.fat
        ]
      ).catch(err => console.warn('[plan] meal_plans sync failed:', err.message));
    }

    const plan = attachPlanContext(
      await generateDayPlan(pool, context.userProfile, targetDate),
      context
    );

    await saveDailyIngredientPlan(userId, targetDate, plan);
    return plan;
  };

  const ensureWeekIngredientPlans = async (userId, targetDate) => {
    const weekDates = getWeekDatesForDate(targetDate);
    const weekPlans = await loadSavedPlansForWeek(userId, targetDate);

    for (const date of weekDates) {
      if (weekPlans.has(date)) continue;

      const plan = await generateAndSaveIngredientPlan(userId, date, null, {
        syncMealPlans: false,
      });
      weekPlans.set(date, plan);
    }

    return weekPlans;
  };

  // ── POST /plan/generate ───────────────────────────────────────────────────
  router.post('/generate', verifyToken, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT u.weight, u.height, u.age, u.goal, u.is_minor, u.parental_consent_status,
                uo.gender, uo.workout_days, uo.workout_intensity, uo.sport, uo.sports
         FROM users u
         LEFT JOIN user_onboarding uo ON uo.user_id = u.id
         WHERE u.id = $1
         ORDER BY uo.created_at DESC LIMIT 1`,
        [req.userId]
      );

      if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

      const user = result.rows[0];

      if (user.is_minor && user.parental_consent_status !== 'approved') {
        return res.status(403).json({
          error: 'parental_consent_required',
          parental_consent_status: user.parental_consent_status || 'pending',
        });
      }

      if (!(await requireHealthDataConsent(req.userId, res))) return;

      const sex        = String(user.gender || 'M').toUpperCase().startsWith('F') ? 'female' : 'male';
      const bmr        = calculateBMR(user.weight, user.height, user.age, sex);
      const actKcal    = calculateActivityKcal(user.workout_days, user.workout_intensity, bmr);
      const tdee       = calculateTDEE(bmr, actKcal);
      const sports       = normalizeSports(user.sports, user.sport);
      const sportGroups  = getSportGroups(sports);
      const sportProfile = blendSportProfiles(sportGroups);
      const macros       = calculateMacros(tdee, user.goal, sportProfile, Number(user.weight) || 70);

      const planResult = await pool.query(
        'INSERT INTO meal_plans (user_id, calories, protein, carbs, fat) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [req.userId, macros.calories, macros.protein, macros.carbs, macros.fat]
      );

      res.json({
        plan: planResult.rows[0],
        macros,
        calculations: { bmr: Math.round(bmr), activityKcal: actKcal, tdee, sex, sports, sportGroups, goal: user.goal },
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── GET /plan/current ─────────────────────────────────────────────────────
  router.get('/current', verifyToken, async (req, res) => {
    try {
      if (!(await requireHealthDataConsent(req.userId, res))) return;
      const result = await pool.query(
        'SELECT * FROM meal_plans WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [req.userId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'No plan found' });
      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── POST /plan/ingredient-plan/generate ───────────────────────────────────
  router.post('/ingredient-plan/generate', verifyToken, async (req, res) => {
    try {
      const { date, breakfastChoice } = req.body || {};
      const targetDate = date || new Date().toISOString().split('T')[0];
      const normalizedBreakfastChoice = normalizeBreakfastChoiceInput(breakfastChoice);

      if (breakfastChoice !== undefined && breakfastChoice !== null && !normalizedBreakfastChoice) {
        return res.status(400).json({
          error: 'invalid_breakfast_choice',
          allowed: [...ALLOWED_BREAKFAST_CHOICES],
        });
      }

      const plan = await generateAndSaveIngredientPlan(req.userId, targetDate, normalizedBreakfastChoice);
      res.json(plan);
    } catch (error) {
      if (error.status) return res.status(error.status).json(error.payload || { error: error.message });
      console.error('[plan] ingredient-plan generate error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ── GET /plan/breakfast-options ──────────────────────────────────────────
  router.get('/breakfast-options', verifyToken, async (req, res) => {
    try {
      const targetDate = req.query.date || new Date().toISOString().split('T')[0];
      const { userProfile } = await buildIngredientPlanContext(req.userId, targetDate, null);
      const options = await generateBreakfastOptions(pool, userProfile, targetDate);
      return res.json(options);
    } catch (error) {
      if (error.status) return res.status(error.status).json(error.payload || { error: error.message });
      if (error.code === 'breakfast_options_unavailable') {
        return res.status(409).json({ error: 'breakfast_options_unavailable' });
      }
      console.error('[plan] breakfast-options error:', error);
      return res.status(500).json({ error: error.message });
    }
  });

  // ── GET /plan/ingredient-plan/:date? ─────────────────────────────────────
  router.get('/ingredient-plan/:date?', verifyToken, async (req, res) => {
    try {
      if (!(await requireHealthDataConsent(req.userId, res))) return;

      const targetDate = req.params.date || new Date().toISOString().split('T')[0];
      const shouldGenerateIfMissing = String(req.query.generateIfMissing ?? 'true').toLowerCase() !== 'false';
      const result = await pool.query(
        'SELECT plan_data FROM daily_plans WHERE user_id = $1 AND plan_date = $2',
        [req.userId, targetDate]
      );

      if (result.rows.length === 0) {
        if (!shouldGenerateIfMissing) {
          return res.status(404).json({
            error: 'No plan found for this date. Call POST /plan/ingredient-plan/generate first.',
          });
        }

        const weekPlans = await ensureWeekIngredientPlans(req.userId, targetDate);
        return res.json(weekPlans.get(targetDate) || await generateAndSaveIngredientPlan(req.userId, targetDate, null));
      }

      const plan = result.rows[0].plan_data || {};
      if (shouldGenerateIfMissing) {
        const context = await buildIngredientPlanContext(req.userId, targetDate, null);
        if (savedPlanNeedsTrainingRefresh(plan, context)) {
          const refreshedPlan = await generateAndSaveIngredientPlan(req.userId, targetDate, null, { context });
          await ensureWeekIngredientPlans(req.userId, targetDate);
          return res.json(refreshedPlan);
        }

        await ensureWeekIngredientPlans(req.userId, targetDate);
      }

      if (!plan.gi_summary && Array.isArray(plan.meals)) {
        plan.gi_summary = calcDailyGiSummary(plan.meals);
      }
      if (!plan.pathology_filter) {
        plan.pathology_filter = { activePathologies: [], excludedCount: 0, totalPool: null, filteredPool: null };
      }

      res.json(plan);
    } catch (error) {
      if (error.status) return res.status(error.status).json(error.payload || { error: error.message });
      console.error('[plan] ingredient-plan fetch/generate error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
