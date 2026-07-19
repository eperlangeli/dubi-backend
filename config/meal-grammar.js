'use strict';

const { SCIENCE_SOURCES } = require('./science-sources');

const sourceIds = (...ids) => Object.freeze(ids.filter((id) => SCIENCE_SOURCES[id]));

const MEAL_GRAMMAR = Object.freeze({
  version: 'meal-grammar-v1',
  status: 'provisional_da_validare_col_nutrizionista',
  source: 'config/meal-grammar.js',

  scienceBasis: sourceIds(
    'crea_guidelines',
    'sinu_larn_v',
    'dietary_guidelines_2025_2030',
    'who_healthy_diet',
    'harvard_healthy_eating_plate',
    'esc_prevention_guidelines',
    'aha_fish_and_fats',
    'fao_who_fish',
    'wcrf_cancer_prevention',
    'reynolds_2019_lancet',
    'melina_2016_vegetarian_diets',
    'eat_lancet_2019',
    'drouin_chartier_2020_bmj',
    'predimed_trial',
    'gardner_2019_aclm'
  ),

  breakfast: Object.freeze({
    proteinRequired: true,
    powdersAllowedByDefault: false,
    sweet: Object.freeze({
      proteinRequired: true,
      allowedProteinPatterns: Object.freeze([
        'skyr',
        'yogurt greco',
        'greek yogurt',
        'yogurt bianco',
        'natural yogurt',
        'kefir',
        'ricotta',
        'fiocchi di latte',
        'cottage cheese',
        'latte vaccino',
        'latte parzialmente',
        'milk',
        'bevanda di soia',
        'latte di soia',
        'soy milk',
        'yogurt di soia',
        'albumi',
        'egg white',
        'uova',
        'egg'
      ]),
      eggsOnlyWithCarbPreparationPatterns: Object.freeze(['pancake', 'crespelle', 'porridge', 'avena', 'oat']),
      excludedProteinPatterns: Object.freeze([
        'pollo',
        'chicken',
        'tacchino',
        'turkey',
        'prosciutto',
        'bresaola',
        'salmone affumicato',
        'smoked salmon',
        'pesce',
        'fish',
        'legumi',
        'fagioli',
        'ceci',
        'lenticchie',
        'whey',
        'proteine in polvere',
        'protein powder'
      ])
    }),
    savory: Object.freeze({
      proteinRequired: true,
      allowedProteinPatterns: Object.freeze([
        'uova',
        'uovo',
        'egg',
        'albumi',
        'egg white',
        'ricotta',
        'fiocchi di latte',
        'cottage cheese',
        'tofu',
        'bresaola'
      ]),
      excludedProteinPatterns: Object.freeze([
        'pollo',
        'chicken',
        'prosciutto',
        'salmone affumicato',
        'smoked salmon',
        'fesa di tacchino',
        'tacchino affettato',
        'turkey slices',
        'deli turkey'
      ]),
      processedException: Object.freeze({
        pattern: 'bresaola',
        maxMealsPerWeek: 1,
        contexts: Object.freeze(['breakfast', 'snack']),
        notMainDinnerProtein: true
      })
    })
  }),

  snack: Object.freeze({
    proteinRequired: false,
    proteinUsefulWhenLongGapHours: 3,
    proteinLightPatterns: Object.freeze([
      'skyr',
      'yogurt greco',
      'greek yogurt',
      'ricotta',
      'fiocchi di latte',
      'latte',
      'milk',
      'tofu',
      'edamame',
      'bresaola'
    ]),
    easyCarbPatterns: Object.freeze([
      'banana',
      'mela',
      'apple',
      'frutta',
      'fruit',
      'pane',
      'bread',
      'marmellata',
      'jam',
      'miele',
      'honey',
      'gallette',
      'rice cakes',
      'uvetta',
      'raisins',
      'datteri',
      'dates'
    ])
  }),

  workout: Object.freeze({
    pre: Object.freeze({
      easyCarbRequired: true,
      proteinOptional: true,
      recentProteinWindowHours: Object.freeze([2, 3]),
      ifRecentProteinThenCarbOnly: true,
      maxFatG: 5,
      excludedPatterns: Object.freeze([
        'pollo',
        'chicken',
        'pesce',
        'fish',
        'legumi',
        'fagioli',
        'ceci',
        'lenticchie',
        'tofu',
        'formaggio stagionato',
        'nuts',
        'noci',
        'mandorle'
      ])
    }),
    post: Object.freeze({
      proteinRequired: true,
      carbRequired: true,
      maxFatG: 12,
      allowedProteinPatterns: Object.freeze([
        'skyr',
        'yogurt greco',
        'greek yogurt',
        'latte',
        'milk',
        'ricotta',
        'pollo',
        'chicken',
        'tacchino fresco',
        'fresh turkey',
        'tofu',
        'edamame',
        'uova',
        'albumi'
      ])
    })
  }),

  dairy: Object.freeze({
    servingsPerDay: Object.freeze({ min: 0, max: 2 }),
    priority: Object.freeze([
      'skyr',
      'yogurt greco',
      'greek yogurt',
      'yogurt naturale',
      'natural yogurt',
      'fiocchi di latte',
      'cottage cheese',
      'ricotta'
    ]),
    preferNatural: true,
    defaultFatPreference: Object.freeze({
      yogurt: Object.freeze(['2_percent', 'whole_natural']),
      greekYogurt: Object.freeze(['2_percent', '5_percent']),
      milk: Object.freeze(['semi_skimmed', 'whole']),
      ricotta: Object.freeze(['regular']),
      cottageCheese: Object.freeze(['regular'])
    }),
    lowFatOnlyWhen: Object.freeze(['tight_calorie_deficit', 'explicit_user_preference']),
    parmesan: Object.freeze({
      allowedAsTopping: true,
      notMainProtein: true
    }),
    agedCheesesStandardGeneration: false,
    plantMilks: Object.freeze({
      allowedOnlyUnsweetened: true,
      priority: Object.freeze(['soy', 'pea', 'oat', 'almond']),
      lowPriority: Object.freeze(['rice', 'coconut'])
    }),
    variety: Object.freeze({
      avoidSameDairyProteinConsecutiveDays: true
    })
  }),

  fats: Object.freeze({
    default: Object.freeze(['extra_virgin_olive_oil']),
    contextual: Object.freeze({
      avocado: Object.freeze(['bowl', 'poke', 'salad', 'toast']),
      nuts: Object.freeze(['breakfast', 'snack', 'yogurt', 'porridge', 'smoothie', 'salad_topping']),
      seeds: Object.freeze(['breakfast', 'snack', 'yogurt', 'porridge', 'smoothie', 'salad_topping']),
      tahini: Object.freeze(['hummus', 'middle_eastern', 'legume_dish']),
      nutButters100: Object.freeze(['breakfast', 'snack'])
    }),
    excludedPatterns: Object.freeze([
      'burro',
      'butter',
      'panna',
      'cream',
      'margarina',
      'margarine',
      'idrogen',
      'hydrogenated'
    ]),
    stacking: Object.freeze({
      maxMainMealFatSources: 1,
      highFatProteinCountsAsFat: true,
      reduceOilWhenHighFatProteinPresent: true
    })
  }),

  meat: Object.freeze({
    allowed: Object.freeze([
      'fresh_skinless_chicken',
      'fresh_skinless_turkey',
      'lean_fresh_beef',
      'lean_fresh_veal',
      'lean_fresh_pork'
    ]),
    allowedPatterns: Object.freeze([
      'petto di pollo',
      'chicken breast',
      'pollo senza pelle',
      'petto di tacchino',
      'fresh turkey',
      'manzo magro',
      'lean beef',
      'vitello magro',
      'lean veal',
      'filetto',
      'girello',
      'scamone',
      'roast beef fresco',
      'macinato fresco',
      'filetto di maiale',
      'lonza',
      'arista'
    ]),
    excluded: Object.freeze([
      'processed_meat',
      'cured_meat',
      'deli_meat',
      'sausage',
      'salami',
      'wurstel',
      'bacon',
      'pancetta',
      'mortadella',
      'industrial_burger',
      'breaded_or_precooked_meat'
    ]),
    excludedPatterns: Object.freeze([
      'prosciutto',
      'fesa di tacchino',
      'tacchino affettato',
      'speck',
      'salame',
      'mortadella',
      'wurstel',
      'salsiccia',
      'bacon',
      'pancetta',
      'carne in scatola',
      'nuggets',
      'hamburger industriale',
      'arrosto confezionato',
      'impanata',
      'precotta'
    ]),
    processedException: Object.freeze({
      bresaola: Object.freeze({
        allowed: true,
        maxMealsPerWeek: 1,
        contexts: Object.freeze(['breakfast', 'snack']),
        notMainDinnerProtein: true
      })
    }),
    weeklyConstraints: Object.freeze({
      poultry: Object.freeze({ min: 2, max: 3 }),
      totalRedMeatIncludingPork: Object.freeze({ min: 0, max: 2 }),
      preventionRedMeatPreferred: Object.freeze({ min: 0, max: 1 }),
      processedMeat: Object.freeze({ min: 0, max: 0 })
    })
  }),

  fish: Object.freeze({
    totalMealsPerWeek: Object.freeze({ min: 2, max: 3, highTdeeMax: 5 }),
    fattyFishMealsPerWeek: Object.freeze({ min: 1, max: 2 }),
    excludeSmokedByDefault: true,
    excludePatterns: Object.freeze(['affumicato', 'smoked']),
    topPriority: Object.freeze(['sardine', 'sgombro', 'alici', 'acciughe', 'aringa', 'salmone']),
    excellent: Object.freeze(['trota', 'branzino', 'orata', 'merluzzo', 'nasello', 'platessa', 'sogliola']),
    goodModerate: Object.freeze(['tonno fresco', 'gamberi', 'calamari', 'polpo']),
    blueFish: Object.freeze(['sardine', 'sgombro', 'alici', 'acciughe', 'aringa']),
    fattyFish: Object.freeze(['sardine', 'sgombro', 'alici', 'acciughe', 'aringa', 'salmone', 'trota']),
    leanFish: Object.freeze(['merluzzo', 'nasello', 'orata', 'branzino', 'platessa', 'sogliola']),
    limitFrequency: Object.freeze({
      tuna: Object.freeze({ maxPerWeek: 1 }),
      largePredatoryFish: Object.freeze({ maxPerWeek: 1 })
    })
  }),

  proteinRotation: Object.freeze({
    omnivore: Object.freeze({
      legumesMain: Object.freeze({ min: 2, max: 4, highFiberOrHighTdeeMax: 6 }),
      fishTotal: Object.freeze({ min: 2, max: 3, highTdeeMax: 5 }),
      fattyFish: Object.freeze({ min: 1, max: 2 }),
      eggsMeals: Object.freeze({ min: 2, max: 3 }),
      eggsTotal: Object.freeze({ min: 4, max: 7, athleteMax: 10 }),
      poultry: Object.freeze({ min: 2, max: 3 }),
      dairyProtein: Object.freeze({ min: 0, max: 14 }),
      redMeatIncludingPork: Object.freeze({ min: 0, max: 2 }),
      processedMeat: Object.freeze({ min: 0, max: 0 })
    }),
    vegetarian: Object.freeze({
      legumesMain: Object.freeze({ min: 4, max: 7 }),
      eggsTotal: Object.freeze({ min: 4, max: 7 }),
      dairyProtein: Object.freeze({ min: 0, max: 14 }),
      tofuTempehSeitan: Object.freeze({ min: 2, max: 6 })
    }),
    vegan: Object.freeze({
      legumesSoyEdamame: Object.freeze({ min: 5, max: 14 }),
      tofuTempehSeitan: Object.freeze({ min: 3, max: 7 }),
      educationNotes: Object.freeze(['b12', 'vitamin_d_if_low', 'iodine', 'calcium', 'iron', 'zinc', 'epa_dha_microalgae'])
    })
  }),

  pasta: Object.freeze({
    mealsPerWeek: Object.freeze({ min: 4, max: 7 }),
    dryPortionG: Object.freeze({ min: 70, max: 100, athleteHighEnergyMax: 120 }),
    varieties: Object.freeze([
      'pasta di semola',
      'pasta integrale',
      'pasta di farro',
      'pasta di grano saraceno',
      'pasta di lenticchie',
      'pasta di ceci',
      'pasta di piselli',
      'pasta di fagioli'
    ]),
    formulas: Object.freeze([
      'pasta_vegetables_evo',
      'pasta_fish_vegetables',
      'pasta_poultry_vegetables',
      'pasta_lean_red_meat_vegetables',
      'pasta_legumes',
      'pasta_tofu_vegetables',
      'pasta_tempeh_vegetables',
      'pasta_eggs_vegetables',
      'pasta_ricotta',
      'pasta_parmesan_vegetables'
    ]),
    forbiddenStandardPatterns: Object.freeze(['panna', 'pancetta', 'burro', 'quattro formaggi', 'salsiccia', 'salame'])
  }),

  carbohydrateStrategy: Object.freeze({
    portionsDrivenByEnergyNeeds: true,
    minimumWeeklyVariety: 4,
    maxConsecutiveSameMainCarbMeals: 2,
    preferWholeGrain: true,
    oneMainStarchPerStandardMeal: true,
    allowMultipleStarchesWhen: Object.freeze(['high_tdee', 'high_training_load', 'recipe_context']),
    sources: Object.freeze({
      pasta: Object.freeze({ indicativeMealsPerWeek: Object.freeze([4, 7]) }),
      rice: Object.freeze({ indicativeMealsPerWeek: Object.freeze([1, 4]) }),
      bread: Object.freeze({ frequentAllowed: true, autoAddOnlyIfNeeded: true, displayAsFreshBread: true }),
      potatoes: Object.freeze({ indicativeMealsPerWeek: Object.freeze([1, 3]) }),
      farroBarley: Object.freeze({ indicativeMealsPerWeek: Object.freeze([1, 3]), containsGluten: true }),
      quinoa: Object.freeze({ indicativeMealsPerWeek: Object.freeze([0, 2]) }),
      couscous: Object.freeze({ indicativeMealsPerWeek: Object.freeze([0, 2]), preferWholegrain: true, containsGluten: true }),
      oats: Object.freeze({ breakfastMealsPerWeek: Object.freeze([3, 7]), celiacOnlyIfCertifiedGlutenFree: true }),
      cornPolenta: Object.freeze({ indicativeMealsPerWeek: Object.freeze([0, 2]) })
    }),
    starchyFoods: Object.freeze(['pasta', 'rice', 'bread', 'potatoes', 'sweet_potatoes', 'farro', 'barley', 'quinoa', 'couscous', 'oats', 'corn', 'polenta'])
  }),

  plantVariety: Object.freeze({
    vegetableServingsDailyTarget: 3,
    fruitServingsDailyTarget: 2,
    dailyColorMinimum: 3,
    dailyColorTarget: 4,
    cruciferousMealsPerWeek: Object.freeze({ min: 2, max: 4 }),
    berriesPerWeek: Object.freeze({ min: 1, target: 3 }),
    leafyGreensFrequent: true,
    starchyVegetablesNutritionRole: Object.freeze(['potatoes', 'sweet_potatoes', 'corn', 'cassava', 'polenta']),
    fruitPreferredMealTypes: Object.freeze(['breakfast', 'snack', 'pre_workout', 'post_workout']),
    fruitAllowedInMainMealsOnlyWhenRecipeCoherent: true,
    coherentMainMealFruitPairs: Object.freeze([
      'salmon_orange',
      'fennel_orange',
      'salad_apple',
      'pear_walnut_salad',
      'pomegranate_salad'
    ])
  })
});

module.exports = {
  MEAL_GRAMMAR
};
