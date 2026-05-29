const SOURCE_LIBRARY = {
  proteinSatiety: {
    label: 'High-protein satiety and lean-mass support',
    source: 'DUBI scientific basis: protein targets by kg body weight; WHO/EFSA dietary quality principles',
    evidenceLevel: 'high'
  },
  lowGiFiber: {
    label: 'Fiber, glycemic control, and satiety',
    source: 'DUBI scientific basis: low-glycemic, high-fiber meal design; Harvard nutrition principles',
    evidenceLevel: 'high'
  },
  recoveryCarbs: {
    label: 'Training recovery carbohydrate and protein support',
    source: 'DUBI scientific basis: recovery-oriented carbohydrate timing and protein distribution',
    evidenceLevel: 'medium'
  },
  mediterraneanQuality: {
    label: 'Minimally processed Mediterranean-style food pattern',
    source: 'DUBI scientific basis: WHO, EFSA, Harvard nutrition principles',
    evidenceLevel: 'high'
  }
};

const GROUPS = {
  breakfast: {
    count: 30,
    mealType: ['breakfast'],
    names: [
      'Porridge Avena Mirtilli e Semi',
      'Toast Integrale Uova e Spinaci',
      'Yogurt Greco Granola e Fragole',
      'Chia Pudding Cocco e Lamponi',
      'Pancake Proteici Banana e Cacao',
      'Smoothie Verde Proteico',
      'Frittata Funghi e Pane Integrale',
      'Skyr Mela Cannella e Noci',
      'Avocado Toast con Salmone',
      'Ricotta Magra Miele e Mandorle',
      'Tofu Scramble con Patate',
      'Crema di Riso Proteica',
      'Pane Segale Tacchino e Pomodoro',
      'Bowl Quinoa Frutta e Semi',
      'Omelette Albumi e Zucchine',
      'Overnight Oats Cacao e Pera',
      'Budino Soia Chia e Fragole',
      'Yogurt Lactose Free e Kiwi',
      'Pane Senza Glutine Uova e Avocado',
      'Muesli Proteico Senza Lattosio',
      'Crespelle Avena e Albumi',
      'Hummus Toast Mediterraneo',
      'Kefir Mirtilli e Fiocchi Avena',
      'Bowl Riso Latte e Cannella',
      'Porridge Proteico Mela e Cannella',
      'Toast Tofu Avocado e Pomodoro',
      'Skyr Mango e Semi di Chia',
      'Omelette Spinaci e Pane Senza Glutine',
      'Smoothie Soia Banana e Cacao',
      'Quinoa Breakfast Bowl Fragole e Mandorle'
    ],
    macro: { calories: 340, protein: 24, carbs: 42, fats: 10, fiber: 7 },
    source: SOURCE_LIBRARY.lowGiFiber
  },
  lunch: {
    count: 30,
    mealType: ['lunch'],
    names: [
      'Salmone Riso Basmati e Zucchine',
      'Pollo Patate Dolci e Broccoli',
      'Bowl Tonno Ceci e Verdure',
      'Curry Ceci Riso Integrale',
      'Tacchino Quinoa e Carote',
      'Pasta Integrale Pomodoro e Ricotta',
      'Insalata Uova Patate e Spinaci',
      'Tofu Riso e Broccoli',
      'Merluzzo Cous Cous e Verdure',
      'Burrito Bowl Fagioli e Avocado',
      'Manzo Magro Riso e Verdure',
      'Lenticchie Pane Integrale e Rucola',
      'Gamberi Noodles di Riso e Verdure',
      'Caprese Proteica con Pane',
      'Tempeh Quinoa e Peperoni',
      'Orzo Ceci e Verdure Grigliate',
      'Riso Nero Pollo e Asparagi',
      'Piadina Integrale Tacchino e Insalata',
      'Bowl Vegan Edamame e Riso',
      'Pasta Lenticchie e Pomodoro',
      'Trota Patate e Fagiolini',
      'Seitan Cous Cous e Zucchine',
      'Insalata Greca Bilanciata',
      'Riso Tofu Mango e Cetrioli',
      'Poke Salmone Riso Nero e Avocado',
      'Bowl Pollo Quinoa e Broccoli',
      'Cous Cous Ceci Carote e Tahina',
      'Pasta di Lenticchie Tonno e Pomodoro',
      'Tempeh Riso Basmati e Asparagi',
      'Manzo Magro Patate e Spinaci'
    ],
    macro: { calories: 540, protein: 38, carbs: 62, fats: 14, fiber: 10 },
    source: SOURCE_LIBRARY.mediterraneanQuality
  },
  dinner: {
    count: 30,
    mealType: ['dinner'],
    names: [
      'Branzino Verdure e Pane Integrale',
      'Tacchino Zucca e Spinaci',
      'Omelette Funghi e Insalata',
      'Sgombro Patate e Verdure',
      'Tempeh Verdure Saltate e Riso',
      'Pollo Curry Leggero',
      'Zuppa Legumi e Cereali',
      'Salmone Asparagi e Quinoa',
      'Tofu Scramble con Verdure',
      'Chili Fagioli Mais e Riso',
      'Polpo Patate e Fagiolini',
      'Seitan Verdure e Riso',
      'Uova Shakshuka e Pane',
      'Minestrone Proteico con Ceci',
      'Merluzzo Pomodoro e Olive',
      'Burger Vegetale e Insalata',
      'Bresaola Rucola e Grana',
      'Riso Integrale Uova e Verdure',
      'Curry Lenticchie Rosse',
      'Pollo Limone e Verdure',
      'Tofu Teriyaki Leggero',
      'Insalata Tiepida Fagioli e Patate',
      'Nasello Finocchi e Riso',
      'Bowl Mediterranea Vegan',
      'Merluzzo Patate Dolci e Zucchine',
      'Curry Tofu Ceci e Riso Integrale',
      'Tacchino Funghi e Quinoa',
      'Zuppa Lenticchie Rosse e Spinaci',
      'Salmone Finocchi e Riso Basmati',
      'Seitan Peperoni e Patate'
    ],
    macro: { calories: 480, protein: 36, carbs: 48, fats: 15, fiber: 9 },
    source: SOURCE_LIBRARY.mediterraneanQuality
  },
  snack: {
    count: 25,
    mealType: ['snack'],
    names: [
      'Yogurt Greco e Fragole',
      'Hummus Carote e Cetrioli',
      'Fiocchi di Latte e Mela',
      'Edamame al Vapore',
      'Kefir Mirtilli e Semi',
      'Crackers Integrali e Ricotta',
      'Ceci Croccanti Speziati',
      'Uovo Sodo e Frutta',
      'Noci e Cioccolato Fondente',
      'Skyr Cacao e Banana',
      'Budino Proteico Soia',
      'Pane Riso e Crema Mandorle',
      'Frutta e Semi di Zucca',
      'Yogurt Senza Lattosio e Kiwi',
      'Gallette Mais e Hummus',
      'Cottage Cheese Pomodorini',
      'Smoothie Proteico Frutti Rossi',
      'Barretta Avena e Semi Homemade',
      'Mela Burro Arachidi',
      'Ricotta Cannella e Pera',
      'Kefir Banana e Cacao',
      'Gallette Riso Avocado e Pomodoro',
      'Edamame Mais e Carote',
      'Yogurt di Soia Fragole e Chia',
      'Pera Mandorle e Cioccolato Fondente'
    ],
    macro: { calories: 230, protein: 16, carbs: 24, fats: 8, fiber: 5 },
    source: SOURCE_LIBRARY.proteinSatiety
  },
  pre_workout: {
    count: 17,
    mealType: ['pre_workout', 'snack'],
    names: [
      'Banana Mandorle e Caffe',
      'Toast Miele e Burro Arachidi',
      'Gallette Riso Marmellata e Yogurt',
      'Datteri e Skyr',
      'Smoothie Banana Avena e Latte',
      'Pane Bianco Marmellata e Whey',
      'Riso Soffiato Cacao e Soia',
      'Patata Dolce e Yogurt',
      'Crackers Riso e Tacchino',
      'Frullato Mango e Proteine',
      'Pera Gallette e Crema Nocciole',
      'Avena Rapida Banana e Cannella',
      'Pane Senza Glutine Miele e Tahina',
      'Succo Arancia Toast e Ricotta',
      'Crema di Riso Banana e Cacao',
      'Gallette Mais Datteri e Yogurt',
      'Mango Riso Soffiato e Proteine'
    ],
    macro: { calories: 285, protein: 15, carbs: 42, fats: 7, fiber: 4 },
    source: SOURCE_LIBRARY.recoveryCarbs
  },
  post_workout: {
    count: 18,
    mealType: ['post_workout', 'snack'],
    names: [
      'Shake Proteico Banana e Cacao',
      'Riso Pollo e Zucchine Recovery',
      'Bowl Skyr Avena e Frutti Rossi',
      'Pasta Integrale Tonno e Pomodoro',
      'Tofu Riso Jasmine e Verdure Recovery',
      'Yogurt Greco Cereali e Miele',
      'Wrap Tacchino Riso e Verdure',
      'Smoothie Soia Banana e Avena',
      'Patate Uova e Spinaci Recovery',
      'Quinoa Pollo e Peperoni',
      'Riso Ceci e Tahina Recovery',
      'Pasta Lenticchie Post Workout',
      'Salmone Riso e Asparagi Recovery',
      'Crema Riso Whey e Mirtilli',
      'Pollo Riso Basmati e Broccoli Recovery',
      'Skyr Banana Avena e Cacao',
      'Tofu Quinoa e Peperoni Recovery',
      'Tonno Patate e Fagiolini Recovery'
    ],
    macro: { calories: 410, protein: 32, carbs: 52, fats: 8, fiber: 6 },
    source: SOURCE_LIBRARY.recoveryCarbs
  }
};

