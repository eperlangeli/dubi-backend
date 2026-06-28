const express = require('express');
const jwt = require('jsonwebtoken');

module.exports = (pool) => {
  const router = express.Router();

  const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Invalid token format' });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = decoded.userId;
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };

  const wearableMap = {
    apple: 'apple_health',
    garmin: 'garmin',
    whoop: 'whoop',
    oura: 'oura_ring',
    strava: 'strava',
    polar: 'polar',
    suunto: 'suunto',
    samsung: 'samsung_health',
    google: 'google_health_connect',
    none: 'none'
  };

  const cleanKey = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

  const canonicalFromMap = (value, map, fallback = '') => {
    const key = cleanKey(value);
    return map[key] || fallback || key;
  };

  const goalMap = {
    fatloss: 'fat_loss',
    'fat loss': 'fat_loss',
    dimagrimento: 'fat_loss',
    'perdita grasso': 'fat_loss',
    'weight loss': 'fat_loss',
    gain: 'muscle_gain',
    muscle: 'muscle_gain',
    'muscle gain': 'muscle_gain',
    massa: 'muscle_gain',
    'massa muscolare': 'muscle_gain',
    'aumento muscolare': 'muscle_gain',
    maintain: 'maintenance',
    maintenance: 'maintenance',
    mantenimento: 'maintenance',
    definition: 'definition',
    definizione: 'definition',
    competition: 'competition',
    gara: 'competition'
  };

  const dietMap = {
    onnivoro: 'omnivore',
    omnivore: 'omnivore',
    omnivoro: 'omnivore',
    pescetariano: 'pescatarian',
    pescetarian: 'pescatarian',
    pescatarian: 'pescatarian',
    vegetariano: 'vegetarian',
    vegetarian: 'vegetarian',
    vegano: 'vegan',
    vegan: 'vegan'
  };

  const intensityMap = {
    leggera: 'low',
    bassa: 'low',
    light: 'low',
    low: 'low',
    moderata: 'moderate',
    media: 'moderate',
    moderate: 'moderate',
    medium: 'moderate',
    alta: 'high',
    intensa: 'high',
    high: 'high',
    intense: 'high'
  };

  const breakfastMap = {
    dolce: 'sweet',
    sweet: 'sweet',
    salata: 'savory',
    salato: 'savory',
    savory: 'savory',
    savoury: 'savory',
    salty: 'savory',
    entrambi: 'both',
    both: 'both',
    none: 'none',
    nessuna: 'none'
  };

  const sportMap = {
    palestra: 'gym',
    gym: 'gym',
    'weight training': 'gym',
    bodybuilding: 'gym',
    corsa: 'running',
    running: 'running',
    run: 'running',
    ciclismo: 'cycling',
    bici: 'cycling',
    cycling: 'cycling',
    bike: 'cycling',
    nuoto: 'swimming',
    swimming: 'swimming',
    yoga: 'yoga',
    crossfit: 'crossfit',
    calcio: 'football',
    football: 'football',
    soccer: 'football',
    tennis: 'tennis',
    altro: 'other',
    other: 'other'
  };

  const allergyMap = {
    uovo: 'egg',
    uova: 'egg',
    egg: 'egg',
    eggs: 'egg',
    glutine: 'gluten',
    gluten: 'gluten',
    celiaco: 'gluten',
    celiachia: 'gluten',
    celiac: 'gluten',
    latte: 'dairy',
    lattosio: 'dairy',
    lactose: 'dairy',
    dairy: 'dairy',
    milk: 'dairy',
    'frutta secca': 'nuts',
    noci: 'nuts',
    mandorle: 'nuts',
    arachidi: 'nuts',
    peanuts: 'nuts',
    nuts: 'nuts',
    crostacei: 'shellfish',
    gamberi: 'shellfish',
    shellfish: 'shellfish',
    soia: 'soy',
    soy: 'soy',
    sesamo: 'sesame',
    sesame: 'sesame',
    pesce: 'fish',
    fish: 'fish'
  };

  const canonicalList = (value) => {
    const raw = Array.isArray(value) ? value : String(value || '').split(/[,;\n]+/);
    return [...new Set(raw
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .map((item) => canonicalFromMap(item, allergyMap, cleanKey(item)))
      .filter(Boolean))].join(', ');
  };

  const canonicalSports = (sports, legacySport = null) => {
    const values = Array.isArray(sports) && sports.length
      ? sports
      : (legacySport ? [legacySport] : []);
    return [...new Set(values
      .map((item) => canonicalFromMap(item, sportMap, cleanKey(item)))
      .filter(Boolean))];
  };

  const normalizeTrainingTime = (value) => canonicalFromMap(value, {
    mattina: 'morning',
    morning: 'morning',
    pranzo: 'lunch',
    lunch: 'lunch',
    'pausa pranzo': 'lunch',
    pomeriggio: 'afternoon',
    afternoon: 'afternoon',
    sera: 'evening',
    evening: 'evening',
    varia: 'varies',
    varie: 'varies',
    variable: 'varies',
    varies: 'varies'
  }, 'varies');

  router.post('/save', verifyToken, async (req, res) => {
    try {
      const {
        name,
        gender,
        age,
        height,
        weight,
        goal,
        target_weight,
        target_body_fat,
        competition_sport,
        competition_date,
        occupation,
        workout_days,
        workout_duration,
        workout_intensity,
        daily_steps,
        sedentary_days,
        diet,
        diet_intensity,
        allergies,
        sport,
        sports,
        training_time,
        breakfast_pref,
        day_start,
        day_end,
        wearable_provider,
        terms_accepted,
        privacy_accepted,
        health_data_consent,
        privacy_policy_version,
        terms_version,
        health_disclaimer_version,
        legal_accepted_at,
        health_data_consent_at,
        research_consent
      } = req.body;

      const consentResult = await pool.query(
        'SELECT is_minor, parental_consent_status FROM users WHERE id = $1',
        [req.userId]
      );

      if (consentResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const consentStatus = consentResult.rows[0].parental_consent_status || 'not_required';
      if (consentStatus === 'pending' || consentStatus === 'expired') {
        return res.status(403).json({
          error: 'parental_consent_required',
          parental_consent_status: consentStatus
        });
      }

      const cleanWearableProvider = wearableMap[wearable_provider] || 'none';
      const cleanGoal = canonicalFromMap(goal, goalMap, 'maintenance');
      const cleanDiet = canonicalFromMap(diet, dietMap, 'omnivore');
      const cleanWorkoutIntensity = canonicalFromMap(workout_intensity, intensityMap, 'moderate');
      const cleanBreakfastPref = canonicalFromMap(breakfast_pref, breakfastMap, 'both');
      if (sports !== undefined && !Array.isArray(sports)) {
        return res.status(400).json({ error: 'sports_must_be_an_array' });
      }
      const cleanSports = canonicalSports(sports, sport);
      if (cleanSports.length > 5) {
        return res.status(400).json({ error: 'too_many_sports', max: 5 });
      }
      const cleanSport = cleanSports[0] || '';
      const cleanAllergies = canonicalList(allergies);
      const cleanTrainingTime = normalizeTrainingTime(training_time);
      const cleanTime = (value, fallback) => {
        if (value === null || value === undefined || value === '') return fallback;
        if (typeof value === 'number' || /^\d{1,2}$/.test(String(value))) {
          const hour = Math.max(0, Math.min(23, Number(value) || 0));
          return `${String(hour).padStart(2, '0')}:00`;
        }
        return String(value);
      };
      const nullableBool = (value) => {
        if (value === undefined || value === null || value === '') return null;
        return Boolean(value);
      };

      const result = await pool.query(
        `
        INSERT INTO user_onboarding (
          user_id,
          name,
          gender,
          age,
          height,
          weight,
          goal,
          target_weight,
          target_body_fat,
          competition_sport,
          competition_date,
          occupation,
          workout_days,
          workout_duration,
          workout_intensity,
          daily_steps,
          sedentary_days,
          diet,
          diet_intensity,
          allergies,
          sport,
          training_time,
          breakfast_pref,
          day_start,
          day_end,
          wearable_provider,
          terms_accepted,
          privacy_accepted,
          health_data_consent,
          privacy_policy_version,
          terms_version,
          health_disclaimer_version,
          legal_accepted_at,
          health_data_consent_at,
          research_consent,
          sports,
          onboarding_completed,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
          $31, $32, $33, $34, $35, $36, true, CURRENT_TIMESTAMP
        )
        ON CONFLICT (user_id)
        DO UPDATE SET
          name = EXCLUDED.name,
          gender = EXCLUDED.gender,
          age = EXCLUDED.age,
          height = EXCLUDED.height,
          weight = EXCLUDED.weight,
          goal = EXCLUDED.goal,
          target_weight = EXCLUDED.target_weight,
          target_body_fat = EXCLUDED.target_body_fat,
          competition_sport = EXCLUDED.competition_sport,
          competition_date = EXCLUDED.competition_date,
          occupation = EXCLUDED.occupation,
          workout_days = EXCLUDED.workout_days,
          workout_duration = EXCLUDED.workout_duration,
          workout_intensity = EXCLUDED.workout_intensity,
          daily_steps = EXCLUDED.daily_steps,
          sedentary_days = EXCLUDED.sedentary_days,
          diet = EXCLUDED.diet,
          diet_intensity = EXCLUDED.diet_intensity,
          allergies = EXCLUDED.allergies,
          sport = EXCLUDED.sport,
          training_time = EXCLUDED.training_time,
          breakfast_pref = EXCLUDED.breakfast_pref,
          day_start = EXCLUDED.day_start,
          day_end = EXCLUDED.day_end,
          wearable_provider = EXCLUDED.wearable_provider,
          terms_accepted = COALESCE(EXCLUDED.terms_accepted, user_onboarding.terms_accepted),
          privacy_accepted = COALESCE(EXCLUDED.privacy_accepted, user_onboarding.privacy_accepted),
          health_data_consent = COALESCE(EXCLUDED.health_data_consent, user_onboarding.health_data_consent),
          privacy_policy_version = COALESCE(EXCLUDED.privacy_policy_version, user_onboarding.privacy_policy_version),
          terms_version = COALESCE(EXCLUDED.terms_version, user_onboarding.terms_version),
          health_disclaimer_version = COALESCE(EXCLUDED.health_disclaimer_version, user_onboarding.health_disclaimer_version),
          legal_accepted_at = COALESCE(EXCLUDED.legal_accepted_at, user_onboarding.legal_accepted_at),
          health_data_consent_at = COALESCE(EXCLUDED.health_data_consent_at, user_onboarding.health_data_consent_at),
          research_consent_revoked_at = CASE
            WHEN user_onboarding.research_consent = true AND EXCLUDED.research_consent = false THEN NOW()
            WHEN EXCLUDED.research_consent = true THEN NULL
            ELSE user_onboarding.research_consent_revoked_at
          END,
          research_consent = COALESCE(EXCLUDED.research_consent, user_onboarding.research_consent),
          sports = EXCLUDED.sports,
          onboarding_completed = true,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *;
        `,
        [
          req.userId,
          name,
          gender,
          age,
          height,
          weight,
          goal,
          target_weight,
          target_body_fat,
          competition_sport,
          competition_date,
          occupation,
          workout_days,
          workout_duration,
          cleanWorkoutIntensity,
          daily_steps,
          sedentary_days,
          cleanDiet,
          diet_intensity || 'balanced',
          cleanAllergies,
          cleanSport,
          cleanTrainingTime,
          cleanBreakfastPref,
          cleanTime(day_start, '07:00'),
          cleanTime(day_end, '23:00'),
          cleanWearableProvider,
          nullableBool(terms_accepted),
          nullableBool(privacy_accepted),
          nullableBool(health_data_consent),
          privacy_policy_version || null,
          terms_version || null,
          health_disclaimer_version || null,
          legal_accepted_at || null,
          health_data_consent_at || null,
          nullableBool(research_consent),
          cleanSports
        ]
      );

      res.json({
        message: 'Onboarding saved successfully',
        onboarding: result.rows[0]
      });
    } catch (error) {
      console.error('Onboarding save error:', error);
      try {
        const fallbackGoal = canonicalFromMap(req.body.goal, goalMap, 'maintenance');
        const fallbackDiet = canonicalFromMap(req.body.diet, dietMap, 'omnivore');
        await pool.query(
          'UPDATE users SET age = $1, height = $2, weight = $3, goal = $4 WHERE id = $5',
          [Number(req.body.age), Number(req.body.height), Number(req.body.weight), fallbackGoal, req.userId]
        );
        res.json({
          message: 'Onboarding essentials saved successfully',
          onboarding: {
            user_id: req.userId,
            name: req.body.name,
            gender: req.body.gender,
                age: req.body.age,
            height: req.body.height,
            weight: req.body.weight,
            goal: fallbackGoal,
            diet: fallbackDiet,
            fallback_storage: true
          }
        });
      } catch (fallbackError) {
        console.error('Onboarding fallback save error:', fallbackError);
        res.status(500).json({ error: 'Failed to save onboarding data' });
      }
    }
  });

  router.get('/me', verifyToken, async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT * FROM user_onboarding WHERE user_id = $1',
        [req.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Onboarding data not found' });
      }

      res.json({
        onboarding: result.rows[0]
      });
    } catch (error) {
      console.error('Onboarding fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch onboarding data' });
    }
  });

  return router;
};
