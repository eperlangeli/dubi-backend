'use strict';

const crypto = require('crypto');
const { TRAINING_ADAPTATION } = require('../config/training-adaptation');

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const toFiniteNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const round = (value, digits = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const factor = 10 ** digits;
  return Math.round(numeric * factor) / factor;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const midpoint = (range) => Math.round((Number(range?.min || 0) + Number(range?.max || 0)) / 2);

const average = (values) => {
  const clean = values.map(toFiniteNumberOrNull).filter((value) => value !== null);
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
};

const sum = (values) => values
  .map(toFiniteNumberOrNull)
  .filter((value) => value !== null)
  .reduce((total, value) => total + value, 0);

const parseIsoDate = (value) => {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return date;
};

const toIsoDate = (value = new Date()) => {
  if (typeof value === 'string' && ISO_DATE_RE.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
};

const addUtcDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const getWeekStart = (dateValue = new Date()) => {
  const parsed = dateValue instanceof Date ? dateValue : parseIsoDate(String(dateValue));
  const date = parsed && !Number.isNaN(parsed.getTime())
    ? new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()))
    : new Date();
  const day = date.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return toIsoDate(date);
};

const TRAINING_WEEKDAY_PATTERNS = Object.freeze({
  1: Object.freeze([3]),
  2: Object.freeze([2, 5]),
  3: Object.freeze([1, 3, 5]),
  4: Object.freeze([1, 2, 4, 6]),
  5: Object.freeze([1, 2, 3, 5, 6]),
  6: Object.freeze([1, 2, 3, 4, 5, 6]),
  7: Object.freeze([1, 2, 3, 4, 5, 6, 7])
});

const weekdayNumber = (targetDate) => {
  const date = parseIsoDate(targetDate);
  if (!date) return null;
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
};

const normalizeWorkoutDays = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return clamp(Math.round(numeric), 0, 7);
};

const inferPlannedTrainingFromWorkoutDays = (profile = {}, targetDate) => {
  const workoutDays = normalizeWorkoutDays(profile?.workout_days ?? profile?.workoutDays);
  if (workoutDays <= 0) {
    return { planned: false, weekdays: [], workoutDays };
  }

  const weekday = weekdayNumber(targetDate);
  const weekdays = TRAINING_WEEKDAY_PATTERNS[workoutDays] || TRAINING_WEEKDAY_PATTERNS[7];
  return {
    planned: weekday !== null ? weekdays.includes(weekday) : false,
    weekdays: [...weekdays],
    workoutDays
  };
};

const normalizeGoal = (goal) => {
  const value = String(goal || 'maintain').toLowerCase().trim();
  if (['fatloss', 'fat_loss', 'dimagrimento', 'weight_loss', 'lose_weight'].includes(value)) return 'fat_loss';
  if (['definition', 'definizione', 'cut', 'cutting'].includes(value)) return 'cut';
  if (['lean_bulk', 'lean bulk', 'massa pulita'].includes(value)) return 'lean_bulk';
  if (['gain', 'muscle_gain', 'massa', 'bulk', 'bulking'].includes(value)) return 'muscle_gain';
  return 'maintain';
};

const normalizeSex = (profile = {}) => {
  const raw = String(profile.gender || profile.sex || '').toLowerCase();
  if (['f', 'female', 'femmina', 'donna', 'woman'].includes(raw)) return 'female';
  if (['m', 'male', 'maschio', 'uomo', 'man'].includes(raw)) return 'male';
  return 'unknown';
};

const getSleepHours = (row) => {
  const value = row?.sleep_duration ?? row?.sleep_hours;
  const numeric = toFiniteNumberOrNull(value);
  return numeric !== null && numeric > 0 ? numeric : null;
};

const getRecoveryScore = (row) => {
  const numeric = toFiniteNumberOrNull(row?.recovery_score);
  return numeric !== null && numeric > 0 ? numeric : null;
};

const getDateKey = (row) => toIsoDate(row?.data_date || row?.synced_at || new Date());