const DIET_ROTATION = [
  { dietCompatibility: ['omnivore'], allergens: [] },
  { dietCompatibility: ['omnivore', 'vegetarian'], allergens: ['dairy'] },
  { dietCompatibility: ['omnivore', 'vegetarian'], allergens: ['eggs'] },
  { dietCompatibility: ['omnivore', 'vegetarian', 'vegan'], allergens: [] },
  { dietCompatibility: ['omnivore', 'vegetarian', 'vegan'], allergens: ['soy'] },
  { dietCompatibility: ['omnivore', 'vegetarian', 'vegan'], allergens: ['gluten'] },
  { dietCompatibility: ['omnivore', 'pescatarian'], allergens: ['fish'] },
  { dietCompatibility: ['omnivore', 'vegetarian'], allergens: ['nuts'] },
  { dietCompatibility: ['omnivore', 'vegetarian'], allergens: ['gluten', 'dairy'] },
  { dietCompatibility: ['omnivore', 'vegetarian', 'vegan'], allergens: [] }
];

const CATEGORY_ADJUSTMENTS = {
  breakfast: [{ protein: 4 }, { carbs: 8 }, { fats: 4 }, { fiber: 2 }, { calories: -35 }, { calories: 40 }],
  lunch: [{ protein: 8 }, { carbs: 12 }, { fats: 5 }, { fiber: 3 }, { calories: -55 }, { calories: 60 }],
  dinner: [{ protein: 7 }, { carbs: -8 }, { fats: 5 }, { fiber: 3 }, { calories: -45 }, { calories: 50 }],
  snack: [{ protein: 7 }, { carbs: 8 }, { fats: 5 }, { fiber: 3 }, { calories: -25 }, { calories: 30 }],
  pre_workout: [{ carbs: 12 }, { fats: -2 }, { protein: 5 }, { fiber: -1 }, { calories: 25 }, { calories: -20 }],
  post_workout: [{ protein: 8 }, { carbs: 14 }, { fats: -2 }, { fiber: 2 }, { calories: 45 }, { calories: -35 }]
};

