'use strict';

// DUBI plate-structure guardrails.
// These rules make lunch/dinner culinary-readable plates, not only macro-correct.
// Values are provisional and da validare col nutrizionista.

const PLATE_STRUCTURE = Object.freeze({
  version: 'plate-structure-v1',
  source: 'config/plate-structure.js',
  status: 'provisional_da_validare_col_nutrizionista',

  mainMeals: Object.freeze(['lunch', 'dinner']),

  required: Object.freeze({
    mainProtein: Object.freeze({ min: 1, max: 1 }),
    mainCarb: Object.freeze({ min: 1, max: 1 }),
    vegetables: Object.freeze({ min: 1, max: 2 }),
    fat: Object.freeze({ min: 1, max: 1 })
  }),

  proteinCategories: Object.freeze([
    'protein_animal',
    'protein_plant',
    'legume',
    'egg',
    'dairy',
    'dairy_alt',
    'supplement'
  ]),

  animalProteinCategories: Object.freeze(['protein_animal', 'egg', 'dairy']),
  plantProteinCategories: Object.freeze(['protein_plant', 'legume', 'dairy_alt']),
  carbCategories: Object.freeze(['grain', 'legume']),
  vegetableCategories: Object.freeze(['vegetable']),
  fatCategories: Object.freeze(['fat', 'nut_seed']),

  starchFamilies: Object.freeze({
    rice: Object.freeze(['riso', 'rice']),
    pasta: Object.freeze(['pasta']),
    bread: Object.freeze(['pane', 'bread', 'toast', 'piadina', 'wrap']),
    potato: Object.freeze(['patata', 'patate', 'potato', 'potatoes']),
    legume: Object.freeze(['legume', 'legumi', 'fagioli', 'fagiolo', 'ceci', 'cece', 'lenticchie', 'lenticchia', 'beans', 'chickpeas', 'lentils'])
  }),

  breakfastOnlyPatterns: Object.freeze([
    'avena',
    'oat',
    'oats',
    'muesli',
    'granola',
    'miele',
    'honey',
    'marmellata',
    'jam',
    'cacao',
    'cocoa'
  ]),

  breakfastHeavyMainMealPatterns: Object.freeze([
    'pollo',
    'chicken',
    'tacchino',
    'turkey',
    'manzo',
    'beef',
    'maiale',
    'pork',
    'nasello',
    'merluzzo',
    'orata',
    'branzino',
    'pesce bianco',
    'fagioli cotti',
    'lenticchie cotte',
    'ceci cotti'
  ]),

  sweetFruitPatterns: Object.freeze([
    'banana',
    'mela',
    'apple',
    'pera',
    'pear',
    'fragola',
    'fragole',
    'strawberry',
    'berries',
    'mirtilli',
    'blueberries',
    'uva',
    'grape',
    'mango',
    'ananas',
    'pineapple',
    'pesca',
    'peach',
    'albicocca',
    'apricot'
  ]),

  fishPatterns: Object.freeze([
    'pesce',
    'fish',
    'salmone',
    'salmon',
    'tonno',
    'tuna',
    'nasello',
    'merluzzo',
    'cod',
    'orata',
    'branzino',
    'sea bass'
  ]),

  dairyPatterns: Object.freeze([
    'dairy',
    'latte',
    'milk',
    'yogurt',
    'skyr',
    'kefir',
    'formaggio',
    'cheese',
    'ricotta',
    'mozzarella',
    'fiocchi di latte',
    'cottage'
  ]),

  cuisineFamilies: Object.freeze({
    mediterranean: Object.freeze([
      'olio evo',
      'olive oil',
      'pomodoro',
      'tomato',
      'basilico',
      'basil',
      'zucchine',
      'melanzane',
      'orata',
      'branzino',
      'pasta',
      'pane',
      'ceci',
      'fagioli'
    ]),
    asian: Object.freeze([
      'riso jasmine',
      'riso basmati',
      'soy sauce',
      'salsa di soia',
      'tofu',
      'tempeh',
      'edamame',
      'shiitake',
      'zenzero',
      'ginger'
    ]),
    northern: Object.freeze([
      'segale',
      'rye',
      'skyr',
      'kefir',
      'patate',
      'potatoes',
      'salmone',
      'salmon'
    ])
  })
});

module.exports = {
  PLATE_STRUCTURE
};