const calculateTrend = (values) => {
  const clean = values.map(toFiniteNumberOrNull).filter((value) => value !== null);
  if (clean.length < TRAINING_ADAPTATION.wearableThresholds.minDaysForTrend) {
    return { status: 'insufficient_data', recent: average(clean), previous: null, difference: 0, percent: 0 };
  }

  const recent = clean.slice(-3);
  const older = clean.length >= 6 ? clean.slice(0, clean.length - 3) : clean.slice(0, clean.length - 1);
  const recentAvg = average(recent);
  const olderAvg = average(older);
  const difference = olderAvg === null || recentAvg === null ? 0 : recentAvg - olderAvg;
  const percent = olderAvg ? (difference / olderAvg) * 100 : 0;

  return {
    status: 'ok',
    recent: round(recentAvg, 1),
    previous: round(olderAvg, 1),
    difference: round(difference, 1),
    percent: round(percent, 1)
  };
};

const parseJsonb = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed === 'unknown') return 'unknown';
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return value;
};

const isPlannedForDate = (plannedDaysRaw, targetDate) => {
  const plannedDays = parseJsonb(plannedDaysRaw);
  if (!plannedDays || plannedDays === 'unknown') return null;
  if (!Array.isArray(plannedDays)) return null;
  return plannedDays.some((entry) => {
    if (typeof entry === 'string') return entry.slice(0, 10) === targetDate;
    if (typeof entry === 'number') {
      const date = parseIsoDate(targetDate);
      if (!date) return false;
      const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
      return entry === weekday || (entry === 0 && weekday === 7);
    }
    if (entry && typeof entry === 'object') {
      const value = entry.date ?? entry.day ?? entry.weekday;
      return isPlannedForDate([value], targetDate) === true;
    }
    return false;
  });
};

const fetchWearableWindow = async (pool, userId, targetDate) => {
  const { rows } = await pool.query(
    `SELECT data_date, synced_at, activity_kcal, steps, heart_rate, hrv,
            sleep_hours, sleep_duration, sleep_quality, recovery_score, weight
       FROM wearable_data
      WHERE user_id = $1
        AND COALESCE(data_date, synced_at::date) <= $2::date
      ORDER BY COALESCE(data_date, synced_at::date) DESC, synced_at DESC
      LIMIT 7`,
    [userId, targetDate]
  );
  return rows || [];
};

const fetchTrainingContext = async (pool, userId, targetDate) => {
  const weekStart = getWeekStart(targetDate);
  const [weekResult, confirmationResult] = await Promise.all([
    pool.query(
      `SELECT planned_days, source, created_at
         FROM training_week_plans
        WHERE user_id = $1 AND week_start = $2
        LIMIT 1`,
      [userId, weekStart]
    ),
    pool.query(
      `SELECT planned, status, training_time_slot,
              row_to_json(training_confirmations)->>'training_sport' AS training_sport,
              answered_at,
              detected_strain, detected_duration_min, detected_active_kcal
         FROM training_confirmations
        WHERE user_id = $1 AND day = $2
        LIMIT 1`,
      [userId, targetDate]
    )
  ]);

  const weekPlan = weekResult.rows?.[0] || null;
  const confirmation = confirmationResult.rows?.[0] || null;
  const plannedFromWeek = isPlannedForDate(weekPlan?.planned_days, targetDate);
  const planned = confirmation?.planned ?? plannedFromWeek;
  const status = confirmation?.status || 'unconfirmed';
  const detectedActiveKcal = toFiniteNumberOrNull(confirmation?.detected_active_kcal);
  const detectedDurationMin = toFiniteNumberOrNull(confirmation?.detected_duration_min);
  const detectedStrain = toFiniteNumberOrNull(confirmation?.detected_strain);
  const detectedTraining = status === 'detected_wearable'
    || detectedActiveKcal !== null
    || detectedDurationMin !== null
    || detectedStrain !== null;
  const confirmedTraining = status === 'confirmed_yes';
  const missedTraining = planned === true && status === 'confirmed_no';

  return {
    targetDate,
    weekStart,
    hasWeekPlan: Boolean(weekPlan),
    planned,
    status,
    trainingTimeSlot: confirmation?.training_time_slot || null,
    trainingSport: confirmation?.training_sport || null,
    answeredAt: confirmation?.answered_at || null,
    detected: {
      activeKcal: detectedActiveKcal,
      durationMin: detectedDurationMin,
      strain: detectedStrain
    },
    detectedTraining,
    confirmedTraining,
    performedTraining: detectedTraining || confirmedTraining,
    missedTraining
  };
};

