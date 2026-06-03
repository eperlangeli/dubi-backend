# DUBI Nutrition Pipeline

This is the operational pipeline that turns DUBI recipes from generated meals into source-backed nutrition records.

## Required Environment

Set these variables in Render and in any local `.env` used for production-style runs:

```txt
DATABASE_URL=...
USDA_FDC_API_KEY=...
NUTRITION_ADMIN_TOKEN=...
```

`USDA_FDC_API_KEY` is required for USDA FoodData Central ingestion. Use Foundation Foods and SR Legacy first.
For European datasets downloaded as CSV files, configure:

```txt
NUTRITION_CSV_SOURCE_ID=ciqual
NUTRITION_CSV_PATH=C:\path\to\ciqual.csv
NUTRITION_CSV_DELIMITER=;
NUTRITION_CSV_LOCALE=eu
```

Optional column mapping variables:

```txt
NUTRITION_CSV_NAME_COLUMN=...
NUTRITION_CSV_ID_COLUMN=...
NUTRITION_CSV_CALORIES_COLUMN=...
NUTRITION_CSV_PROTEIN_COLUMN=...
NUTRITION_CSV_CARBS_COLUMN=...
NUTRITION_CSV_FATS_COLUMN=...
NUTRITION_CSV_FIBER_COLUMN=...
```

## Pipeline

1. Apply schema:

```bash
npm run init-db
```

2. Seed or refresh recipes:

```bash
npm run seed-recipes
```

3. Ingest official USDA ingredient references:

```bash
npm run ingest-usda
```

For a limited dry run:

```bash
USDA_INGEST_LIMIT=10 npm run ingest-usda
```

4. Import European official datasets when local CSV exports are available:

```bash
npm run import-nutrition-csv
```

Use `NUTRITION_CSV_SOURCE_ID=ciqual`, `crea`, `bls`, or `eurofir` depending on the source file.

5. Audit recipes against the loaded official ingredient references:

```bash
npm run audit-recipes
```

6. Inspect Supabase:

- `nutrition_ingredient_refs`
- `recipe_nutrition_audits`
- `recipes.nutrition_audit_status`
- `recipes.nutrition_confidence_score`
- `recipes.nutrition_source_ids`

## Backend Endpoints

Public read/diagnostic:

```txt
GET /api/nutrition-brain/sources
GET /api/nutrition-brain/source-priority?locale=it
POST /api/nutrition-brain/validate-macros
POST /api/nutrition-brain/score-reference
```

Protected write:

```txt
POST /api/nutrition-brain/audit-recipes
Header: x-nutrition-admin-token: <NUTRITION_ADMIN_TOKEN>
```

## Current Limitations

- USDA ingestion requires a valid data.gov API key.
- CIQUAL/CREA/BLS/EuroFIR ingestion is available through CSV import; each downloaded file may need column mapping because official exports differ by source/version.
- Ingredient matching is deterministic and conservative; ambiguous foods should be reviewed manually before marking high confidence.
- Cooking yield and water loss are not yet modeled; portion conversions use default gram estimates for common units.
- Recipe macros are updated only when a recipe reaches `approved`; partial coverage is audited but does not overwrite the recipe numbers.

## Target Status Meanings

- `approved`: all ingredients matched to official references and recipe macros are within tolerance.
- `needs_macro_adjustment`: enough official references exist, but declared recipe macros should be updated.
- `pending_sources`: not enough official references have been loaded yet.
- `macro_mismatch`: declared calories do not match declared macros using Atwater factors.