const CUISINE_ROTATION = [
  'italian',
  'mediterranean',
  'middle_eastern',
  'japanese',
  'mexican',
  'indian',
  'thai_vietnamese',
  'american_fitness',
  'nordic_european',
  'international'
];

const clamp = (value, min) => Math.max(min, Math.round(value));

const buildGoalTags = (category, macro, mealType) => {
  const tags = [];

  if (macro.protein >= 25) tags.push('high_protein', 'lean_mass_support');
  if (macro.fiber >= 8) tags.push('satiety', 'low_gi');
  if (macro.carbs >= 45 && mealType.some((type) => ['pre_workout', 'post_workout'].includes(type))) tags.push('training_fuel');
  if (mealType.includes('post_workout')) tags.push('recovery');
  if (category === 'snack' && macro.calories <= 260) tags.push('calorie_control');
  if (macro.fats <= 10) tags.push('lower_fat');

  return [...new Set(tags)];
};

const buildAvoidIf = (allergens, macro) => {
  const avoid = allergens.map((allergen) => `${allergen}_allergy`);

  if (macro.fiber >= 12) avoid.push('low_fiber_tolerance');
  if (macro.carbs >= 70) avoid.push('very_low_carb_preference');
  if (macro.fats >= 20) avoid.push('low_fat_preference');

  return avoid;
};