const summarizeWearables = (rows = []) => {
  const chronological = [...rows].reverse();
  const latest = rows[0] || null;
  const thresholds = TRAINING_ADAPTATION.wearableThresholds;
  const steps = chronological.map((row) => toFiniteNumberOrNull(row.steps));
  const activityKcal = chronological.map((row) => toFiniteNumberOrNull(row.activity_kcal));
  const sleep = chronological.map(getSleepHours);
  const recovery = chronological.map(getRecoveryScore);
  const hrv = chronological.map((row) => toFiniteNumberOrNull(row.hrv));
  const poorSleepDays = sleep.filter((value) => value !== null && value < thresholds.poorSleepHours).length;
  const goodSleepDays = sleep.filter((value) => value !== null && value >= thresholds.goodSleepHours).length;
  const latestSteps = toFiniteNumberOrNull(latest?.steps);
  const latestActivityKcal = toFiniteNumberOrNull(latest?.activity_kcal);
  const latestSleepHours = getSleepHours(latest);
  const latestRecoveryScore = getRecoveryScore(latest);
  const latestHrv = toFiniteNumberOrNull(latest?.hrv);

  const trends = {
    steps: calculateTrend(steps),
    activityKcal: calculateTrend(activityKcal),
    sleep: calculateTrend(sleep),
    recovery: calculateTrend(recovery),
    hrv: calculateTrend(hrv)
  };

  const avgSteps = average(steps);
  const avgActivityKcal = average(activityKcal);
  const avgSleepHours = average(sleep);
  const avgRecoveryScore = average(recovery);
  const hasAnyWearableSignal = rows.some((row) => [
    row.steps,
    row.activity_kcal,
    row.hrv,
    row.sleep_hours,
    row.sleep_duration,
    row.recovery_score,
    row.weight
  ].some((value) => toFiniteNumberOrNull(value) !== null));
  const highActivity = (
    (latestSteps !== null && latestSteps >= thresholds.highSteps)
    || (latestActivityKcal !== null && latestActivityKcal >= thresholds.highActivityKcal)
    || (avgSteps !== null && avgSteps >= thresholds.highSteps)
    || (avgActivityKcal !== null && avgActivityKcal >= thresholds.highActivityKcal)
  );
  const veryHighActivity = (
    (latestSteps !== null && latestSteps >= thresholds.veryHighSteps)
    || (latestActivityKcal !== null && latestActivityKcal >= thresholds.veryHighActivityKcal)
  );
  const lowActivity = (
    latestSteps !== null
    && latestSteps < thresholds.lowSteps
    && (latestActivityKcal === null || latestActivityKcal < thresholds.highActivityKcal)
  );
  const hrvMeaningfulDrop = trends.hrv.status === 'ok'
    && trends.hrv.percent <= thresholds.meaningfulHrvDropPercent;
  const recoveryLow = (
    (latestRecoveryScore !== null && latestRecoveryScore < thresholds.lowRecoveryScore)
    || (avgRecoveryScore !== null && avgRecoveryScore < thresholds.lowRecoveryScore)
  );
  const sleepLow = (
    (latestSleepHours !== null && latestSleepHours < thresholds.poorSleepHours)
    || poorSleepDays >= 2
  );
  const recoveryStatus = recoveryLow || sleepLow || hrvMeaningfulDrop
    ? 'compromised'
    : (latestRecoveryScore !== null && latestRecoveryScore >= thresholds.goodRecoveryScore && goodSleepDays >= 2 ? 'good' : 'normal');

  return {
    available: hasAnyWearableSignal,
    dataPoints: rows.length,
    latest: latest ? {
      date: getDateKey(latest),
      steps: latestSteps,
      activityKcal: latestActivityKcal,
      sleepHours: latestSleepHours,
      recoveryScore: latestRecoveryScore,
      hrv: latestHrv
    } : null,
    averages7d: {
      steps: avgSteps === null ? null : Math.round(avgSteps),
      activityKcal: avgActivityKcal === null ? null : Math.round(avgActivityKcal),
      sleepHours: round(avgSleepHours, 1),
      recoveryScore: round(avgRecoveryScore, 1),
      hrv: round(average(hrv), 1)
    },
    totals7d: {
      activityKcal: Math.round(sum(activityKcal))
    },
    trends,
    flags: {
      highActivity,
      veryHighActivity,
      lowActivity,
      poorSleepDays,
      hrvMeaningfulDrop,
      recoveryLow,
      sleepLow,
      recoveryStatus
    }
  };
};

