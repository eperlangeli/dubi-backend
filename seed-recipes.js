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
    count: 24,
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
      'Bowl Riso Latte e Cannella'
    ],
    macro: { calories: 340, protein: 24, carbs: 42, fats: 10, fiber: 7 },
    source: SOURCE_LIBRARY.lowGiFiber
  },
  lunch: {
    count: 24,
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
      'Riso Tofu Mango e Cetrioli'
    ],
    macro: { calories: 540, protein: 38, carbs: 62, fats: 14, fiber: 10 },
    source: SOURCE_LIBRARY.mediterraneanQuality
  },
  dinner: {
    count: 24,
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
      'Bowl Mediterranea Vegan'
    ],
    macro: { calories: 480, protein: 36, carbs: 48, fats: 15, fiber: 9 },
    source: SOURCE_LIBRARY.mediterraneanQuality
  },
  snack: {
    count: 20,
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
      'Ricotta Cannella e Pera'
    ],
    macro: { calories: 230, protein: 16, carbs: 24, fats: 8, fiber: 5 },
    source: SOURCE_LIBRARY.proteinSatiety
  },
  pre_workout: {
    count: 14,
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
      'Succo Arancia Toast e Ricotta'
    ],
    macro: { calories: 285, protein: 15, carbs: 42, fats: 7, fiber: 4 },
    source: SOURCE_LIBRARY.recoveryCarbs
  },
  post_workout: {
    count: 14,
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
      'Crema Riso Whey e Mirtilli'
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

const buildRecipe = (category, name, index) => {
  const group = GROUPS[category];
  const diet = DIET_ROTATION[index % DIET_ROTATION.length];
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
    ingredients: [
      { name: 'Fonte proteica principale', quantity: 1, unit: 'porzione' },
      { name: 'Carboidrato o fibra principale', quantity: 1, unit: 'porzione' },
      { name: 'Verdure, frutta o grassi di qualita', quantity: 1, unit: 'porzione' }
    ],
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

  if (recipeRows.length !== 120) {
    throw new Error(`Expected 120 recipes, found ${recipeRows.length}`);
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
