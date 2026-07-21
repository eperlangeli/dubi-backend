'use strict';

// DUBI workout nutrition timing rules validated by the DUBI nutritionist.
// Scientific references:
// - ISSN nutrient timing position stand: rapid digestible carbohydrates 45-60 min pre-session.
// - Moore et al. 2009 and Witard et al. 2014: ~20-40 g post-workout protein; DUBI standard target 25 g.
// - Endurance glycogen restoration literature: ~1.0 g/kg post-workout carbs for recreational strength/mixed training,
//   with endurance allowed to scale upward via sport-specific carb multipliers.
// - Practical digestion rule: protein and fats are set to zero in the immediate pre-workout snack because
//   they slow gastric emptying; trace intrinsic fat from real foods is tolerated, but no added fat/protein source is allowed.

const WORKOUT_NUTRITION = Object.freeze({
  version: 'workout-nutrition-v1',
  source: 'config/workout-nutrition.js',
  validationStatus: 'validated_by_dubi_nutritionist',
  allowedTimeSlots: Object.freeze([
    'morning_fasted',
    'afternoon',
    'evening',
    'unset'
  ]),
  timeSlotAliases: Object.freeze({
    early_morning: 'morning_fasted',
    fasted_morning: 'morning_fasted',
    mattina_presto: 'morning_fasted',
    morning: 'morning_fasted',
    mattina: 'morning_fasted',
    lunch: 'afternoon',
    pranzo: 'afternoon',
    midday: 'afternoon',
    afternoon: 'afternoon',
    pomeriggio: 'afternoon',
    evening: 'evening',
    sera: 'evening',
    unset: 'unset',
    unknown: 'unset',
    unconfirmed: 'unset'
  }),
  rapidCarbPatterns: Object.freeze([
    'banana',
    'banane',
    'datteri',
    'dates',
    'miele',
    'honey',
    'gallette',
    'rice cake',
    'rice cakes',
    'crema di riso',
    'cream of rice',
    'riso soffiato',
    'succo',
    'juice'
  ]),
  mealFractions: Object.freeze({
    rest: Object.freeze({
      breakfast: 0.25,
      lunch: 0.30,
      snack: 0.08,
      dinner: 0.25
    }),
    morning_fasted: Object.freeze({
      pre_workout: 0.06,
      post_workout: 0.24,
      breakfast: 0.16,
      lunch: 0.28,
      snack: 0.07,
      dinner: 0.19
    }),
    afternoon: Object.freeze({
      breakfast: 0.20,
      lunch: 0.30,
      pre_workout: 0.08,
      post_workout: 0.16,
      snack: 0.06,
      dinner: 0.20
    }),
    evening: Object.freeze({
      breakfast: 0.22,
      lunch: 0.28,
      snack: 0.08,
      dinner: 0.28,
      pre_workout: 0.06,
      post_workout: 0.08
    }),
    unset: Object.freeze({
      breakfast: 0.20,
      lunch: 0.30,
      pre_workout: 0.08,
      post_workout: 0.16,
      snack: 0.06,
      dinner: 0.20
    })
  }),
  timeSlots: Object.freeze({
    morning_fasted: Object.freeze({
      resolved: true,
      label: 'Allenamento mattina presto',
      structure: Object.freeze(['pre_workout', 'post_workout', 'breakfast', 'lunch', 'snack', 'dinner']),
      mainPreMeal: null,
      preWorkout: Object.freeze({
        role: 'rapid_carb_snack',
        timing: 'before_session',
        timingWindowMin: Object.freeze([0, 60]),
        targetCarbsG: Object.freeze({ min: 15, max: 20 }),
        targetProteinG: Object.freeze({ min: 0, max: 0 }),
        maxFatG: 0,
        allowedFoods: 'rapid_digestible_carbohydrates_only',
        examples: Object.freeze(['gallette', 'miele', 'banana', 'datteri']),
        rationale: 'For low-intensity sessions, skipping pre-workout fuel is valid; if used, keep protein and fat at zero because they slow gastric emptying.',
        preferRapidCarbs: true,
        preferLowFat: true,
        completeMealBeforeWorkout: false
      }),
      postWorkout: Object.freeze({
        role: 'recovery_complete_meal',
        timing: 'after_session',
        targetCarbsGPerKg: 1,
        targetProteinG: Object.freeze({ min: 25, max: 25 }),
        preferCarbProtein: true,
        preferLowModerateFat: true
      })
    }),
    afternoon: Object.freeze({
      resolved: true,
      label: 'Allenamento pomeriggio',
      structure: Object.freeze(['breakfast', 'lunch', 'pre_workout', 'post_workout', 'snack', 'dinner']),
      mainPreMeal: 'lunch',
      mainPreMealTargets: Object.freeze({
        targetCarbsG: 90,
        targetProteinG: Object.freeze({ min: 30, max: 40 }),
        targetFatG: 10
      }),
      preWorkout: Object.freeze({
        role: 'rapid_carb_snack',
        timing: '45_60_min_pre',
        timingWindowMin: Object.freeze([45, 60]),
        targetCarbsG: Object.freeze({ min: 20, max: 30 }),
        targetProteinG: Object.freeze({ min: 0, max: 0 }),
        maxFatG: 0,
        allowedFoods: 'rapid_digestible_carbohydrates_only',
        examples: Object.freeze(['gallette', 'miele', 'banana', 'datteri']),
        rationale: 'Protein and fat are set to zero in the immediate pre-workout snack because they slow gastric emptying before exercise.',
        preferRapidCarbs: true,
        preferLowFat: true
      }),
      postWorkout: Object.freeze({
        role: 'recovery',
        timing: 'after_session',
        targetCarbsGPerKg: 1,
        targetProteinG: Object.freeze({ min: 25, max: 25 }),
        preferCarbProtein: true,
        preferLowModerateFat: true
      })
    }),
    evening: Object.freeze({
      resolved: true,
      label: 'Allenamento sera',
      structure: Object.freeze(['breakfast', 'lunch', 'snack', 'dinner', 'pre_workout', 'post_workout']),
      mainPreMeal: 'dinner',
      mainPreMealTargets: Object.freeze({
        targetCarbsG: 90,
        targetProteinG: Object.freeze({ min: 30, max: 40 }),
        targetFatG: 10
      }),
      preWorkout: Object.freeze({
        role: 'rapid_carb_snack',
        timing: '45_60_min_pre',
        timingWindowMin: Object.freeze([45, 60]),
        targetCarbsG: Object.freeze({ min: 20, max: 30 }),
        targetProteinG: Object.freeze({ min: 0, max: 0 }),
        maxFatG: 0,
        allowedFoods: 'rapid_digestible_carbohydrates_only',
        examples: Object.freeze(['gallette', 'miele', 'banana', 'datteri']),
        rationale: 'Protein and fat are set to zero in the immediate pre-workout snack because they slow gastric emptying before exercise.',
        preferRapidCarbs: true,
        preferLowFat: true
      }),
      postWorkout: Object.freeze({
        role: 'recovery',
        timing: 'after_session',
        targetCarbsGPerKg: 1,
        targetProteinG: Object.freeze({ min: 25, max: 25 }),
        preferCarbProtein: true,
        preferLowModerateFat: true
      })
    }),
    unset: Object.freeze({
      resolved: false,
      label: 'Allenamento pianificato senza orario',
      defaultedFrom: 'afternoon',
      structure: Object.freeze(['breakfast', 'lunch', 'pre_workout', 'post_workout', 'snack', 'dinner']),
      mainPreMeal: 'lunch',
      mainPreMealTargets: Object.freeze({
        targetCarbsG: 90,
        targetProteinG: Object.freeze({ min: 30, max: 40 }),
        targetFatG: 10
      }),
      preWorkout: Object.freeze({
        role: 'rapid_carb_snack_placeholder',
        timing: 'placeholder_45_60_min_pre',
        timingWindowMin: Object.freeze([45, 60]),
        targetCarbsG: Object.freeze({ min: 20, max: 30 }),
        targetProteinG: Object.freeze({ min: 0, max: 0 }),
        maxFatG: 0,
        allowedFoods: 'rapid_digestible_carbohydrates_only',
        examples: Object.freeze(['gallette', 'miele', 'banana', 'datteri']),
        rationale: 'Protein and fat are set to zero in the immediate pre-workout snack because they slow gastric emptying before exercise.',
        preferRapidCarbs: true,
        preferLowFat: true
      }),
      postWorkout: Object.freeze({
        role: 'recovery_placeholder',
        timing: 'placeholder_after_session',
        targetCarbsGPerKg: 1,
        targetProteinG: Object.freeze({ min: 25, max: 25 }),
        preferCarbProtein: true,
        preferLowModerateFat: true
      })
    })
  }),
  sportModifiers: Object.freeze({
    endurance: Object.freeze({ carbMultiplier: 1.15, proteinMultiplier: 1.0, label: 'more_carbs' }),
    team_sport: Object.freeze({ carbMultiplier: 1.05, proteinMultiplier: 1.0, label: 'balanced_high_carb' }),
    strength: Object.freeze({ carbMultiplier: 0.9, proteinMultiplier: 1.15, label: 'more_protein' }),
    low_intensity: Object.freeze({ carbMultiplier: 0.85, proteinMultiplier: 1.0, label: 'lighter_fuel' }),
    mixed: Object.freeze({ carbMultiplier: 1.0, proteinMultiplier: 1.0, label: 'balanced' }),
    none: Object.freeze({ carbMultiplier: 1.0, proteinMultiplier: 1.0, label: 'balanced' })
  }),
  giRules: Object.freeze({
    rapidCarbMealTypes: Object.freeze(['pre_workout', 'post_workout']),
    highGiMin: 67,
    mediumGiMin: 55,
    completeMealMaxGi: 65,
    lowFatNearWorkoutMaxG: 5,
    moderateFatNearWorkoutMaxG: 12
  }),
  scienceNotes: Object.freeze({
    antiMyth: 'Carbohydrates plus fats do not automatically become body fat; chronic calorie surplus drives fat gain. Fat is reduced near workouts only to support digestion speed.'
  })
});

module.exports = {
  WORKOUT_NUTRITION
};