const inferConfidence = ({ wearable, training }) => {
  const hasTrainingSignal = Boolean(training?.performedTraining || training?.missedTraining || training?.planned === true);
  if (wearable.available && wearable.dataPoints >= 5 && hasTrainingSignal) return 'high';
  if ((wearable.available && wearable.dataPoints >= 3) || hasTrainingSignal) return 'medium';
  if (wearable.available && wearable.dataPoints > 0) return 'low';
  return 'none';
};

const buildSignature = (payload) => crypto
  .createHash('sha256')
  .update(JSON.stringify(payload))
  .digest('hex')
  .slice(0, 16);

const addDecision = (decisions, decision) => {
  if (!decision) return;
  decisions.push({
    id: decision.id,
    label: decision.label,
    deltaCalories: Math.round(Number(decision.deltaCalories || 0)),
    deltaCarbsG: Math.round(Number(decision.deltaCarbsG || 0)),
    deltaProteinG: Math.round(Number(decision.deltaProteinG || 0)),
    reason: decision.reason,
    evidence: decision.evidence || {}
  });
};

const applyGoalDamping = (value, goal) => {
  if (value <= 0) return value;
  const factor = TRAINING_ADAPTATION.goalDamping[goal] ?? 1;
  return Math.round(value * factor);
};

const normalizeBaseTargets = (baseTargets = {}) => ({
  calories: Math.round(Number(baseTargets.calories || 0)),
  protein: Math.round(Number(baseTargets.protein || 0)),
  carbs: Math.round(Number(baseTargets.carbs || 0)),
  fat: Math.round(Number(baseTargets.fat ?? baseTargets.fats ?? 0)),
  sportGroup: baseTargets.sportGroup || null,
  sportGroups: baseTargets.sportGroups || [],
  sportProfile: baseTargets.sportProfile || null,
  macroSplit: baseTargets.macroSplit || null,
  tdeeBonus: baseTargets.tdeeBonus || 0
});

const recalculateTargets = ({ base, deltaCalories, deltaCarbsG, profile, bmr, recoveryStatus }) => {
  const guardrails = TRAINING_ADAPTATION.guardrails;
  const sex = normalizeSex(profile);
  const minCalories = Math.max(
    guardrails.minCaloriesBySex[sex] || guardrails.minCaloriesBySex.unknown,
    bmr ? Math.round(Number(bmr) * guardrails.minCaloriesBmrMultiplier) : 0
  );
  const weightKg = Number(profile.weight || profile.weightKg || 0);
  const minProteinByKg = recoveryStatus === 'compromised'
    ? guardrails.recoveryProteinPerKg
    : guardrails.minProteinPerKg;
  const proteinFloor = weightKg > 0 ? Math.round(weightKg * minProteinByKg) : 0;
  const calories = clamp(
    base.calories + deltaCalories,
    minCalories,
    base.calories + TRAINING_ADAPTATION.guardrails.maxDailyKcalIncrease
  );
  const protein = Math.max(base.protein, proteinFloor);
  let carbs = clamp(
    base.carbs + deltaCarbsG,
    guardrails.minCarbsG,
    base.carbs + guardrails.maxDailyCarbIncreaseG
  );
  let fat = Math.round((calories - protein * 4 - carbs * 4) / 9);

  if (fat < guardrails.fatFloorG) {
    const caloriesAfterProteinAndFat = calories - protein * 4 - guardrails.fatFloorG * 9;
    carbs = Math.max(guardrails.minCarbsG, Math.round(caloriesAfterProteinAndFat / 4));
    fat = Math.round((calories - protein * 4 - carbs * 4) / 9);
  }

  if (fat < guardrails.fatFloorG) {
    fat = guardrails.fatFloorG;
  }

  return {
    calories: Math.round(calories),
    protein: Math.round(protein),
    carbs: Math.round(carbs),
    fat: Math.round(fat)
  };
};

