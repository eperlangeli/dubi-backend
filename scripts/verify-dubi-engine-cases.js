const recipes = require('../seed-recipes');

const PROCESSED_MEAT_PATTERN = /fesa di tacchino|affettat|bresaola|prosciutto|salame|salumi|wurstel|mortadella|speck/i;
const MEAT_PATTERN = /petto di pollo|pollo|manzo|tacchino|vitello|bovino/i;
const RED_MEAT_PATTERN = /manzo|vitello|bovino|bistecca|macinato/i;
const FISH_PATTERN = /salmone|tonno|merluzzo|branzino|sgombro|polpo|gamberi|trota|nasello|pesce/i;
const EGG_PATTERN = /uova|uovo|albumi|omelette|frittata/i;
const DAIRY_PATTERN = /yogurt|skyr|kefir|ricotta|latte|fiocchi di latte|parmigiano|formaggio|mozzarella|feta|grana/i;
const VEGAN_RECIPE_PATTERN = /vegan|vegano|plant[-\s]?based|tofu scramble/i;
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
    if (/diabet|insulino|insulin|glicem|prediabet/.test(item)) out.push('diabetes');
    if (/pressione alta|ipertension|hypertension/.test(item)) out.push('hypertension');
    if (/colesterol|cholesterol|ldl/.test(item)) out.push('hypercholesterolemia');
    if (/colon irritabile|ibs|fodmap|gonfiore cronico/.test(item)) out.push('low_fodmap');
    if (/reflusso|gastrite|gerd|acidit|reflux/.test(item)) out.push('reflux');
    if (/istamina|histamine/.test(item)) out.push('histamine');
    if (/gotta|gout|uric|acido urico|iperuricemia/.test(item)) out.push('gout');
    if (/renale|rene|kidney|renal|nefropat|dialisi/.test(item)) out.push('renal_caution');
    if (/nichel|nickel/.test(item)) out.push('nickel');
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

const isTrueSnack = (recipe, slot) => {
  if (slot !== 'snack') return true;
  const types = mealTypes(recipe);
  const text = textOf(recipe);
  if (/patat/i.test(text) && /tahin|miele/i.test(text)) return false;
  if (MAIN_CARB_PATTERN.test(text) && /tahin|olio|avocado|burro di arachidi/i.test(text) && !/(yogurt|skyr|kefir|ricotta|uova|albumi)/i.test(text)) {
    return false;
  }
  if (types.some((type) => ['lunch', 'dinner', 'pre_workout', 'post_workout'].includes(type))) return false;
  return Number(recipe.calories || 0) <= 320 && !(FISH_PATTERN.test(text) && MAIN_CARB_PATTERN.test(text));
};

