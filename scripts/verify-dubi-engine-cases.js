const recipes = require('../seed-recipes');

const PROCESSED_MEAT_PATTERN = /fesa di tacchino|affettat|bresaola|prosciutto|salame|salumi|wurstel|mortadella|speck/i;
const MEAT_PATTERN = /petto di pollo|pollo|manzo|tacchino|vitello|bovino/i;
const RED_MEAT_PATTERN = /manzo|vitello|bovino|bistecca|macinato/i;
const FISH_PATTERN = /salmone|tonno|merluzzo|branzino|sgombro|polpo|gamberi|trota|nasello|pesce/i;
const EGG_PATTERN = /uova|uovo|albumi|omelette|frittata/i;
const DAIRY_PATTERN = /yogurt|skyr|kefir|ricotta|latte|fiocchi di latte|parmigiano|formaggio|mozzarella|feta|grana/i;
const PLANT_PROTEIN_PATTERN = /tofu|tempeh|edamame|ceci|lenticchie|fagioli|legumi/i;
const MAIN_CARB_PATTERN = /riso|noodles|pasta|quinoa|cous cous|orzo|farro|pane|toast|patate|patata|crema di riso|avena/i;
const VEGETABLE_PATTERN = /verdure|zucchine|broccoli|spinaci|funghi|pomodor|carote|asparagi|peperoni|cetrioli|rucola|insalata|fagiolini|finocchi/i;
const SWEET_BREAKFAST_PATTERN = /porridge|yogurt|skyr|chia|pancake|smoothie|ricotta.*miele|crema di riso|frutta|mirtilli|fragole|lamponi|banana|mela|pera|kiwi|mango|cacao|cannella|muesli|overnight|kefir/i;
const SAVORY_BREAKFAST_PATTERN = /toast|uova|omelette|frittata|hummus|tacchino|salmone|patate|tofu scramble|avocado toast|pane/i;

const normalizeDiet = (diet) => {
  const value = String(diet || 'omnivore').toLowerCase();
  if (['vegetarian', 'vegetariano'].includes(value)) return 'vegetarian';
  if (['vegan', 'vegano'].includes(value)) return 'vegan';
  if (['pescatarian', 'pescetariano'].includes(value)) return 'pescatarian';
  return 'omnivore';
};

const normalizeRestrictions = (value = '') => String(value)
  .toLowerCase()
  .split(/[,;]+/)
  .map((item) => item.trim())
  .filter(Boolean)
  .flatMap((item) => {
    const out = [item];
    if (/celiac|celiach|glutin|gluten/.test(item)) out.push('gluten');
    if (/latt|latte|dairy|milk/.test(item)) out.push('dairy', 'lactose');
    if (/uov|egg/.test(item)) out.push('eggs');
    if (/pesce|fish/.test(item)) out.push('fish');
    if (/carne rossa|red meat|manzo|vitello|bovino/.test(item)) out.push('red_meat');
    if (/no carne|senza carne|non mangio carne|no meat/.test(item)) out.push('meat');
    return out;
  });

const mealTypes = (recipe) => recipe.mealType || recipe.meal_type || [];
const dietCompatibility = (recipe) => recipe.dietCompatibility || recipe.diet_compatibility || [];
const textOf = (recipe) => `${recipe.name} ${(recipe.ingredients || []).map((item) => item.name || item).join(' ')}`;
const mainCarbs = (recipe) => (recipe.ingredients || [])
  .filter((ingredient) => MAIN_CARB_PATTERN.test(String(ingredient.name || ingredient)))
  .filter((ingredient) => !VEGETABLE_PATTERN.test(String(ingredient.name || ingredient)));

const proteinGroup = (recipe) => {
  const text = textOf(recipe);
  if (FISH_PATTERN.test(text)) return 'fish';
  if (MEAT_PATTERN.test(text)) return 'meat';
  if (EGG_PATTERN.test(text)) return 'eggs';
  if (PLANT_PROTEIN_PATTERN.test(text)) return 'plant';
  return 'other';
};