const calculateAdaptation = ({ baseTargets, profile, bmr, tdee, wearable, training, targetDate }) => {
  const base = normalizeBaseTargets(baseTargets);
  const goal = normalizeGoal(profile?.goal);
  const decisions = [];
  let deltaCalories = 0;
  let deltaCarbsG = 0;
  const trainingFuelKcal = midpoint(TRAINING_ADAPTATION.calories.trainingDayIncreaseKcal);
  const plannedTrainingCarbs = midpoint(TRAINING_ADAPTATION.carbohydrates.plannedTrainingIncreaseG);
  const detectedTrainingCarbs = midpoint(TRAINING_ADAPTATION.carbohydrates.detectedTrainingIncreaseG);
  const inferredTraining = inferPlannedTrainingFromWorkoutDays(profile, targetDate);

  if (
    training
    && training.planned !== true
    && training.planned !== false
    && !training.hasWeekPlan
  ) {
    training.planned = inferredTraining.planned;
    training.inferredFromWorkoutDays = true;
    training.inferredWeekdayPattern = inferredTraining.weekdays;
    training.inferredWorkoutDays = inferredTraining.workoutDays;
  } else if (training) {
    training.inferredFromWorkoutDays = false;
    training.inferredWeekdayPattern = [];
    training.inferredWorkoutDays = inferredTraining.workoutDays;
  }

  if (training.performedTraining) {
    const kcal = applyGoalDamping(trainingFuelKcal, goal);
    const carbs = applyGoalDamping(detectedTrainingCarbs, goal);
    deltaCalories += kcal;
    deltaCarbsG += carbs;
    addDecision(decisions, {
      id: 'detected_or_confirmed_training',
      label: 'Detected/confirmed training fuel',
      deltaCalories: kcal,
      deltaCarbsG: carbs,
      reason: 'Today has a confirmed or wearable-detected training signal, so DUBI adds conservative fuel mainly as carbohydrates.',
      evidence: {
        status: training.status,
        detected: training.detected
      }
    });
  } else if (training.planned === true && !training.missedTraining) {
    const kcal = applyGoalDamping(trainingFuelKcal, goal);
    const carbs = applyGoalDamping(plannedTrainingCarbs, goal);
    deltaCalories += kcal;
    deltaCarbsG += carbs;
    addDecision(decisions, {
      id: 'planned_training_day',
      label: 'Planned training day fuel',
      deltaCalories: kcal,
      deltaCarbsG: carbs,
      reason: 'The weekly plan marks today as a training day, so DUBI fuels the session before wearable confirmation is available.',
      evidence: {
        planned: training.planned,
        weekStart: training.weekStart
      }
    });
  }

  if (training.missedTraining) {
    const kcal = -midpoint(TRAINING_ADAPTATION.calories.missedTrainingReductionKcal);
    const carbs = -Math.round(base.carbs * midpoint(TRAINING_ADAPTATION.carbohydrates.missedTrainingReductionPercent) / 100);
    deltaCalories += kcal;
    deltaCarbsG += carbs;
    addDecision(decisions, {
      id: 'missed_planned_training',
      label: 'Missed planned training',
      deltaCalories: kcal,
      deltaCarbsG: carbs,
      reason: 'A planned training day was confirmed as not completed, so DUBI reduces energy and carbohydrates without reducing protein.',
      evidence: {
        planned: training.planned,
        status: training.status
      }
    });
  }

  if (wearable.flags.veryHighActivity || wearable.flags.highActivity) {
    const kcalRange = wearable.flags.veryHighActivity
      ? TRAINING_ADAPTATION.calories.trainingDayIncreaseKcal
      : TRAINING_ADAPTATION.calories.highActivityIncreaseKcal;
    const carbRange = wearable.flags.veryHighActivity
      ? TRAINING_ADAPTATION.carbohydrates.detectedTrainingIncreaseG
      : TRAINING_ADAPTATION.carbohydrates.highActivityIncreaseG;
    const kcal = applyGoalDamping(midpoint(kcalRange), goal);
    const carbs = applyGoalDamping(midpoint(carbRange), goal);
    if (!training.performedTraining || wearable.flags.veryHighActivity) {
      deltaCalories += kcal;
      deltaCarbsG += carbs;
      addDecision(decisions, {
        id: wearable.flags.veryHighActivity ? 'very_high_activity' : 'high_activity',
        label: wearable.flags.veryHighActivity ? 'Very high activity load' : 'High activity load',
        deltaCalories: kcal,
        deltaCarbsG: carbs,
        reason: 'Recent wearable activity is above the conservative threshold, so DUBI increases fuel.',
        evidence: wearable.latest
      });
    }
  }

  if (
    wearable.flags.lowActivity
    && training.planned !== true
    && !training.performedTraining
    && wearable.flags.recoveryStatus !== 'compromised'
  ) {
    const kcal = -midpoint(TRAINING_ADAPTATION.calories.lowActivityReductionKcal);
    const carbs = -midpoint(TRAINING_ADAPTATION.carbohydrates.lowActivityReductionG);
    deltaCalories += kcal;
    deltaCarbsG += carbs;
    addDecision(decisions, {
      id: 'low_activity_rest_day',
      label: 'Low activity rest day',
      deltaCalories: kcal,
      deltaCarbsG: carbs,
      reason: 'Today looks like a low-activity non-training day, so DUBI makes only a small carbohydrate/energy reduction.',
      evidence: wearable.latest
    });
  }

  if (wearable.flags.recoveryStatus === 'compromised') {
    const previousCalories = deltaCalories;
    const previousCarbs = deltaCarbsG;

    if (deltaCalories < 0) deltaCalories = Math.max(deltaCalories, -100);
    if (deltaCarbsG < 0) deltaCarbsG = Math.max(deltaCarbsG, -20);

    if (training.planned === true || training.performedTraining) {
      const kcal = applyGoalDamping(midpoint(TRAINING_ADAPTATION.calories.recoverySupportKcal), goal);
      const carbs = applyGoalDamping(midpoint(TRAINING_ADAPTATION.carbohydrates.recoverySupportIncreaseG), goal);
      deltaCalories += kcal;
      deltaCarbsG += carbs;
      addDecision(decisions, {
        id: 'recovery_support',
        label: 'Recovery support guardrail',
        deltaCalories: kcal + (deltaCalories - previousCalories - kcal),
        deltaCarbsG: carbs + (deltaCarbsG - previousCarbs - carbs),
        reason: 'Sleep/recovery/HRV signals suggest stress, so DUBI avoids aggressive cuts and supports recovery conservatively.',
        evidence: {
          flags: wearable.flags,
          latest: wearable.latest,
          trends: {
            sleep: wearable.trends.sleep,
            hrv: wearable.trends.hrv,
            recovery: wearable.trends.recovery
          }
        }
      });
    } else if (previousCalories !== deltaCalories || previousCarbs !== deltaCarbsG) {
      addDecision(decisions, {
        id: 'recovery_cut_guardrail',
        label: 'Recovery cut guardrail',
        deltaCalories: deltaCalories - previousCalories,
        deltaCarbsG: deltaCarbsG - previousCarbs,
        reason: 'Recovery signals are compromised, so DUBI limits reductions instead of pushing a harder deficit.',
        evidence: {
          flags: wearable.flags,
          latest: wearable.latest
        }
      });
    }
  }

  deltaCalories = clamp(
    deltaCalories,
    -TRAINING_ADAPTATION.guardrails.maxDailyKcalReduction,
    TRAINING_ADAPTATION.guardrails.maxDailyKcalIncrease
  );
  deltaCarbsG = clamp(
    deltaCarbsG,
    -TRAINING_ADAPTATION.guardrails.maxDailyCarbReductionG,
    TRAINING_ADAPTATION.guardrails.maxDailyCarbIncreaseG
  );

  const adjustedTargets = recalculateTargets({
    base,
    deltaCalories,
    deltaCarbsG,
    profile,
    bmr,
    recoveryStatus: wearable.flags.recoveryStatus
  });
  if (adjustedTargets.protein > base.protein) {
    addDecision(decisions, {
      id: 'protein_guardrail',
      label: 'Protein guardrail',
      deltaCalories: 0,
      deltaProteinG: adjustedTargets.protein - base.protein,
      reason: 'DUBI raised protein to preserve the evidence-based per-kg floor for active users and recovery days.',
      evidence: {
        weightKg: toFiniteNumberOrNull(profile?.weight || profile?.weightKg),
        recoveryStatus: wearable.flags.recoveryStatus
      }
    });
  }
  const confidence = inferConfidence({ wearable, training });
  const applied = (
    adjustedTargets.calories !== base.calories
    || adjustedTargets.protein !== base.protein
    || adjustedTargets.carbs !== base.carbs
    || adjustedTargets.fat !== base.fat
  );
  const signature = buildSignature({
    version: TRAINING_ADAPTATION.version,
    targetDate,
    base,
    adjustedTargets,
    wearable: {
      latest: wearable.latest,
      averages7d: wearable.averages7d,
      flags: wearable.flags
    },
    training: {
      planned: training.planned,
      status: training.status,
      trainingTimeSlot: training.trainingTimeSlot,
      trainingSport: training.trainingSport,
      detected: training.detected
    }
  });

  return {
    version: TRAINING_ADAPTATION.version,
    applied,
    confidence,
    targetDate,
    baseTargets: base,
    adjustedTargets,
    deltas: {
      calories: adjustedTargets.calories - base.calories,
      proteinG: adjustedTargets.protein - base.protein,
      carbsG: adjustedTargets.carbs - base.carbs,
      fatG: adjustedTargets.fat - base.fat
    },
    guardrails: {
      proteinPreserved: adjustedTargets.protein >= base.protein,
      minProteinPerKg: wearable.flags.recoveryStatus === 'compromised'
        ? TRAINING_ADAPTATION.guardrails.recoveryProteinPerKg
        : TRAINING_ADAPTATION.guardrails.minProteinPerKg,
      fatFloorG: TRAINING_ADAPTATION.guardrails.fatFloorG,
      minCarbsG: TRAINING_ADAPTATION.guardrails.minCarbsG
    },
    signals: {
      wearable,
      training,
      metabolism: {
        bmr: bmr ? Math.round(Number(bmr)) : null,
        tdee: tdee ? Math.round(Number(tdee)) : null,
        goal
      }
    },
    decisions,
    scienceBasis: TRAINING_ADAPTATION.scienceBasis,
    signature
  };
};

