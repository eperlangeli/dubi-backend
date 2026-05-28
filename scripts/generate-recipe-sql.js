const recipes = require('../seed-recipes');

const escapeSql = (value) => String(value ?? '').replace(/'/g, "''");
const sqlArray = (items) => `ARRAY[${(items || []).map((item) => `'${escapeSql(item)}'`).join(',')}]::varchar[]`;
const sqlJson = (value) => `'${escapeSql(JSON.stringify(value))}'::jsonb`;

const rows = recipes.map((recipe) => `(
  '${escapeSql(recipe.name)}',
  '${escapeSql(recipe.description)}',
  '${escapeSql(recipe.servingSize)}',
  ${recipe.calories},
  ${recipe.protein},
  ${recipe.carbs},
  ${recipe.fats},
  ${recipe.fiber},
  ${recipe.satietyScore},
  ${recipe.nutrientDensity},
  '${escapeSql(recipe.processingLevel)}',
  ${recipe.glycemicIndex},
  ${recipe.recoverySupportScore},
  ${sqlArray(recipe.mealType)},
  '${escapeSql(recipe.cuisine)}',
  ${recipe.prepTimeMinutes},
  '${escapeSql(recipe.costLevel)}',
  '${escapeSql(recipe.difficulty)}',
  '${escapeSql(recipe.sodiumLevel)}',
  '${escapeSql(recipe.addedSugarLevel)}',
  ${sqlArray(recipe.mealGoalTags)},
  ${sqlArray(recipe.avoidIf)},
  ${sqlArray(recipe.dietCompatibility)},
  ${sqlArray(recipe.allergens)},
  ${sqlJson(recipe.ingredients)},
  '${escapeSql(recipe.scientificSource)}',
  '${escapeSql(recipe.evidenceLevel)}'
)`);

const chunks = [];

for (let index = 0; index < rows.length; index += 30) {
  chunks.push(`
INSERT INTO public.recipes (
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
SELECT *
FROM (VALUES
${rows.slice(index, index + 30).join(',\n')}
) AS v(
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
WHERE NOT EXISTS (
  SELECT 1
  FROM public.recipes r
  WHERE r.name = v.name
);
`);
}

console.log(JSON.stringify(chunks));
