# DUBI AI Engine - FASE 2 Summary

FASE 2 aggiunge il Layer 4: generazione pasti dal database ricette.

## Logica implementata

`POST /api/ai/generate-plan` ora esegue:

1. Layer 0: legge onboarding, wearable data e peso.
2. Layer 1: interpreta stato fisiologico da HRV, sonno e attivita'.
3. Layer 2: calcola BMR/TDEE con Mifflin-St Jeor e PAL dinamico.
4. Layer 3: applica priority tree `Safety -> Recovery -> Goal -> Performance`.
5. Layer 4: genera pasti settimanali da `recipes`.

## Criteri scientifici usati dal meal engine

- Stima metabolica Mifflin-St Jeor.
- Activity factor dinamico basato su allenamenti, intensita', durata e passi.
- Proteine per kg di peso in base all'obiettivo.
- Safety floor calorico: 1500 kcal uomo, 1200 kcal donna.
- Recovery override: se recovery compromessa, non spinge deficit aggressivi e aumenta supporto proteine/carboidrati.
- Ricette filtrate per dieta, allergeni, meal type e stagionalita'.
- Ricette ordinate per satiety score, nutrient density, processing level, glycemic index e recovery support.

## Output piano

`plan.mealStructure` contiene:

- `slots`: struttura giornaliera dei pasti con target kcal/macro per slot.
- `days`: 7 giorni con ricette selezionate, target, nutrienti reali, qualita' e fonte scientifica.
- `scientificBasis`: criteri applicati.

Ogni pasto contiene anche `scienceTrace`:

- `reasons`: motivi pratici della scelta.
- `scoringInputs`: valori usati per il punteggio.
- `source`: fonte/criterio scientifico collegato alla ricetta.
- `evidenceLevel`: livello evidenza dichiarato.

## Tipi pasto nel seed da 120 ricette

- 24 ricette base `breakfast`
- 24 ricette base `lunch`
- 24 ricette base `dinner`
- 20 ricette base `snack`
- 14 ricette base `pre_workout`
- 14 ricette base `post_workout`

Alcune ricette hanno tag multipli, per esempio `breakfast + post_workout`, `lunch + post_workout` o `pre_workout + snack`, cosi' il motore puo' usarle in modo flessibile.

Il seed copre:

- onnivoro
- vegetariano
- vegano
- pescetariano
- opzioni senza allergeni principali dichiarati
- allergeni/intolleranze comuni: `dairy`, `eggs`, `soy`, `gluten`, `fish`, `nuts`

## Cucina internazionale e metadata AI

Le ricette includono cucine:

- `italian`
- `mediterranean`
- `middle_eastern`
- `japanese`
- `mexican`
- `indian`
- `thai_vietnamese`
- `american_fitness`
- `nordic_european`
- `international`

Ogni ricetta include anche:

- `prep_time_minutes`
- `cost_level`
- `difficulty`
- `sodium_level`
- `added_sugar_level`
- `meal_goal_tags`
- `avoid_if`

Questi campi vengono riportati nel piano generato e usati nello scoring. In particolare, DUBI premia tag come `recovery`, `training_fuel`, `satiety`, `high_protein` e penalizza sodio/zuccheri/processamento quando non coerenti con l'obiettivo.

## Nota

Questa fase usa ancora il modello auth custom attuale (`users.id` integer) e salva il piano in `user_plans.plan_json`.
La migrazione verso Supabase Auth/UUID resta una decisione separata.
