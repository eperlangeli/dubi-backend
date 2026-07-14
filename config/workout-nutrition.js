'use strict';

// DUBI workout nutrition timing rules.
// All values are provisional and da validare col nutrizionista before final tuning.

const WORKOUT_NUTRITION = Object.freeze({
  version: 'workout-nutrition-v1',
  source: 'config/workout-nutrition.js',
  validationStatus: 'provisional_da_validare_col_nutrizionista',
  allowedTimeSlots: Object.freeze([
    'morning_fasted',
    'morning',
    'lunch',
    'afternoon',
    'evening',
    'unset'
  ]),
  timeSlotAliases: Object.freeze({
    early_morning: 'morning_fasted',
    fasted_morning: 'morning_fasted',
    mattina_presto: 'morning_fasted',
    morning: 'morning',
    mattina: 'morning',
    lunch: 'lunch',
    pranzo: 'lunch',
    midday: 'lunch',
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
    morning: Object.freeze({
      breakfast: 0.18,
      pre_workout: 0.07,
      post_workout: 0.22,
      lunch: 0.27,
      snack: 0.07,
      dinner: 0.19
    }),
    lunch: Object.freeze({
      breakfast: 0.20,
      pre_workout: 0.08,
      post_workout: 0.18,
      lunch: 0.24,
      snack: 0.07,
      dinner: 0.23
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
        targetCarbsG: Object.freeze({ min: 20, max: 40, todoNutritionistValidation: true }),
        targetProteinG: Object.freeze({ min: 0, max: 10, todoNutritionistValidation: true }),
        maxFatG: 3,
        preferRapidCarbs: true,
        preferLowFat: true,
        completeMealBeforeWorkout: false
      }),
      postWorkout: Object.freeze({
        role: 'recovery_complete_meal',
        timing: 'after_session',
        targetCarbsGPerKg: 0.8,
        targetProteinG: Object.freeze({ min: 20, max: 30, todoNutritionistValidation: true }),
        preferCarbProtein: true,
        preferLowModerateFat: true
      })
    }),
    morning: Object.freeze({
      resolved: true,
      label: 'Allenamento mattina',
      structure: Object.freeze(['breakfast', 'pre_workout', 'post_workout', 'lunch', 'snack', 'dinner']),
      mainPreMeal: 'breakfast',
      preWorkout: Object.freeze({
        role: 'rapid_carb_snack',
        timing: '45_60_min_pre',
        timingWindowMin: Object.freeze([45, 60]),
        targetCarbsG: Object.freeze({ min: 20, max: 40, todoNutritionistValidation: true }),
        targetProteinG: Object.freeze({ min: 0, max: 15, todoNutritionistValidation: true }),
        maxFatG: 5,
        preferRapidCarbs: true,
        preferLowFat: true
      }),
      postWorkout: Object.freeze({
        role: 'recovery_complete_meal',
        timing: 'after_session',
        targetCarbsGPerKg: 0.8,
        targetProteinG: Object.freeze({ min: 20, max: 30, todoNutritionistValidation: true }),
        preferCarbProtein: true,
        preferLowModerateFat: true
      })
    }),
    lunch: Object.freeze({
      resolved: true,
      label: 'Allenamento pausa pranzo',
      structure: Object.freeze(['breakfast', 'pre_workout', 'post_workout', 'lunch', 'snack', 'dinner']),
      mainPreMeal: 'breakfast',
      preWorkout: Object.freeze({
        role: 'rapid_carb_snack',
        timing: '45_60_min_pre',
        timingWindowMin: Object.freeze([45, 60]),
        targetCarbsG: Object.freeze({ min: 20, max: 40, todoNutritionistValidation: true }),
        targetProteinG: Object.freeze({ min: 0, max: 15, todoNutritionistValidation: true }),
        maxFatG: 5,
        preferRapidCarbs: true,
        preferLowFat: true
      }),
      postWorkout: Object.freeze({
        role: 'recovery_complete_meal',
        timing: 'after_session',
        targetCarbsGPerKg: 0.9,
        targetProteinG: Object.freeze({ min: 20, max: 30, todoNutritionistValidation: true }),
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
        targetCarbsG: Object.freeze({ min: 20, max: 40, todoNutritionistValidation: true }),
        targetProteinG: Object.freeze({ min: 0, max: 15, todoNutritionistValidation: true }),
        maxFatG: 5,
        preferRapidCarbs: true,
        preferLowFat: true
      }),
      postWorkout: Object.freeze({
        role: 'recovery',
        timing: 'after_session',
        targetCarbsGPerKg: 1,
        targetProteinG: Object.freeze({ min: 20, max: 30, todoNutritionistValidation: true }),
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
        targetCarbsG: Object.freeze({ min: 20, max: 40, todoNutritionistValidation: true }),
        targetProteinG: Object.freeze({ min: 0, max: 15, todoNutritionistValidation: true }),
        maxFatG: 5,
        preferRapidCarbs: true,
        preferLowFat: true
      }),
      postWorkout: Object.freeze({
        role: 'recovery',
        timing: 'after_session',
        targetCarbsGPerKg: 0.8,
        targetProteinG: Object.freeze({ min: 20, max: 30, todoNutritionistValidation: true }),
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
        targetCarbsG: Object.freeze({ min: 20, max: 40, todoNutritionistValidation: true }),
        targetProteinG: Object.freeze({ min: 0, max: 15, todoNutritionistValidation: true }),
        maxFatG: 5,
        preferRapidCarbs: true,
        preferLowFat: true
      }),
      postWorkout: Object.freeze({
        role: 'recovery_placeholder',
        timing: 'placeholder_after_session',
        targetCarbsGPerKg: 1,
        targetProteinG: Object.freeze({ min: 20, max: 30, todoNutritionistValidation: true }),
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