const matchesBreakfastPreference = (recipe, preference) => {
  const pref = String(preference || '').toLowerCase();
  if (!['dolce', 'sweet', 'salata', 'salato', 'savory'].includes(pref)) return true;
  const text = textOf(recipe);
  if (['dolce', 'sweet'].includes(pref)) return SWEET_BREAKFAST_PATTERN.test(text) && !SAVORY_BREAKFAST_PATTERN.test(text);
  return SAVORY_BREAKFAST_PATTERN.test(text);
};

const violatesRestrictions = (recipe, restrictions) => {
  const text = textOf(recipe);
  return (
    (restrictions.includes('gluten') && /glutine|pasta|pane|toast|cous cous|orzo|farro|seitan/i.test(text)) ||
    (restrictions.includes('dairy') && DAIRY_PATTERN.test(text)) ||
    (restrictions.includes('lactose') && DAIRY_PATTERN.test(text)) ||
    (restrictions.includes('eggs') && EGG_PATTERN.test(text)) ||
    (restrictions.includes('fish') && FISH_PATTERN.test(text)) ||
    (restrictions.includes('red_meat') && RED_MEAT_PATTERN.test(text)) ||
    (restrictions.includes('meat') && MEAT_PATTERN.test(text))
  );
};

const candidatesFor = ({ diet, allergies, breakfastPref, slot }) => {
  const normalizedDiet = normalizeDiet(diet);
  const restrictions = normalizeRestrictions(allergies);
  return recipes.filter((recipe) => {
    if (!dietCompatibility(recipe).includes(normalizedDiet)) return false;
    if (!mealTypes(recipe).includes(slot)) return false;
    if (PROCESSED_MEAT_PATTERN.test(textOf(recipe))) return false;
    if (violatesRestrictions(recipe, restrictions)) return false;
    if (slot === 'breakfast' && !matchesBreakfastPreference(recipe, breakfastPref)) return false;
    if (['lunch', 'dinner'].includes(slot) && mainCarbs(recipe).length > 1) return false;
    const group = proteinGroup(recipe);
    if (normalizedDiet === 'omnivore' && ['lunch', 'dinner'].includes(slot) && ['plant', 'other'].includes(group)) return false;
    return true;
  });
};

const cases = [
  { name: 'onnivoro_colazione_dolce', diet: 'omnivore', allergies: '', breakfastPref: 'dolce', min: { breakfast: 3, lunch: 8, dinner: 8, snack: 8 } },
  { name: 'onnivoro_colazione_salata_no_carne_rossa', diet: 'omnivore', allergies: 'no carne rossa', breakfastPref: 'salata', min: { breakfast: 3, lunch: 5, dinner: 5, snack: 8 } },
  { name: 'celiaco_onnivoro', diet: 'omnivore', allergies: 'celiaco', breakfastPref: 'entrambi', min: { breakfast: 5, lunch: 5, dinner: 5, snack: 8 } },
  { name: 'vegetariano_no_lattosio', diet: 'vegetarian', allergies: 'lattosio', breakfastPref: 'dolce', min: { breakfast: 2, lunch: 4, dinner: 4, snack: 5 } },
  { name: 'vegano', diet: 'vegan', allergies: '', breakfastPref: 'entrambi', min: { breakfast: 3, lunch: 5, dinner: 5, snack: 5 } },
  { name: 'pescetariano_no_glutine', diet: 'pescatarian', allergies: 'glutine', breakfastPref: 'entrambi', min: { breakfast: 5, lunch: 5, dinner: 5, snack: 8 } }
];

const results = cases.map((testCase) => {
  const slots = Object.keys(testCase.min);
  const counts = Object.fromEntries(slots.map((slot) => [slot, candidatesFor({ ...testCase, slot }).length]));
  const failures = slots
    .filter((slot) => counts[slot] < testCase.min[slot])
    .map((slot) => ({ slot, expectedAtLeast: testCase.min[slot], found: counts[slot] }));
  return { name: testCase.name, counts, failures };
});

if (require.main === module) {
  console.log(JSON.stringify({ cases: results }, null, 2));
  if (results.some((result) => result.failures.length)) process.exit(1);
}

module.exports = { candidatesFor, results };