const ingredient = (name, quantity, unit) => ({ name, quantity, unit });

const titleHas = (name, term) => name.toLowerCase().includes(term.toLowerCase());

const buildIngredients = (category, name) => {
  const ingredients = [];
  const add = (itemName, quantity, unit = 'g') => {
    if (!ingredients.some((item) => item.name === itemName)) ingredients.push(ingredient(itemName, quantity, unit));
  };
  const isSavory = ['lunch', 'dinner'].includes(category)
    || /uova|toast|pane|hummus|tacchino|salmone|tonno|pollo|tofu|tempeh|seitan|insalata|curry|pasta|patate|verdure|burger|caprese|shakshuka|ceci|fagioli/i.test(name);

  if (titleHas(name, 'Avena') || titleHas(name, 'Overnight') || titleHas(name, 'Muesli')) add('Fiocchi di avena', 55);
  if (titleHas(name, 'Granola')) add('Granola senza zuccheri aggiunti', 35);
  if (titleHas(name, 'Chia')) add('Semi di chia', 25);
  if (titleHas(name, 'Cocco')) add('Latte di cocco light', 120, 'ml');
  if (titleHas(name, 'Pancake')) add('Farina di avena', 50);
  if (titleHas(name, 'Pancake')) add('Albumi', 160);
  if (titleHas(name, 'Smoothie Verde')) add('Spinaci freschi', 60);
  if (titleHas(name, 'Smoothie Verde')) add('Proteine in polvere', 25);
  if (titleHas(name, 'Smoothie Verde')) add('Banana', 1, 'media');
  if (titleHas(name, 'Caffe')) add('Caffe espresso', 1, 'tazzina');
  if (titleHas(name, 'Datteri')) add('Datteri', 3, 'pz');
  if (titleHas(name, 'Cioccolato Fondente')) add('Cioccolato fondente 85%', 15);
  if (titleHas(name, 'Barretta')) add('Miele', 10);
  if (titleHas(name, 'Caprese')) add('Mozzarella light', 100);
  if (titleHas(name, 'Caprese')) add('Basilico', 5);
  if (titleHas(name, 'Greca')) add('Feta', 60);
  if (titleHas(name, 'Greca')) add('Cetrioli', 120);
  if (titleHas(name, 'Burger Vegetale')) add('Burger vegetale di legumi', 1, 'pz');
  if (titleHas(name, 'Bowl Mediterranea Vegan')) add('Ceci cotti', 150);
  if (titleHas(name, 'Bowl Mediterranea Vegan')) add('Quinoa', 70);
  if (titleHas(name, 'Zuppa')) add('Cereali integrali misti', 60);
  if (titleHas(name, 'Minestrone')) add('Verdure per minestrone', 250);
  if (titleHas(name, 'Shakshuka')) add('Passata di pomodoro', 180);
  if (titleHas(name, 'Porridge')) add('Latte parzialmente scremato o bevanda vegetale', 180, 'ml');
  if (titleHas(name, 'Mirtilli') || titleHas(name, 'Frutti Rossi')) add('Mirtilli o frutti rossi', 100);
  if (titleHas(name, 'Fragole')) add('Fragole', 120);
  if (titleHas(name, 'Lamponi')) add('Lamponi', 100);
  if (titleHas(name, 'Banana')) add('Banana', 1, 'media');
  if (titleHas(name, 'Pera')) add('Pera', 1, 'media');
  if (titleHas(name, 'Mela')) add('Mela', 1, 'media');
  if (titleHas(name, 'Kiwi')) add('Kiwi', 1, 'medio');
  if (titleHas(name, 'Mango')) add('Mango', 120);
  if (titleHas(name, 'Arancia')) add('Succo di arancia', 180, 'ml');
  if (titleHas(name, 'Cacao')) add('Cacao amaro', 8);
  if (titleHas(name, 'Cannella')) add('Cannella', 1, 'cucchiaino');
  if (titleHas(name, 'Miele')) add('Miele', 10);
  if (titleHas(name, 'Marmellata')) add('Marmellata senza zuccheri aggiunti', 20);
  if (titleHas(name, 'Semi')) add('Semi di chia o semi misti', 15);
  if (titleHas(name, 'Noci')) add('Noci', 15);
  if (titleHas(name, 'Mandorle')) add('Mandorle', 15);
  if (titleHas(name, 'Arachidi')) add('Burro di arachidi', 15);
  if (titleHas(name, 'Nocciole')) add('Crema di nocciole 100%', 15);
  if (titleHas(name, 'Tahina')) add('Tahina', 15);

  if (titleHas(name, 'Yogurt Greco')) add('Yogurt greco 0-2%', 170);
  if (titleHas(name, 'Yogurt Senza Lattosio') || titleHas(name, 'Lactose Free')) add('Yogurt senza lattosio', 170);
  if (titleHas(name, 'Yogurt') && !ingredients.some((item) => item.name.includes('Yogurt'))) add('Yogurt bianco naturale', 160);
  if (titleHas(name, 'Skyr')) add('Skyr naturale', 170);
  if (titleHas(name, 'Kefir')) add('Kefir naturale', 200, 'ml');
  if (titleHas(name, 'Ricotta')) add('Ricotta magra', 90);
  if (titleHas(name, 'Fiocchi di Latte') || titleHas(name, 'Cottage Cheese')) add('Fiocchi di latte', 150);
  if (titleHas(name, 'Whey') || titleHas(name, 'Shake Proteico') || titleHas(name, 'Proteine')) add('Proteine in polvere', 25);
  if (titleHas(name, 'Soia')) add('Yogurt di soia o bevanda di soia', 170);

  if (titleHas(name, 'Uova')) add('Uova', 2, 'pz');
  if (titleHas(name, 'Albumi')) add('Albumi', 180);
  if (titleHas(name, 'Omelette') && !ingredients.some((item) => item.name === 'Uova')) add('Uova', 2, 'pz');
  if (titleHas(name, 'Frittata') && !ingredients.some((item) => item.name === 'Uova')) add('Uova', 2, 'pz');
  if (titleHas(name, 'Tofu')) add('Tofu', category.includes('snack') ? 120 : 160);
  if (titleHas(name, 'Tempeh')) add('Tempeh', 150);
  if (titleHas(name, 'Seitan')) add('Seitan', 150);
  if (titleHas(name, 'Edamame')) add('Edamame', 160);
  if (titleHas(name, 'Pollo')) add('Petto di pollo', category === 'post_workout' ? 150 : 140);
  if (titleHas(name, 'Tacchino')) add('Fesa di tacchino', 130);
  if (titleHas(name, 'Manzo')) add('Manzo magro', 140);
  if (titleHas(name, 'Bresaola')) add('Bresaola', 80);
  if (titleHas(name, 'Salmone')) add('Salmone', 140);
  if (titleHas(name, 'Tonno')) add('Tonno al naturale o fresco', 120);
  if (titleHas(name, 'Merluzzo')) add('Merluzzo', 160);
  if (titleHas(name, 'Branzino')) add('Branzino', 160);
  if (titleHas(name, 'Sgombro')) add('Sgombro', 130);
  if (titleHas(name, 'Polpo')) add('Polpo', 160);
  if (titleHas(name, 'Gamberi')) add('Gamberi', 150);
  if (titleHas(name, 'Trota')) add('Trota', 150);
  if (titleHas(name, 'Nasello')) add('Nasello', 160);

  if (titleHas(name, 'Riso Basmati')) add('Riso basmati', category === 'pre_workout' ? 60 : 75);
  if (titleHas(name, 'Riso Integrale')) add('Riso integrale', 75);
  if (titleHas(name, 'Riso Nero')) add('Riso nero', 75);
  if (titleHas(name, 'Riso Jasmine')) add('Riso jasmine', 75);
  if (titleHas(name, 'Riso Soffiato')) add('Riso soffiato', 35);
  if (titleHas(name, 'Crema di Riso') || titleHas(name, 'Crema Riso')) add('Crema di riso', 60);
  if (titleHas(name, 'Riso') && !ingredients.some((item) => item.name.toLowerCase().includes('riso'))) add('Riso', 70);
  if (titleHas(name, 'Quinoa')) add('Quinoa', 75);
  if (titleHas(name, 'Pasta Integrale')) add('Pasta integrale', 80);
  if (titleHas(name, 'Pasta Lenticchie')) add('Pasta di lenticchie', 80);
  if (titleHas(name, 'Pasta') && !ingredients.some((item) => item.name.toLowerCase().includes('pasta'))) add('Pasta', 80);
  if (titleHas(name, 'Cous Cous')) add('Cous cous', 75);
  if (titleHas(name, 'Noodles')) add('Noodles di riso', 75);
  if (titleHas(name, 'Orzo')) add('Orzo perlato', 75);
  if (titleHas(name, 'Farro')) add('Farro', 75);
  if (titleHas(name, 'Pane Integrale')) add('Pane integrale', 70);
  if (titleHas(name, 'Pane Segale')) add('Pane di segale', 70);
  if (titleHas(name, 'Pane Senza Glutine')) add('Pane senza glutine', 70);
  if (titleHas(name, 'Pane Bianco')) add('Pane bianco', 60);
  if (titleHas(name, 'Pane') && !ingredients.some((item) => item.name.toLowerCase().includes('pane'))) add('Pane', 60);
  if (titleHas(name, 'Toast') && !ingredients.some((item) => item.name.toLowerCase().includes('pane'))) add('Pane per toast', 70);
  if (titleHas(name, 'Piadina')) add('Piadina integrale', 1, 'pz');
  if (titleHas(name, 'Wrap')) add('Wrap integrale', 1, 'pz');
  if (titleHas(name, 'Burrito')) add('Riso o tortilla integrale', 70);
  if (titleHas(name, 'Gallette')) add('Gallette di riso o mais', 3, 'pz');
  if (titleHas(name, 'Crackers')) add('Crackers integrali o di riso', 35);
  if (titleHas(name, 'Patate Dolci') || titleHas(name, 'Patata Dolce')) add('Patata dolce', 220);
  if (titleHas(name, 'Patate')) add('Patate', 220);
  if (titleHas(name, 'Zucca')) add('Zucca', 220);

  if (titleHas(name, 'Ceci')) add('Ceci cotti', 150);
  if (titleHas(name, 'Lenticchie Rosse')) add('Lenticchie rosse', 80);
  if (titleHas(name, 'Lenticchie')) add('Lenticchie cotte', 160);
  if (titleHas(name, 'Fagioli')) add('Fagioli cotti', 160);
  if (titleHas(name, 'Legumi')) add('Legumi misti cotti', 180);
  if (titleHas(name, 'Hummus')) add('Hummus', category === 'snack' ? 60 : 80);
  if (titleHas(name, 'Mais')) add('Mais', 60);

  if (titleHas(name, 'Spinaci')) add('Spinaci', 120);
  if (titleHas(name, 'Broccoli')) add('Broccoli', 180);
  if (titleHas(name, 'Zucchine')) add('Zucchine', 180);
  if (titleHas(name, 'Funghi')) add('Funghi', 120);
  if (titleHas(name, 'Pomodoro') || titleHas(name, 'Pomodorini')) add(titleHas(name, 'Pomodorini') ? 'Pomodorini' : 'Pomodoro', 120);
  if (titleHas(name, 'Carote')) add('Carote', 120);
  if (titleHas(name, 'Asparagi')) add('Asparagi', 160);
  if (titleHas(name, 'Peperoni')) add('Peperoni', 160);
  if (titleHas(name, 'Cetrioli')) add('Cetrioli', 120);
  if (titleHas(name, 'Rucola')) add('Rucola', 50);
  if (titleHas(name, 'Insalata')) add('Insalata mista', 120);
  if (titleHas(name, 'Fagiolini')) add('Fagiolini', 160);
  if (titleHas(name, 'Finocchi')) add('Finocchi', 180);
  if (titleHas(name, 'Verdure')) add('Verdure miste', 200);
  if (titleHas(name, 'Avocado')) add('Avocado', 70);
  if (titleHas(name, 'Olive')) add('Olive', 25);
  if (titleHas(name, 'Grana')) add('Grana Padano', 20);

  if (isSavory && !ingredients.some((item) => ['Olio EVO', 'Miele', 'Marmellata senza zuccheri aggiunti'].includes(item.name))) add('Olio EVO', category === 'snack' || category === 'pre_workout' ? 5 : 10, 'ml');
  if (ingredients.length < 3) add(category === 'breakfast' || category === 'snack' || category === 'pre_workout' ? 'Frutta fresca di stagione' : 'Verdure di stagione', category === 'breakfast' || category === 'snack' || category === 'pre_workout' ? 100 : 180);

  return ingredients.slice(0, 7);
};

