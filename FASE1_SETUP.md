# DUBI AI Engine - FASE 1 Setup

Questa versione riallinea il piano dello zip con il backend reale attuale.

## Scelte architetturali

- Auth: custom JWT esistente, con `public.users.id` integer.
- Piano AI FASE 1: salvato in `user_plans.plan_json`.
- Tabella `plans` UUID/Supabase Auth: non usata in questa fase per evitare una migrazione distruttiva.
- Supabase: lo schema in `supabase-schema.sql` e' idempotente, ma va rivisto prima di eseguirlo in produzione.

## Endpoint aggiunti

```txt
GET  /api/ai/test
POST /api/ai/generate-plan
GET  /api/ai/plan/current
```

`POST /api/ai/generate-plan` richiede:

```txt
Authorization: Bearer <dubi_token>
```

## Layer coperti

- Layer 0: acquisizione dati da `user_onboarding`, `wearable_data`, `weight_history`
- Layer 1: interpretazione base di HRV, sonno, attivita'
- Layer 2: metabolismo con Mifflin-St Jeor e PAL dinamico
- Layer 3 baseline: safety floor, goal adjustment, recovery override, weight stagnation

## Prossima fase

FASE 2 implementa Layer 4:

- `generateMeals()`
- `calculateMealStructure()`
- filtri ricette: dieta, allergeni, meal type, stagionalita'
- scoring qualita'
- distribuzione calorie e macro sui pasti

Vedi `FASE2_SUMMARY.md` per il riepilogo della logica.
