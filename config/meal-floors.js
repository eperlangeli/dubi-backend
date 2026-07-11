'use strict';

// Provisional nutrition floors/ceilings for meal composition.
// Values are da validare col nutrizionista before clinical/production tuning.

const MEAL_FLOORS = Object.freeze({
  protein_per_meal_g_per_kg: Number(process.env.PROTEIN_PER_MEAL_G_PER_KG || 0.3),
  protein_per_meal_max_g_per_kg: Number(process.env.PROTEIN_PER_MEAL_MAX_G_PER_KG || 0.55),
  max_meal_calorie_fraction: Number(process.env.MAX_MEAL_CALORIE_FRACTION || 0.4),
  main_meal_fiber_g: Number(process.env.MAIN_MEAL_FIBER_G || 5),
  main_meal_vegetable_g: Number(process.env.MAIN_MEAL_VEGETABLE_G || 120),
  dinner_fat_g: Number(process.env.DINNER_FAT_G || 12),
  dense_vegetable_max_calories_per_100g: Number(process.env.DENSE_VEGETABLE_MAX_CALORIES_PER_100G || 120),
  dense_vegetable_max_carbs_per_100g: Number(process.env.DENSE_VEGETABLE_MAX_CARBS_PER_100G || 20),
  dense_vegetable_max_portion_g: Number(process.env.DENSE_VEGETABLE_MAX_PORTION_G || 40),
  dense_vegetable_typical_portion_g: Number(process.env.DENSE_VEGETABLE_TYPICAL_PORTION_G || 25),
});

module.exports = {
  MEAL_FLOORS,
};