const buildNeutralAdaptation = ({ targetDate, baseTargets, profile, bmr, tdee, reason }) => {
  const base = normalizeBaseTargets(baseTargets);
  return {
    version: TRAINING_ADAPTATION.version,
    applied: false,
    confidence: 'none',
    targetDate,
    baseTargets: base,
    adjustedTargets: base,
    deltas: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    guardrails: {
      proteinPreserved: true,
      minProteinPerKg: TRAINING_ADAPTATION.guardrails.minProteinPerKg,
      fatFloorG: TRAINING_ADAPTATION.guardrails.fatFloorG,
      minCarbsG: TRAINING_ADAPTATION.guardrails.minCarbsG
    },
    signals: {
      wearable: {
        available: false,
        dataPoints: 0,
        latest: null,
        averages7d: {},
        totals7d: {},
        trends: {},
        flags: { recoveryStatus: 'normal' }
      },
      training: null,
      metabolism: {
        bmr: bmr ? Math.round(Number(bmr)) : null,
        tdee: tdee ? Math.round(Number(tdee)) : null,
        goal: normalizeGoal(profile?.goal)
      }
    },
    decisions: [{
      id: 'no_adaptation',
      label: 'No daily adaptation',
      deltaCalories: 0,
      deltaCarbsG: 0,
      deltaProteinG: 0,
      reason
    }],
    scienceBasis: TRAINING_ADAPTATION.scienceBasis,
    signature: buildSignature({ version: TRAINING_ADAPTATION.version, targetDate, base, reason })
  };
};