const inferDietMetadata = (name, ingredients) => {
  const text = `${name} ${ingredients.map((item) => item.name).join(' ')}`.toLowerCase();
  const allergens = new Set();

  const hasMeat = /(pollo|tacchino|manzo|bresaola)/.test(text);
  const hasFish = /(salmone|tonno|merluzzo|branzino|sgombro|trota|nasello)/.test(text);
  const hasShellfish = /(gamberi|polpo)/.test(text);
  const hasEggs = /(uovo|uova|albumi|omelette|frittata)/.test(text);
  const hasDairy = /(yogurt|skyr|kefir|ricotta|fiocchi di latte|mozzarella|feta|grana|whey|latte parzialmente|latte vaccino)/.test(text);
  const hasGluten = /(pasta integrale|cous cous|seitan|pane|piadina|wrap|crackers|farro|orzo)/.test(text)
    && !/(senza glutine|certificati senza glutine)/.test(text);
  const hasNuts = /(mandorle|noci|nocciole|frutta secca)/.test(text);
  const hasPeanuts = /(arachidi|burro di arachidi)/.test(text);
  const hasSoy = /(tofu|tempeh|edamame|soia)/.test(text);
  const hasSesame = /(tahina|sesamo)/.test(text);
  const hasHoney = /miele/.test(text);

  if (hasDairy) { allergens.add('dairy'); allergens.add('lactose'); }
  if (hasEggs) allergens.add('eggs');
  if (hasGluten) allergens.add('gluten');
  if (hasNuts) allergens.add('nuts');
  if (hasPeanuts) { allergens.add('peanuts'); allergens.add('nuts'); }
  if (hasSoy) allergens.add('soy');
  if (hasSesame) allergens.add('sesame');
  if (hasFish) allergens.add('fish');
  if (hasShellfish) allergens.add('shellfish');

  let dietCompatibility;
  if (hasMeat) dietCompatibility = ['omnivore'];
  else if (hasFish || hasShellfish) dietCompatibility = ['omnivore', 'pescatarian'];
  else if (hasEggs || hasDairy || hasHoney) dietCompatibility = ['omnivore', 'vegetarian', 'pescatarian'];
  else dietCompatibility = ['omnivore', 'vegetarian', 'vegan', 'pescatarian'];

  return { dietCompatibility, allergens: [...allergens] };
};

