'use strict';

const MEAL_ASSEMBLY = Object.freeze({
  version: 'meal-assembly-v1',
  status: 'provisional_da_validare_col_nutrizionista',
  source: 'config/meal-assembly.js',

  orphanComponents: Object.freeze({
    oats: Object.freeze({
      patterns: Object.freeze(['fiocchi di avena', 'avena', 'oat', 'oats']),
      requiresAny: Object.freeze(['milk_base', 'yogurt_base', 'skyr', 'ricotta']),
      preferredAssemblies: Object.freeze(['porridge', 'overnight_oats', 'yogurt_bowl', 'pancake'])
    }),
    chiaSeeds: Object.freeze({
      patterns: Object.freeze(['semi di chia', 'chia']),
      requiresAny: Object.freeze(['milk_base', 'yogurt_base', 'skyr']),
      preferredAssemblies: Object.freeze(['chia_pudding', 'yogurt_bowl', 'porridge'])
    }),
    flaxSeeds: Object.freeze({
      patterns: Object.freeze(['semi di lino', 'flax']),
      requiresAny: Object.freeze(['yogurt_base', 'porridge', 'smoothie']),
      preferredAssemblies: Object.freeze(['yogurt_bowl', 'porridge', 'smoothie'])
    }),
    honey: Object.freeze({
      patterns: Object.freeze(['miele', 'honey']),
      requiresAny: Object.freeze(['bread', 'yogurt_base', 'skyr', 'ricotta']),
      preferredAssemblies: Object.freeze(['toast', 'yogurt_bowl', 'ricotta_bowl'])
    }),
    jam: Object.freeze({
      patterns: Object.freeze(['marmellata', 'jam']),
      requiresAny: Object.freeze(['bread', 'yogurt_base']),
      preferredAssemblies: Object.freeze(['fresh_bread_with_jam', 'yogurt_bowl'])
    }),
    riceCakes: Object.freeze({
      patterns: Object.freeze(['gallette', 'rice cakes', 'rice cake']),
      requiresAny: Object.freeze(['honey', 'jam', 'fruit']),
      preferredAssemblies: Object.freeze(['rice_cakes_with_honey', 'rice_cakes_with_fruit'])
    }),
    puffedRice: Object.freeze({
      patterns: Object.freeze(['riso soffiato', 'puffed rice']),
      requiresAny: Object.freeze(['milk_base', 'yogurt_base', 'skyr']),
      preferredAssemblies: Object.freeze(['yogurt_bowl', 'milk_bowl'])
    })
  }),

  assemblies: Object.freeze({
    porridge: Object.freeze({
      mealTypes: Object.freeze(['breakfast']),
      style: 'sweet_breakfast',
      servedAs: 'bowl',
      titleIt: 'Porridge con {main}',
      titleEn: 'Porridge with {main}',
      instructionsIt: 'Ammorbidisci o cuoci l’avena con latte/bevanda vegetale, poi completa con la fonte proteica e la frutta.',
      instructionsEn: 'Soften or cook the oats with milk/plant drink, then add the protein source and fruit.'
    }),
    overnight_oats: Object.freeze({
      mealTypes: Object.freeze(['breakfast']),
      style: 'sweet_breakfast',
      servedAs: 'jar_or_bowl',
      titleIt: 'Overnight oats con {main}',
      titleEn: 'Overnight oats with {main}',
      instructionsIt: 'Mescola avena e base liquida/cremosa, lascia riposare e aggiungi frutta o topping al momento di mangiare.',
      instructionsEn: 'Mix oats with a liquid/creamy base, let them rest, and add fruit or toppings before eating.'
    }),
    yogurt_bowl: Object.freeze({
      mealTypes: Object.freeze(['breakfast', 'snack', 'post_workout']),
      style: 'sweet_bowl',
      servedAs: 'bowl',
      titleIt: 'Bowl proteica con {main}',
      titleEn: 'Protein bowl with {main}',
      instructionsIt: 'Usa yogurt/skyr come base, aggiungi frutta e completa con eventuali cereali o semi.',
      instructionsEn: 'Use yogurt/skyr as the base, add fruit, and finish with grains or seeds if present.'
    }),
    ricotta_bowl: Object.freeze({
      mealTypes: Object.freeze(['breakfast', 'snack', 'post_workout']),
      style: 'sweet_bowl',
      servedAs: 'bowl',
      titleIt: 'Ricotta con {main}',
      titleEn: 'Ricotta with {main}',
      instructionsIt: 'Servi la ricotta con frutta e un piccolo topping dolce se previsto.',
      instructionsEn: 'Serve ricotta with fruit and a small sweet topping when included.'
    }),
    pancake: Object.freeze({
      mealTypes: Object.freeze(['breakfast']),
      style: 'sweet_breakfast',
      servedAs: 'plate',
      titleIt: 'Pancake proteici con {main}',
      titleEn: 'Protein pancakes with {main}',
      instructionsIt: 'Prepara una pastella con uova/albumi, yogurt e avena; cuoci in padella antiaderente e aggiungi la frutta.',
      instructionsEn: 'Make a batter with eggs/egg whites, yogurt and oats; cook in a non-stick pan and add fruit.'
    }),
    omelette: Object.freeze({
      mealTypes: Object.freeze(['breakfast']),
      style: 'savory_breakfast',
      servedAs: 'plate',
      titleIt: 'Omelette con {main}',
      titleEn: 'Omelette with {main}',
      instructionsIt: 'Cuoci uova o albumi in omelette e accompagna con pane fresco o verdure se presenti.',
      instructionsEn: 'Cook eggs or egg whites as an omelette and serve with fresh bread or vegetables if present.'
    }),
    tofu_scramble: Object.freeze({
      mealTypes: Object.freeze(['breakfast']),
      style: 'savory_breakfast',
      servedAs: 'plate',
      titleIt: 'Tofu strapazzato con {main}',
      titleEn: 'Tofu scramble with {main}',
      instructionsIt: 'Sbriciola il tofu e saltalo brevemente con verdure o pane fresco se presenti.',
      instructionsEn: 'Crumble tofu and quickly sauté it with vegetables or fresh bread if present.'
    }),
    fresh_bread_toast: Object.freeze({
      mealTypes: Object.freeze(['breakfast', 'snack', 'pre_workout']),
      style: 'toast',
      servedAs: 'toast',
      titleIt: 'Pane fresco con {main}',
      titleEn: 'Fresh bread with {main}',
      instructionsIt: 'Usa pane fresco e abbinalo agli ingredienti previsti come topping o farcitura.',
      instructionsEn: 'Use fresh bread and pair it with the planned toppings or filling.'
    }),
    pasta_plate: Object.freeze({
      mealTypes: Object.freeze(['lunch', 'dinner']),
      style: 'main_meal',
      servedAs: 'plate',
      titleIt: 'Pasta con {main}',
      titleEn: 'Pasta with {main}',
      instructionsIt: 'Cuoci la pasta, uniscila alla proteina e alle verdure, poi condisci con olio EVO a crudo.',
      instructionsEn: 'Cook the pasta, combine it with the protein and vegetables, then finish with extra-virgin olive oil.'
    }),
    grain_bowl: Object.freeze({
      mealTypes: Object.freeze(['lunch', 'dinner']),
      style: 'main_meal',
      servedAs: 'bowl',
      titleIt: 'Bowl di cereali con {main}',
      titleEn: 'Grain bowl with {main}',
      instructionsIt: 'Componi una bowl con il cereale, la fonte proteica, le verdure e il condimento previsto.',
      instructionsEn: 'Build a bowl with the grain, protein source, vegetables and planned dressing.'
    }),
    potato_plate: Object.freeze({
      mealTypes: Object.freeze(['lunch', 'dinner']),
      style: 'main_meal',
      servedAs: 'plate',
      titleIt: 'Piatto con patate, {main}',
      titleEn: 'Potato plate with {main}',
      instructionsIt: 'Usa patate come fonte di carboidrati e completa con proteine, verdure e olio EVO.',
      instructionsEn: 'Use potatoes as the carbohydrate source and complete the plate with protein, vegetables and olive oil.'
    }),
    legume_bowl: Object.freeze({
      mealTypes: Object.freeze(['lunch', 'dinner']),
      style: 'main_meal',
      servedAs: 'bowl',
      titleIt: 'Bowl di legumi con {main}',
      titleEn: 'Legume bowl with {main}',
      instructionsIt: 'Servi i legumi con cereali o pane fresco se previsti, verdure e olio EVO.',
      instructionsEn: 'Serve legumes with grains or fresh bread when planned, vegetables and extra-virgin olive oil.'
    }),
    salad_bowl: Object.freeze({
      mealTypes: Object.freeze(['lunch', 'dinner']),
      style: 'main_meal',
      servedAs: 'salad_bowl',
      titleIt: 'Insalatona con {main}',
      titleEn: 'Big salad with {main}',
      instructionsIt: 'Componi un’insalatona con verdure, fonte proteica, carboidrato se previsto e condimento coerente.',
      instructionsEn: 'Build a large salad with vegetables, protein source, carbohydrate if planned and a coherent dressing.'
    }),
    quick_carb_snack: Object.freeze({
      mealTypes: Object.freeze(['pre_workout', 'snack']),
      style: 'easy_carb',
      servedAs: 'snack',
      titleIt: 'Spuntino rapido con {main}',
      titleEn: 'Quick snack with {main}',
      instructionsIt: 'Consumalo come spuntino semplice e digeribile prima dell’allenamento o tra i pasti.',
      instructionsEn: 'Eat it as a simple, digestible snack before training or between meals.'
    }),
    recovery_plate: Object.freeze({
      mealTypes: Object.freeze(['post_workout']),
      style: 'recovery',
      servedAs: 'plate_or_bowl',
      titleIt: 'Recupero post-workout con {main}',
      titleEn: 'Post-workout recovery with {main}',
      instructionsIt: 'Abbina la fonte proteica ai carboidrati per supportare recupero e ripristino energetico.',
      instructionsEn: 'Pair the protein source with carbohydrates to support recovery and energy replenishment.'
    })
  })
});

module.exports = {
  MEAL_ASSEMBLY
};
