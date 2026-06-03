import json
import re
import unicodedata
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
LIVE_DATA = ROOT / "DUBI_Ricette_Ufficiali_Data.json"
FOUNDATION_JSON = ROOT / "nutrition-data" / "foundation_2026" / "FoodData_Central_foundation_food_json_2026-04-30.json"
SR_JSON = ROOT / "nutrition-data" / "sr_legacy_2018" / "FoodData_Central_sr_legacy_food_json_2018-04.json"
OUTPUT = ROOT / "DUBI_USDA_Ingredient_References.json"

NUTRIENT_IDS = {
    "calories_per_100g": {"1008", "2047", "2048"},
    "protein_per_100g": {"1003"},
    "carbs_per_100g": {"1005"},
    "fats_per_100g": {"1004"},
    "fiber_per_100g": {"1079"},
}

QUERY_MAP = {
    "albumi": "egg white raw",
    "asparagi": "asparagus raw",
    "avocado": "avocados raw",
    "banana": "bananas raw",
    "branzino": "fish bass raw",
    "bresaola": "beef cured dried",
    "broccoli": "broccoli raw",
    "burger vegetale di legumi": "veggie burger",
    "burro di arachidi": "peanut butter smooth",
    "cacao amaro": "cocoa dry powder unsweetened",
    "caffe espresso": "coffee espresso",
    "cannella": "spices cinnamon ground",
    "carote": "carrots raw",
    "ceci": "chickpeas mature seeds cooked boiled",
    "cereali integrali misti": "barley cooked pearled",
    "cetrioli": "cucumber raw",
    "cioccolato fondente": "chocolate dark 70-85%",
    "cous cous": "couscous cooked",
    "crackers integrali o di riso": "crackers whole wheat",
    "crema di nocciole": "chocolate hazelnut spread",
    "crema di riso": "cream of rice dry",
    "datteri": "dates deglet noor",
    "edamame": "soybeans green raw",
    "fagioli": "beans kidney cooked boiled",
    "fagiolini": "beans snap green raw",
    "farina di avena": "oat flour",
    "fesa di tacchino": "turkey breast meat",
    "feta": "cheese feta",
    "finocchi": "fennel bulb raw",
    "fiocchi di avena": "oats rolled",
    "fiocchi di latte": "cottage cheese lowfat",
    "fragole": "strawberries raw",
    "frutta di stagione": "apples raw with skin",
    "funghi": "mushrooms white raw",
    "gallette di riso o mais": "rice cakes brown rice",
    "gamberi": "shrimp raw",
    "grana padano": "cheese parmesan grated",
    "granola": "cereals ready-to-eat granola homemade",
    "hummus": "hummus commercial",
    "insalata mista": "lettuce green leaf raw",
    "kefir": "kefir plain",
    "kiwi": "kiwifruit green raw",
    "lamponi": "raspberries raw",
    "latte di cocco": "coconut milk raw",
    "latte parzialmente scremato o bevanda vegetale": "milk reduced fat 2%",
    "legumi misti": "beans kidney cooked boiled",
    "lenticchie cotte": "lentils mature seeds cooked boiled",
    "lenticchie rosse": "lentils raw",
    "mais": "corn sweet yellow raw",
    "mandorle": "almonds",
    "mango": "mangos raw",
    "manzo": "beef ground 90% lean",
    "marmellata": "jams preserves",
    "mela": "apples raw with skin",
    "merluzzo": "fish cod atlantic raw",
    "miele": "honey",
    "mirtilli o frutti rossi": "blueberries raw",
    "mozzarella": "cheese mozzarella part skim",
    "nasello": "fish haddock raw",
    "noci": "walnuts english",
    "noodles di riso": "rice noodles cooked",
    "olio evo": "oil olive salad or cooking",
    "olive": "olives ripe canned",
    "orzo perlato": "barley pearled cooked",
    "pane": "bread whole-wheat",
    "pane bianco": "bread white",
    "pane di segale": "bread rye",
    "pane per toast": "bread whole-wheat",
    "pane senza glutine": "bread gluten-free",
    "passata di pomodoro": "tomato puree",
    "pasta": "pasta whole-wheat cooked",
    "pasta di lenticchie": "lentils mature seeds cooked boiled",
    "patata dolce": "sweet potato raw unprepared",
    "patate": "potatoes flesh and skin raw",
    "peperoni": "peppers sweet red raw",
    "pera": "pears raw",
    "petto di pollo": "chicken breast meat only raw",
    "piadina": "tortilla whole wheat",
    "polpo": "octopus raw",
    "pomodorini": "tomatoes red ripe raw",
    "pomodoro": "tomatoes red ripe raw",
    "proteine in polvere": "whey protein powder",
    "quinoa": "quinoa cooked",
    "ricotta": "cheese ricotta part skim",
    "riso": "rice brown long-grain cooked",
    "riso basmati": "rice white long-grain cooked",
    "riso jasmine": "rice white long-grain cooked",
    "riso nero": "rice brown long-grain cooked",
    "riso o tortilla": "tortilla whole wheat",
    "riso soffiato": "cereals ready-to-eat rice puffed",
    "rucola": "arugula raw",
    "salmone": "fish salmon atlantic raw",
    "seitan": "wheat gluten",
    "semi di chia": "seeds chia dried",
    "semi di chia o semi misti": "seeds chia dried",
    "sgombro": "fish mackerel raw",
    "skyr": "yogurt greek plain nonfat",
    "spinaci": "spinach raw",
    "spinaci freschi": "spinach raw",
    "succo di arancia": "orange juice raw",
    "tahina": "sesame butter tahini",
    "tempeh": "tempeh",
    "tofu": "tofu firm",
    "tonno al o": "fish tuna light canned in water",
    "trota": "fish trout rainbow raw",
    "uova": "egg whole raw fresh",
    "verdure di stagione": "vegetables mixed frozen",
    "verdure miste": "vegetables mixed frozen",
    "verdure per minestrone": "vegetables mixed frozen",
    "wrap": "tortilla whole wheat",
    "yogurt bianco": "yogurt plain low fat",
    "yogurt di soia o bevanda di soia": "soymilk unsweetened",
    "yogurt greco": "yogurt greek plain nonfat",
    "yogurt senza lattosio": "yogurt plain low fat",
    "zucca": "squash winter butternut raw",
    "zucchine": "zucchini raw",
}

