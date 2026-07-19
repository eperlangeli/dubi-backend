'use strict';

// Seasonality rules for fruit/vegetable selection.
// The engine must filter produce before meal generation; final validation is only a safety net.

const SEASONALITY = Object.freeze({
  version: 'seasonality-v1',
  status: 'schema_ready_not_fully_seeded',
  source: 'config/seasonality.js',
  defaultMode: 'strict',
  allowedModes: Object.freeze(['strict', 'seasonal_preferred', 'off']),
  defaultLocation: Object.freeze({
    country: 'IT',
    region: 'all',
    hemisphere: 'north',
    climateArea: 'mediterranean'
  }),
  categoriesRequiringSeasonality: Object.freeze(['fruit', 'vegetable']),
  strict: Object.freeze({
    unknownSeasonalityEligible: false,
    allowFreshOutOfSeason: false,
    fallbackOrder: Object.freeze([
      'fresh_local_in_season',
      'fresh_national_in_season',
      'frozen_natural'
    ])
  }),
  seasonalPreferred: Object.freeze({
    unknownSeasonalityEligible: false,
    allowFreshOutOfSeason: true,
    fallbackOrder: Object.freeze([
      'fresh_local_in_season',
      'fresh_national_in_season',
      'frozen_natural',
      'fresh_out_of_season_controlled'
    ])
  }),
  off: Object.freeze({
    unknownSeasonalityEligible: true,
    allowFreshOutOfSeason: true,
    fallbackOrder: Object.freeze(['no_filter'])
  }),
  nutritionVsSeasonalityRole: Object.freeze({
    potatoes: Object.freeze({ nutritionRole: 'carbohydrate_source', seasonalityRole: 'produce' }),
    sweetPotatoes: Object.freeze({ nutritionRole: 'carbohydrate_source', seasonalityRole: 'produce' }),
    corn: Object.freeze({ nutritionRole: 'carbohydrate_source', seasonalityRole: 'produce' }),
    cassava: Object.freeze({ nutritionRole: 'carbohydrate_source', seasonalityRole: 'produce' }),
    polenta: Object.freeze({ nutritionRole: 'carbohydrate_source', seasonalityRole: 'none' })
  })
});

module.exports = {
  SEASONALITY
};