const buildRecipe = (category, name, index) => {
  const group = GROUPS[category];
  const adjustment = CATEGORY_ADJUSTMENTS[category][index % CATEGORY_ADJUSTMENTS[category].length];
  const macro = {
    calories: clamp(group.macro.calories + (adjustment.calories || 0), 120),
    protein: clamp(group.macro.protein + (adjustment.protein || 0), 5),
    carbs: clamp(group.macro.carbs + (adjustment.carbs || 0), 5),
    fats: clamp(group.macro.fats + (adjustment.fats || 0), 2),
    fiber: clamp(group.macro.fiber + (adjustment.fiber || 0), 1)
  };
  const mealType = [...group.mealType];

  if (category === 'breakfast' && index % 6 === 0) mealType.push('post_workout');
  if (category === 'lunch' && index % 8 === 0) mealType.push('post_workout');
  if (category === 'dinner' && index % 10 === 0) mealType.push('post_workout');
  const cuisine = CUISINE_ROTATION[(index + category.length) % CUISINE_ROTATION.length];
  const mealGoalTags = buildGoalTags(category, macro, mealType);
  const ingredients = buildIngredients(category, name);
  const diet = inferDietMetadata(name, ingredients);

  return {
    name,
    description: `${name} - piatto DUBI per ${category}, selezionato secondo preferenze alimentari, allergie/intolleranze e qualita' nutrizionale.`,
    servingSize: '1 porzione',
    calories: macro.calories,
    protein: macro.protein,
    carbs: macro.carbs,
    fats: macro.fats,
    fiber: macro.fiber,
    satietyScore: Math.min(9.7, Math.round((5 + macro.fiber * 0.22 + macro.protein * 0.035) * 10) / 10),
    nutrientDensity: Math.min(9.7, Math.round((5.8 + macro.fiber * 0.16 + macro.protein * 0.035) * 10) / 10),
    processingLevel: index % 13 === 0 ? 'minimally_processed' : 'whole_food',
    glycemicIndex: macro.carbs >= 70 ? 62 : macro.carbs >= 45 ? 52 : 38,
    recoverySupportScore: Math.min(9.7, Math.round((4.8 + macro.protein * 0.055 + macro.carbs * 0.018 + (mealType.includes('post_workout') ? 1 : 0)) * 10) / 10),
    mealType,
    cuisine,
    prepTimeMinutes: category === 'snack' ? 8 + (index % 4) * 3 : 18 + (index % 5) * 6,
    costLevel: index % 7 === 0 ? 'high' : index % 3 === 0 ? 'low' : 'medium',
    difficulty: category === 'snack' ? 'easy' : index % 5 === 0 ? 'medium' : 'easy',
    sodiumLevel: index % 9 === 0 ? 'medium' : 'low',
    addedSugarLevel: category === 'pre_workout' && index % 4 === 0 ? 'medium' : 'low',
    mealGoalTags,
    avoidIf: buildAvoidIf(diet.allergens, macro),
    dietCompatibility: diet.dietCompatibility,
    allergens: diet.allergens,
    ingredients,
    scientificSource: group.source.source,
    evidenceLevel: group.source.evidenceLevel,
    scienceTags: [group.source.label, category]
  };
};

