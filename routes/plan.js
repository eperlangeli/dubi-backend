const express = require('express');
const { generateDayPlan, calcDailyGiSummary } = require('../services/mealEngine');
const { buildDailyBiometricAdaptation } = require('../services/daily-adaptation');

const ALLOWED_BREAKFAST_CHOICES = new Set(['dolce', 'salata', 'skip']);

function normalizeBreakfastChoiceInput(value) {
  if (value === undefined || value === null) return null;
  const choice = String(value).trim().toLowerCase();
  return ALLOWED_BREAKFAST_CHOICES.has(choice) ? choice : undefined;
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

const calculateMacros = (tdee, goal, blendedProfile = null) => {
  // Accepting a group string keeps this helper compatible with older callers.
  const sportProfile = typeof blendedProfile === 'string'
    ? (SPORT_GROUP_PROFILES[blendedProfile]
      ? { ...SPORT_GROUP_PROFILES[blendedProfile], groups: [blendedProfile] }
      : null)
    : blendedProfile;

  // Applica bonus TDEE da sport
  const adjustedTdee = sportProfile
    ? Math.round(tdee * (1 + sportProfile.tdeeBonus))
    : tdee;

  // Aggiustamento calorico da obiettivo
  let calories;
  switch (goal) {
    case 'fat_loss':    calories = Math.round(adjustedTdee * 0.80); break;
    case 'muscle_gain': calories = Math.round(adjustedTdee * 1.15); break;
    case 'cut':         calories = Math.round(adjustedTdee * 0.85); break;
    default:            calories = adjustedTdee;
  }

  let protein, carbs, fat;

  if (sportProfile) {
    // Split macro definito dallo sport
    protein = Math.round((calories * sportProfile.protein) / 4);
    fat     = Math.round((calories * sportProfile.fat)     / 9);
    carbs   = Math.round((calories - protein * 4 - fat * 9) / 4);
  } else {
    // Split macro di default basato sull'obiettivo
    switch (goal) {
      case 'fat_loss':
        protein = Math.round((calories * 0.35) / 4);
        fat     = Math.round((calories * 0.25) / 9);
        break;
      case 'muscle_gain':
        protein = Math.round((calories * 0.30) / 4);
        fat     = Math.round((calories * 0.30) / 9);
        break;
      case 'cut':
        protein = Math.round((calories * 0.40) / 4);
        fat     = Math.round((calories * 0.25) / 9);
        break;
      default:
        protein = Math.round((calories * 0.25) / 4);
        fat     = Math.round((calories * 0.30) / 9);
    }
    carbs = Math.round((calories - protein * 4 - fat * 9) / 4);
  }

  const sportGroups = sportProfile?.groups || [];
  const sportGroup = sportGroups.length ? sportGroups.join('+') : 'none';
  return {
    calories,
    protein,
    carbs,
    fat,
    sportGroup,
    sportGroups,
    sportProfile: sportGroups.length > 1 ? `${sportGroups.join('-')}_blend` : sportGroup,
    macroSplit: sportProfile ? {
      protein: Number(sportProfile.protein.toFixed(4)),
      carbs: Number(sportProfile.carbs.toFixed(4)),
      fat: Number(sportProfile.fat.toFixed(4)),
    } : null,
    tdeeBonus: sportProfile ? Number(sportProfile.tdeeBonus.toFixed(4)) : 0,
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
      const macros       = calculateMacros(tdee, user.goal, sportProfile);

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

      const profileResult = await pool.query(
        `SELECT uo.*, u.age, u.weight, u.height, u.goal, u.is_minor, u.parental_consent_status
         FROM user_onboarding uo
         JOIN users u ON u.id = uo.user_id
         WHERE uo.user_id = $1
         ORDER BY uo.created_at DESC LIMIT 1`,
        [req.userId]
      );

      if (profileResult.rows.length === 0) {
        return res.status(404).json({ error: 'User profile not found. Complete onboarding first.' });
      }

      const row = profileResult.rows[0];

      if (row.is_minor && row.parental_consent_status !== 'approved') {
        return res.status(403).json({
          error: 'parental_consent_required',
          parental_consent_status: row.parental_consent_status || 'pending',
        });
      }

      if (!row.health_data_consent) {
        return res.status(403).json({ error: 'health_data_consent_required' });
      }

      // Ricalcola macro sempre dal profilo corrente (mai da meal_plans cache)
      const sex        = String(row.gender || 'M').toUpperCase().startsWith('F') ? 'female' : 'male';
      const bmr        = calculateBMR(Number(row.weight) || 70, Number(row.height) || 170, Number(row.age) || 25, sex);
      const actKcal    = calculateActivityKcal(row.workout_days, row.workout_intensity, bmr);
      const tdee       = calculateTDEE(bmr, actKcal);
      const sports       = normalizeSports(row.sports, row.sport);
      const sportGroups  = getSportGroups(sports);
      const sportProfile = blendSportProfiles(sportGroups);
      const freshMacros  = calculateMacros(tdee, row.goal || 'maintain', sportProfile);
      const dailyAdaptation = await buildDailyBiometricAdaptation(pool, {
        userId: req.userId,
        targetDate,
        baseTargets: freshMacros,
        profile: row,
        bmr,
        tdee
      });
      const adaptedMacros = dailyAdaptation.adjustedTargets || freshMacros;
      const trainingSignal = dailyAdaptation.signals?.training || {};
      const hasResolvedTrainingToday = trainingSignal.performedTraining === true
        || trainingSignal.planned === true;
      const plannedTrainingWithoutResolvedSlot = trainingSignal.planned === true
        && !trainingSignal.trainingTimeSlot
        && trainingSignal.status === 'unconfirmed';
      const workoutTimeSlot = plannedTrainingWithoutResolvedSlot
        ? 'unset'
        : (
            hasResolvedTrainingToday
              ? (trainingSignal.trainingTimeSlot || row.training_time || null)
              : (trainingSignal.hasWeekPlan ? null : (row.training_time || null))
          );
      const workoutSport = trainingSignal.trainingSport || sports[0] || row.sport || null;
      const workoutSportGroup = getSportGroup(workoutSport)
        || sportProfile?.groups?.[0]
        || sportGroups[0]
        || 'none';

      // Sincronizza meal_plans in background (non bloccante)
      pool.query(
        'INSERT INTO meal_plans (user_id, calories, protein, carbs, fat) VALUES ($1, $2, $3, $4, $5)',
        [req.userId, adaptedMacros.calories, adaptedMacros.protein, adaptedMacros.carbs, adaptedMacros.fat]
      ).catch(err => console.warn('[plan] meal_plans sync failed:', err.message));

      const userProfile = {
        userId:             req.userId,
        goal:               row.goal || 'maintain',
        dietaryStyle:       row.diet || 'omnivore',
        allergiesText:      row.allergies || '',
        pathologies:        parsePathologiesFromAllergies(row.allergies),
        workoutDays:        Number(row.workout_days) || 0,
        trainingTime:       workoutTimeSlot,
        trainingTimeSlot:   workoutTimeSlot,
        trainingStatus:     trainingSignal.status || null,
        trainingPlanned:    trainingSignal.planned === true,
        trainingPerformed:  trainingSignal.performedTraining === true,
        trainingMissed:     trainingSignal.missedTraining === true,
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
        breakfastChoice:    normalizedBreakfastChoice,
        breakfastChoiceReason: normalizedBreakfastChoice ? 'breakfast_choice' : null,
      };

      const plan = await generateDayPlan(pool, userProfile, targetDate);
      plan.dailyAdaptation = dailyAdaptation;
      plan.baseTargets = dailyAdaptation.baseTargets || freshMacros;
      plan.adjustedTargets = adaptedMacros;
      plan.adaptationSignature = dailyAdaptation.signature;
      plan.sports = sports;
      plan.sport_groups = sportGroups;
      plan.sport_profile = freshMacros.sportProfile;
      plan.macro_split = freshMacros.macroSplit;

      await pool.query(
        `INSERT INTO daily_plans (user_id, plan_date, plan_data)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, plan_date)
         DO UPDATE SET plan_data = EXCLUDED.plan_data, generated_at = NOW()`,
        [req.userId, targetDate, JSON.stringify(plan)]
      );

      res.json(plan);
    } catch (error) {
      console.error('[plan] ingredient-plan generate error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ── GET /plan/ingredient-plan/:date? ─────────────────────────────────────
  router.get('/ingredient-plan/:date?', verifyToken, async (req, res) => {
    try {
      if (!(await requireHealthDataConsent(req.userId, res))) return;

      const targetDate = req.params.date || new Date().toISOString().split('T')[0];
      const result = await pool.query(
        'SELECT plan_data FROM daily_plans WHERE user_id = $1 AND plan_date = $2',
        [req.userId, targetDate]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'No plan found for this date. Call POST /plan/ingredient-plan/generate first.',
        });
      }

      const plan = result.rows[0].plan_data || {};
      if (!plan.gi_summary && Array.isArray(plan.meals)) {
        plan.gi_summary = calcDailyGiSummary(plan.meals);
      }
      if (!plan.pathology_filter) {
        plan.pathology_filter = { activePathologies: [], excludedCount: 0, totalPool: null, filteredPool: null };
      }

      res.json(plan);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