const violatesRestrictions = (recipe, restrictions) => {
  const text = textOf(recipe);
  const gi = Number(recipe.glycemicIndex || recipe.glycemic_index || 0);
  const sugar = String(recipe.addedSugarLevel || recipe.added_sugar_level || '').toLowerCase();
  const sodium = String(recipe.sodiumLevel || recipe.sodium_level || '').toLowerCase();
  const protein = Number(recipe.protein || 0);
  const fats = Number(recipe.fats || 0);
  return (
    (restrictions.includes('gluten') && /glutine|pasta|pane|toast|cous cous|orzo|farro|seitan/i.test(text)) ||
    (restrictions.includes('dairy') && DAIRY_PATTERN.test(text)) ||
    (restrictions.includes('lactose') && DAIRY_PATTERN.test(text)) ||
    (restrictions.includes('eggs') && EGG_PATTERN.test(text)) ||
    (restrictions.includes('fish') && FISH_PATTERN.test(text)) ||
    (restrictions.includes('red_meat') && RED_MEAT_PATTERN.test(text)) ||
    (restrictions.includes('meat') && MEAT_PATTERN.test(text)) ||
    (restrictions.includes('diabetes') && (sugar === 'high' || (sugar === 'medium' && /miele|succo|datteri|riso soffiato/i.test(text)) || (gi >= 68 && protein < 22))) ||
    (restrictions.includes('hypertension') && sodium === 'high') ||
    (restrictions.includes('hypercholesterolemia') && (/burro|ghee|pancetta|salame|prosciutto|formaggio stagionato|grana|pecorino/i.test(text) || (fats > 28 && /uova|formaggio|manzo/i.test(text)))) ||
    (restrictions.includes('low_fodmap') && /ceci|lenticchie|fagioli|legumi|hummus|latte\b|ricotta|kefir|yogurt|mela|pera|mango|avocado|pane|pasta|farro|orzo|cous cous/i.test(text)) ||
    (restrictions.includes('reflux') && /caffe|caffè|cacao|cioccolato|arancia|succo|pomodoro|speziat|curry|limone|menta/i.test(text)) ||
    (restrictions.includes('histamine') && /kefir|yogurt|formaggio|ricotta|pomodoro|spinaci|avocado|cioccolato|cacao|tonno|sgombro|salmone affumicato/i.test(text)) ||
    (restrictions.includes('gout') && /manzo|vitello|bovino|sgombro|tonno|salmone|gamberi|polpo|crostace|frutti di mare/i.test(text)) ||
    (restrictions.includes('renal_caution') && (protein > 45 || /proteine in polvere|whey|shake proteico/i.test(text))) ||
    (restrictions.includes('nickel') && /ceci|lenticchie|fagioli|legumi|soia|tofu|tempeh|edamame|avena|farro|orzo|cacao|cioccolato|noci|mandorle|semi|spinaci|pomodoro/i.test(text))
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
    if (!isTrueSnack(recipe, slot)) return false;
    if (['lunch', 'dinner'].includes(slot) && mainCarbs(recipe).length > 1) return false;
    const group = proteinGroup(recipe);
    if (normalizedDiet === 'omnivore' && (VEGAN_RECIPE_PATTERN.test(textOf(recipe)) || group === 'plant')) return false;
    if (normalizedDiet === 'omnivore' && ['lunch', 'dinner'].includes(slot) && group === 'other') return false;
    return true;
  });
};

const cases = [
  { name: 'onnivoro_colazione_dolce', diet: 'omnivore', allergies: '', breakfastPref: 'dolce', min: { breakfast: 3, lunch: 8, dinner: 8, snack: 8 } },
  { name: 'onnivoro_colazione_salata_no_carne_rossa', diet: 'omnivore', allergies: 'no carne rossa', breakfastPref: 'salata', min: { breakfast: 3, lunch: 5, dinner: 5, snack: 8 } },
  { name: 'celiaco_onnivoro', diet: 'omnivore', allergies: 'celiaco', breakfastPref: 'entrambi', min: { breakfast: 5, lunch: 5, dinner: 5, snack: 8 } },
  { name: 'vegetariano_no_lattosio', diet: 'vegetarian', allergies: 'lattosio', breakfastPref: 'dolce', min: { breakfast: 2, lunch: 4, dinner: 4, snack: 5 } },
  { name: 'onnivoro_diabete', diet: 'omnivore', allergies: 'diabete tipo 2 insulino resistenza', breakfastPref: 'entrambi', min: { breakfast: 5, lunch: 8, dinner: 8, snack: 8 } },
  { name: 'onnivoro_reflusso', diet: 'omnivore', allergies: 'reflusso gastrite', breakfastPref: 'entrambi', min: { breakfast: 5, lunch: 8, dinner: 8, snack: 8 } },
  { name: 'onnivoro_ibs_low_fodmap', diet: 'omnivore', allergies: 'colon irritabile low fodmap', breakfastPref: 'entrambi', min: { breakfast: 3, lunch: 5, dinner: 5, snack: 5 } },
  { name: 'onnivoro_istamina', diet: 'omnivore', allergies: 'intolleranza istamina', breakfastPref: 'entrambi', min: { breakfast: 3, lunch: 5, dinner: 5, snack: 5 } },
  { name: 'onnivoro_gotta', diet: 'omnivore', allergies: 'gotta acido urico alto', breakfastPref: 'entrambi', min: { breakfast: 5, lunch: 5, dinner: 5, snack: 8 } },
  { name: 'onnivoro_cautela_renale', diet: 'omnivore', allergies: 'patologia renale', breakfastPref: 'entrambi', min: { breakfast: 5, lunch: 5, dinner: 5, snack: 8 } },
  { name: 'onnivoro_nichel', diet: 'omnivore', allergies: 'intolleranza nichel', breakfastPref: 'entrambi', min: { breakfast: 2, lunch: 4, dinner: 4, snack: 4 } },
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
