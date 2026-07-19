'use strict';

// Seasonality rules for fruit/vegetable selection.
// The engine must filter produce before meal generation; final validation is only a safety net.

const SEASONALITY = Object.freeze({
  version: 'seasonality-v1',
  status: 'db_backed_with_config_defaults',
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
  }),
  defaultProduceRules: Object.freeze([
    { patterns: Object.freeze(['frutta fresca di stagione', 'seasonal fruit']), category: 'fruit', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) },
    { patterns: Object.freeze(['verdure di stagione', 'verdura di stagione', 'seasonal vegetables', 'seasonal vegetable']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) },
    { patterns: Object.freeze(['insalata mista', 'mixed salad']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) },
    { patterns: Object.freeze(['verdure miste', 'mixed vegetables']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) },

    { patterns: Object.freeze(['zucchine', 'zucchina', 'zucchini']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([5, 6, 7, 8, 9]) },
    { patterns: Object.freeze(['melanzane', 'melanzana', 'eggplant', 'aubergine']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([6, 7, 8, 9, 10]) },
    { patterns: Object.freeze(['peperone', 'peperoni', 'bell pepper']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([6, 7, 8, 9, 10]) },
    { patterns: Object.freeze(['pomodoro', 'pomodorini', 'tomato']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([6, 7, 8, 9]) },
    { patterns: Object.freeze(['cetriolo', 'cetrioli', 'cucumber']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([6, 7, 8, 9]) },
    { patterns: Object.freeze(['bietola', 'bietole', 'chard']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([4, 5, 6, 7, 8, 9, 10, 11]) },
    { patterns: Object.freeze(['rucola', 'rocket', 'arugula']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([3, 4, 5, 6, 7, 8, 9, 10, 11]) },
    { patterns: Object.freeze(['lattuga', 'lettuce']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([3, 4, 5, 6, 7, 8, 9, 10, 11]) },
    { patterns: Object.freeze(['carota', 'carote', 'carrot']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) },
    { patterns: Object.freeze(['spinaci', 'spinach']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 4, 5, 9, 10, 11, 12]) },
    { patterns: Object.freeze(['broccoli', 'broccolo']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 4, 10, 11, 12]) },
    { patterns: Object.freeze(['cavolfiore', 'cauliflower']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 4, 10, 11, 12]) },
    { patterns: Object.freeze(['cavolo cappuccio', 'cavolo nero', 'cavoletti', 'cabbage', 'kale', 'brussels sprouts']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 4, 10, 11, 12]) },
    { patterns: Object.freeze(['pak choi', 'bok choy', 'cavolo cinese']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([4, 5, 6, 9, 10, 11]) },
    { patterns: Object.freeze(['finocchio', 'finocchi', 'fennel']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 4, 5, 10, 11, 12]) },
    { patterns: Object.freeze(['zucca', 'pumpkin']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 9, 10, 11, 12]) },
    { patterns: Object.freeze(['funghi', 'fungo', 'mushroom']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([9, 10, 11]) },
    { patterns: Object.freeze(['asparagi', 'asparagus']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([3, 4, 5]) },
    { patterns: Object.freeze(['piselli freschi', 'fresh peas']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([4, 5, 6]) },
    { patterns: Object.freeze(['carciofi', 'carciofo', 'artichoke']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 4, 11, 12]) },
    { patterns: Object.freeze(['cime di rapa', 'turnip greens', 'broccoli rabe']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 10, 11, 12]) },
    { patterns: Object.freeze(['porro', 'porri', 'leek']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 10, 11, 12]) },
    { patterns: Object.freeze(['cipolla rossa', 'red onion']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([5, 6, 7, 8, 9, 10]) },
    { patterns: Object.freeze(['cipolla', 'cipolle', 'onion']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) },
    { patterns: Object.freeze(['ravanelli', 'ravanello', 'radish']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([3, 4, 5, 6, 9, 10, 11]) },
    { patterns: Object.freeze(['valeriana', 'corn salad']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 4, 10, 11, 12]) },
    { patterns: Object.freeze(['cicoria', 'chicory']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 4, 10, 11, 12]) },
    { patterns: Object.freeze(['radicchio']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 10, 11, 12]) },
    { patterns: Object.freeze(['sedano', 'celery']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([5, 6, 7, 8, 9, 10, 11]) },
    { patterns: Object.freeze(['fagiolini', 'green beans']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([5, 6, 7, 8, 9]) },
    { patterns: Object.freeze(['patate dolci', 'patata dolce', 'sweet potato']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 9, 10, 11, 12]) },
    { patterns: Object.freeze(['patate', 'patata', 'potato']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) },
    { patterns: Object.freeze(['mais', 'corn']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([7, 8, 9]) },
    { patterns: Object.freeze(['alghe nori', 'nori']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) },
    { patterns: Object.freeze(['capperi', 'cappero', 'capers']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([5, 6, 7, 8, 9]) },
    { patterns: Object.freeze(['crauti', 'sauerkraut']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) },
    { patterns: Object.freeze(['germogli di soia', 'soy sprouts', 'bean sprouts']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) },
    { patterns: Object.freeze(['kimchi']), category: 'vegetable', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) },

    { patterns: Object.freeze(['arancia', 'arance', 'orange']), category: 'fruit', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 4, 11, 12]) },
    { patterns: Object.freeze(['mandarino', 'mandarini', 'clementine']), category: 'fruit', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 11, 12]) },
    { patterns: Object.freeze(['kiwi']), category: 'fruit', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 4, 5, 11, 12]) },
    { patterns: Object.freeze(['mela', 'mele', 'apple']), category: 'fruit', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 4, 5, 9, 10, 11, 12]) },
    { patterns: Object.freeze(['pera', 'pere', 'pear']), category: 'fruit', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 4, 8, 9, 10, 11, 12]) },
    { patterns: Object.freeze(['fragola', 'fragole', 'strawberry']), category: 'fruit', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([4, 5, 6]) },
    { patterns: Object.freeze(['mirtilli', 'mirtillo', 'frutti di bosco', 'blueberry', 'berries']), category: 'fruit', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([5, 6, 7, 8, 9]) },
    { patterns: Object.freeze(['pesca', 'pesche', 'peach']), category: 'fruit', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([6, 7, 8, 9]) },
    { patterns: Object.freeze(['albicocca', 'albicocche', 'apricot']), category: 'fruit', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([6, 7, 8]) },
    { patterns: Object.freeze(['prugna', 'prugne', 'plum']), category: 'fruit', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([7, 8, 9]) },
    { patterns: Object.freeze(['uva', 'grapes']), category: 'fruit', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([8, 9, 10]) },
    { patterns: Object.freeze(['melone', 'melon']), category: 'fruit', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([6, 7, 8, 9]) },
    { patterns: Object.freeze(['anguria', 'watermelon']), category: 'fruit', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([6, 7, 8]) },
    { patterns: Object.freeze(['banana']), category: 'fruit', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) },
    { patterns: Object.freeze(['mango']), category: 'fruit', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([7, 8, 9, 10]) },
    { patterns: Object.freeze(['papaya']), category: 'fruit', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([6, 7, 8, 9, 10, 11]) },
    { patterns: Object.freeze(['avocado']), category: 'fruit', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 4, 5, 10, 11, 12]) },
    { patterns: Object.freeze(['datteri', 'dattero', 'dates']), category: 'fruit', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) },
    { patterns: Object.freeze(['acai', 'açaí']), category: 'fruit', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) },
    { patterns: Object.freeze(['ciliegie', 'ciliegia', 'cherry']), category: 'fruit', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([5, 6, 7]) },
    { patterns: Object.freeze(['fico fresco', 'fichi freschi', 'fresh fig']), category: 'fruit', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([7, 8, 9]) },
    { patterns: Object.freeze(['limone', 'limoni', 'lemon']), category: 'fruit', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 4, 5, 10, 11, 12]) },
    { patterns: Object.freeze(['melograno', 'pomegranate']), category: 'fruit', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([9, 10, 11, 12]) },
    { patterns: Object.freeze(['pompelmo', 'grapefruit']), category: 'fruit', country: 'IT', regions: Object.freeze(['all']), months: Object.freeze([1, 2, 3, 11, 12]) }
  ])
});

module.exports = {
  SEASONALITY
};