const buildDailyBiometricAdaptation = async (pool, {
  userId,
  targetDate,
  baseTargets,
  profile,
  bmr,
  tdee
}) => {
  const date = toIsoDate(targetDate);
  if (!pool || !userId) {
    return buildNeutralAdaptation({
      targetDate: date,
      baseTargets,
      profile,
      bmr,
      tdee,
      reason: 'Missing pool or authenticated user id; daily adaptation skipped.'
    });
  }

  try {
    const [wearableRows, training] = await Promise.all([
      fetchWearableWindow(pool, userId, date),
      fetchTrainingContext(pool, userId, date)
    ]);
    const wearable = summarizeWearables(wearableRows);
    return calculateAdaptation({
      baseTargets,
      profile,
      bmr,
      tdee,
      wearable,
      training,
      targetDate: date
    });
  } catch (error) {
    console.error('[daily-adaptation] failed:', error.message);
    return buildNeutralAdaptation({
      targetDate: date,
      baseTargets,
      profile,
      bmr,
      tdee,
      reason: 'Daily adaptation unavailable; DUBI used base targets.'
    });
  }
};

module.exports = {
  buildDailyBiometricAdaptation,
  _test: {
    calculateAdaptation,
    summarizeWearables,
    isPlannedForDate,
    getWeekStart,
    normalizeBaseTargets,
    recalculateTargets
  }
};