PREFERRED_CONTAINS = {
    "hummus": ["hummus, commercial"],
    "olio evo": ["oil, olive"],
    "banana": ["bananas, raw"],
    "mela": ["apples, raw"],
    "uova": ["egg, whole, raw"],
    "seitan": ["vital wheat gluten"],
}


def normalize(value):
    value = unicodedata.normalize("NFD", str(value).lower())
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    value = re.sub(r"\b\d+(?:[.,-]\d+)?\s*%", "", value)
    value = re.sub(r"\b(light|naturale|fresco|fresca|cotti|cotto|magra|magro|integrale|senza zuccheri aggiunti)\b", "", value)
    value = re.sub(r"[^a-z0-9\s]", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def extract_ingredients():
    payload = json.loads(LIVE_DATA.read_text(encoding="utf-8-sig"))
    ingredients = {}
    for recipe in payload["recipes"]:
        for item in recipe.get("ingredients") or []:
            name = item.get("name", "").strip()
            key = normalize(name)
            if key and key not in ingredients:
                ingredients[key] = name
    return ingredients


def load_foods(path, root_key, source_id):
    payload = json.loads(path.read_text(encoding="utf-8"))
    foods = payload[root_key]
    result = []
    for food in foods:
        if not isinstance(food, dict):
            continue
        nutrients = {}
        for nutrient in food.get("foodNutrients") or []:
            nutrient_id = str((nutrient.get("nutrient") or {}).get("id"))
            amount = nutrient.get("amount")
            if amount is None:
                amount = nutrient.get("median")
            for key, ids in NUTRIENT_IDS.items():
                if nutrient_id in ids and key not in nutrients:
                    nutrients[key] = amount
        if all(nutrients.get(key) is not None for key in ["calories_per_100g", "protein_per_100g", "carbs_per_100g", "fats_per_100g"]):
            result.append({
                "source_id": source_id,
                "source_food_id": str(food.get("fdcId")),
                "source_food_name": food.get("description"),
                "normalized": normalize(food.get("description")),
                **nutrients,
            })
    return result


def score_candidate(query, candidate, ingredient_key):
    query_tokens = [token for token in normalize(query).split() if token]
    haystack = candidate["normalized"]
    score = 0
    for token in query_tokens:
        if token in haystack.split():
            score += 8
        elif token in haystack:
            score += 3
        else:
            score -= 10
    if all(token in haystack for token in query_tokens):
        score += 20
    for preferred in PREFERRED_CONTAINS.get(ingredient_key, []):
        if preferred in candidate["source_food_name"].lower():
            score += 40
    if candidate["source_id"] == "usda_foundation":
        score += 4
    if "wheat gluten" in normalize(query) and "gluten free" in haystack:
        score -= 80
    if any(term in haystack for term in ["babyfood", "restaurant", "fast food", "mcdonald", "pillsbury"]):
        score -= 30
    return score


def best_match(query, candidates, ingredient_key):
    scored = [(score_candidate(query, candidate, ingredient_key), candidate) for candidate in candidates]
    scored.sort(key=lambda item: item[0], reverse=True)
    if not scored or scored[0][0] < 0:
        return None, None
    return scored[0]


def main():
    ingredients = extract_ingredients()
    candidates = []
    candidates.extend(load_foods(FOUNDATION_JSON, "FoundationFoods", "usda_foundation"))
    candidates.extend(load_foods(SR_JSON, "SRLegacyFoods", "usda_sr_legacy"))

    references = []
    missing = []
    for ingredient_key, display_name in sorted(ingredients.items()):
        query = QUERY_MAP.get(ingredient_key, display_name)
        score, match = best_match(query, candidates, ingredient_key)
        if not match:
            missing.append({"ingredient_key": ingredient_key, "display_name": display_name, "query": query})
            continue
        references.append({
            "ingredient_key": ingredient_key,
            "display_name": display_name,
            "source_id": match["source_id"],
            "source_food_id": match["source_food_id"],
            "source_food_name": match["source_food_name"],
            "locale": "global",
            "calories_per_100g": match.get("calories_per_100g"),
            "protein_per_100g": match.get("protein_per_100g"),
            "carbs_per_100g": match.get("carbs_per_100g"),
            "fats_per_100g": match.get("fats_per_100g"),
            "fiber_per_100g": match.get("fiber_per_100g") or 0,
            "confidence_score": 95 if match["source_id"] == "usda_foundation" else 90,
            "match_score": score,
            "source_payload": {
                "matched_query": query,
                "download_source": "USDA FoodData Central downloadable data",
                "release": "Foundation Foods 04/2026 or SR Legacy 04/2018",
                "source_food_name": match["source_food_name"],
                "source_food_id": match["source_food_id"],
            },
        })

    OUTPUT.write_text(json.dumps({
        "generatedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "source": "USDA FoodData Central downloadable data",
        "totalIngredients": len(ingredients),
        "matched": len(references),
        "missing": missing,
        "references": references,
    }, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(OUTPUT), "ingredients": len(ingredients), "matched": len(references), "missing": len(missing)}, indent=2))


if __name__ == "__main__":
    main()
