'use strict';

// DUBI meal composition floors/ceilings validated by the DUBI nutritionist.
// Scientific references:
// - Moore et al. 2009: ~0.3 g/kg high-quality protein per main meal.
// - Institute of Medicine fiber AI: ~25-38 g/day; DUBI reserves >=8 g for lunch/dinner.
// - LARN/CREA: at least one abundant vegetable side dish; DUBI uses 150 g minimum.
// - Schoenfeld & Aragon 2018: per-meal protein ceiling around 0.4-0.55 g/kg.
// - Areta et al. 2013: distribute intake across the day; DUBI caps each meal at 35% daily kcal.

const proteinPerMealMinGPerKg = Number(
  process.env.PROTEIN_PER_MEAL_MIN_G_PER_KG
  || process.env.PROTEIN_PER_MEAL_G_PER_KG
  || 0.3
);
const fiberPerMainMealG = Number(
  process.env.FIBER_PER_MAIN_MEAL_G
  || process.env.MAIN_MEAL_FIBER_G
  || 8
);
const vegetablesPerMainMealG = Number(
  process.env.VEGETABLES_PER_MAIN_MEAL_G
  || process.env.MAIN_MEAL_VEGETABLE_G
  || 150
);
const dinnerFatMinG = Number(
  process.env.FAT_DINNER_MIN_G
  || process.env.DINNER_FAT_G
  || 15
);

const MEAL_FLOORS = Object.freeze({
  protein_per_meal_min_g_per_kg: proteinPerMealMinGPerKg,
  // Backward-compatible alias used by older mealEngine code paths.
  protein_per_meal_g_per_kg: proteinPerMealMinGPerKg,
  protein_per_meal_max_g_per_kg: Number(process.env.PROTEIN_PER_MEAL_MAX_G_PER_KG || 0.55),
  max_meal_calorie_fraction: Number(process.env.MAX_MEAL_CALORIE_FRACTION || 0.35),
  fiber_per_main_meal_g: fiberPerMainMealG,
  main_meal_fiber_g: fiberPerMainMealG,
  vegetables_per_main_meal_g: vegetablesPerMainMealG,
  main_meal_vegetable_g: vegetablesPerMainMealG,
  fat_dinner_min_g: dinnerFatMinG,
  dinner_fat_g: dinnerFatMinG,
  dense_vegetable_max_calories_per_100g: Number(process.env.DENSE_VEGETABLE_MAX_CALORIES_PER_100G || 120),
  dense_vegetable_max_carbs_per_100g: Number(process.env.DENSE_VEGETABLE_MAX_CARBS_PER_100G || 20),
  dense_vegetable_max_portion_g: Number(process.env.DENSE_VEGETABLE_MAX_PORTION_G || 40),
  dense_vegetable_typical_portion_g: Number(process.env.DENSE_VEGETABLE_TYPICAL_PORTION_G || 25),
  science_references: Object.freeze({
    protein_per_meal_min_g_per_kg: 'Moore et al. 2009',
    protein_per_meal_max_g_per_kg: 'Schoenfeld & Aragon 2018',
    max_meal_calorie_fraction: 'Areta et al. 2013',
    fiber_per_main_meal_g: 'Institute of Medicine fiber AI',
    vegetables_per_main_meal_g: 'LARN/CREA',
    fat_dinner_min_g: 'DUBI nutritionist validation: hormonal function + satiety'
  })
});

module.exports = {
  MEAL_FLOORS,
};
