const recipes = require('../seed-recipes');
const { buildSourceBackedNutritionFromIngredients } = require('../services/ingredient-macros');

const MAIN_CARB_PATTERN = /riso|noodles|pasta|quinoa|cous cous|orzo|farro|pane|toast|patate|patata|crema di riso|avena/i;
const VEGETABLE_PATTERN = /verdure|zucchine|broccoli|spinaci|funghi|pomodor|carote|asparagi|peperoni|cetrioli|rucola|insalata|fagiolini|finocchi/i;
const MEAT_PATTERN = /pollo|manzo|tacchino|vitello|bovino/i;
const FISH_PATTERN = /salmone|tonno|merluzzo|branzino|sgombro|polpo|gamberi|trota|nasello|pesce/i;
const EGG_PATTERN = /uova|uovo|albumi|omelette|frittata/i;
const PLANT_PROTEIN_PATTERN = /tofu|tempeh|edamame|ceci|lenticchie|fagioli|legumi/i;
const DAIRY_PATTERN = /yogurt|skyr|kefir|ricotta|latte parzialmente|fiocchi di latte|mozzarella|feta|grana|formaggio|whey/i;
const PROCESSED_MEAT_PATTERN = /fesa di tacchino|affettat|bresaola|prosciutto|salame|salumi|wurstel|mortadella|speck/i;
const PLANT_DAIRY_PATTERN = /(latte|yogurt|bevanda)\s+(di\s+)?(soia|mandorla|avena|riso|cocco)|bevanda vegetale/i;

const mealTypes = (recipe) => recipe.mealType || recipe.meal_type || [];
const dietCompatibility = (recipe) => recipe.dietCompatibility || recipe.diet_compatibility || [];
const ingredientNames = (recipe) => (recipe.ingredients || []).map((ingredient) => ingredient.name || String(ingredient));
const recipeText = (recipe) => `${recipe.name} ${ingredientNames(recipe).join(' ')}`;
const stripPlantDairyTerms = (text = '') => String(text)
  .replace(PLANT_DAIRY_PATTERN, '')
  .replace(/yogurt di soia|latte di soia|latte di cocco|latte di mandorla|latte di avena|latte di riso|bevanda di soia/gi, '');

const proteinGroup = (recipe) => {
  const text = recipeText(recipe);
  if (FISH_PATTERN.test(text)) return 'fish';
  if (MEAT_PATTERN.test(text)) return 'meat';
  if (EGG_PATTERN.test(text)) return 'eggs';
  if (PLANT_PROTEIN_PATTERN.test(text)) return 'plant';
  return 'other';
};

const atwaterCalories = (recipe) => Math.round(
  Number(recipe.protein || 0) * 4 +
  Number(recipe.carbs || 0) * 4 +
  Number(recipe.fats || 0) * 9
);

const pushIssue = (issues, severity, type, recipe, extra = {}) => {
  issues.push({
    severity,
    type,
    recipe: recipe.name,
    mealType: mealTypes(recipe),
    dietCompatibility: dietCompatibility(recipe),
    ...extra
  });
};

const auditRecipes = () => {
  const issues = [];
  const summary = {
    count: recipes.length,
    byMealType: {},
    byDiet: {},
    byProteinGroup: {},
    sourceBackedRecipes: 0,
    fullySourceBackedRecipes: 0,
    issueTypes: {}
  };

  recipes.forEach((recipe) => {
    mealTypes(recipe).forEach((type) => {
      summary.byMealType[type] = (summary.byMealType[type] || 0) + 1;
    });
    dietCompatibility(recipe).forEach((diet) => {
      summary.byDiet[diet] = (summary.byDiet[diet] || 0) + 1;
    });
    const group = proteinGroup(recipe);
    summary.byProteinGroup[group] = (summary.byProteinGroup[group] || 0) + 1;

    const text = recipeText(recipe);
    const mainCarbs = (recipe.ingredients || [])
      .filter((ingredient) => MAIN_CARB_PATTERN.test(String(ingredient.name || ingredient)))
      .filter((ingredient) => !VEGETABLE_PATTERN.test(String(ingredient.name || ingredient)));
    const isMainMeal = mealTypes(recipe).some((type) => ['lunch', 'dinner'].includes(type));
    const isPureSnack = mealTypes(recipe).includes('snack') &&
      !mealTypes(recipe).some((type) => ['pre_workout', 'post_workout'].includes(type));
    const sourceNutrition = buildSourceBackedNutritionFromIngredients(recipe.ingredients || []);
    const sourceCoverage = sourceNutrition?.sourceCoverage || 0;
    if (sourceCoverage >= 75) summary.sourceBackedRecipes += 1;
    if (sourceCoverage === 100) summary.fullySourceBackedRecipes += 1;

    const declaredEnergy = Number(recipe.calories || 0);
    const calculatedEnergy = atwaterCalories(recipe);
    if (Math.abs(declaredEnergy - calculatedEnergy) > 8) {
      pushIssue(issues, 'high', 'macro_energy_mismatch', recipe, { declaredEnergy, calculatedEnergy });
    }

    if (isMainMeal && mainCarbs.length > 1) {
      pushIssue(issues, 'high', 'multiple_main_carbs', recipe, { mainCarbs: mainCarbs.map((item) => item.name || item) });
    }

    if (isPureSnack && (declaredEnergy > 320 || ['fish', 'meat'].includes(group))) {
      pushIssue(issues, 'medium', 'snack_too_meal_like', recipe, { declaredEnergy, proteinGroup: group });
    }

    if (PROCESSED_MEAT_PATTERN.test(text)) {
      pushIssue(issues, 'high', 'processed_meat', recipe);
    }

    if (!sourceNutrition || sourceCoverage < 100) {
      pushIssue(issues, 'high', 'missing_source_macro_refs', recipe, { sourceCoverage });
    }

    if (dietCompatibility(recipe).includes('vegan') &&
      (MEAT_PATTERN.test(text) || FISH_PATTERN.test(text) || EGG_PATTERN.test(text) || DAIRY_PATTERN.test(stripPlantDairyTerms(text)) || /miele/i.test(text))) {
      pushIssue(issues, 'high', 'bad_vegan_compatibility', recipe);
    }
  });

  issues.forEach((issue) => {
    summary.issueTypes[issue.type] = (summary.issueTypes[issue.type] || 0) + 1;
  });

  return { summary, issues };
};

if (require.main === module) {
  const result = auditRecipes();
  console.log(JSON.stringify(result, null, 2));
  const highIssues = result.issues.filter((issue) => issue.severity === 'high');
  if (highIssues.length > 0) process.exit(1);
}

module.exports = { auditRecipes };
