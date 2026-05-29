# DUBI Backend

Node.js + Express + PostgreSQL backend for DUBI.

## Commands

```bash
npm start
npm run init-db
npm run seed-recipes
```

## Database Flow

- `supabase-schema.sql` is the single source of truth for the current database shape.
- `npm run init-db` applies `supabase-schema.sql` idempotently to `DATABASE_URL`.
- `npm run seed-recipes` inserts missing DUBI recipes. The current seed expects 150 recipes.

## Main AI Endpoints

```txt
GET  /api/ai/test
POST /api/ai/generate-plan
POST /api/ai/weight/log
POST /api/ai/anomaly/confirm
GET  /api/ai/plan/current
```

Authenticated endpoints require:

```txt
Authorization: Bearer <dubi_token>
```