const recipeRows = Object.entries(GROUPS).flatMap(([category, group]) =>
  group.names.map((name, index) => buildRecipe(category, name, index))
);

const seedRecipes = async () => {
  const { Pool } = require('pg');
  require('dotenv').config();
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  if (recipeRows.length !== 150) {
    throw new Error(`Expected 150 recipes, found ${recipeRows.length}`);
  }

  try {
    for (const recipe of recipeRows) {
      const existing = await pool.query('SELECT id FROM recipes WHERE name = $1 LIMIT 1', [recipe.name]);
      if (existing.rows.length > 0) continue;

      await pool.query(
        `
        INSERT INTO recipes (
          name,
          description,
          serving_size,
          calories,
          protein,
          carbs,
          fats,
          fiber,
          satiety_score,
          nutrient_density,
          processing_level,
          glycemic_index,
          recovery_support,
          meal_type,
          cuisine,
          prep_time_minutes,
          cost_level,
          difficulty,
          sodium_level,
          added_sugar_level,
          meal_goal_tags,
          avoid_if,
          diet_compatibility,
          allergens,
          ingredients,
          scientific_source,
          evidence_level
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
        `,
        [
          recipe.name,
          recipe.description,
          recipe.servingSize,
          recipe.calories,
          recipe.protein,
          recipe.carbs,
          recipe.fats,
          recipe.fiber,
          recipe.satietyScore,
          recipe.nutrientDensity,
          recipe.processingLevel,
          recipe.glycemicIndex,
          recipe.recoverySupportScore,
          recipe.mealType,
          recipe.cuisine,
          recipe.prepTimeMinutes,
          recipe.costLevel,
          recipe.difficulty,
          recipe.sodiumLevel,
          recipe.addedSugarLevel,
          recipe.mealGoalTags,
          recipe.avoidIf,
          recipe.dietCompatibility,
          recipe.allergens,
          JSON.stringify(recipe.ingredients),
          recipe.scientificSource,
          recipe.evidenceLevel
        ]
      );
    }
  } finally {
    await pool.end();
  }

  console.log(`Seeded ${recipeRows.length} DUBI recipes`);
};

if (require.main === module) {
  seedRecipes().catch((error) => {
    console.error('Recipe seed failed:', error);
    process.exit(1);
  });
}

module.exports = recipeRows;
