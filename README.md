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
GET  /api/wearables/providers
POST /api/wearables/openwearables/user
POST /api/wearables/openwearables/authorize
POST /api/wearables/openwearables/sync
POST /api/wearables/openwearables/import-recovery
GET  /api/wearables/openwearables/status
```

Authenticated endpoints require:

```txt
Authorization: Bearer <dubi_token>
```

## OpenWearables

Server-side configuration:

```txt
OPENWEARABLES_BASE_URL=https://api.openwearables.io/api/v1
OPENWEARABLES_API_KEY=...
OPENWEARABLES_REDIRECT_URI=https://dubi-frontend.onrender.com
```

Flow:

1. `POST /api/wearables/openwearables/user` maps the DUBI user to an OpenWearables user.
2. `POST /api/wearables/openwearables/authorize` returns the provider OAuth URL.
3. `POST /api/wearables/openwearables/sync` requests provider sync.
4. `POST /api/wearables/openwearables/import-recovery` imports recovery, sleep, HRV, and resting heart rate into `wearable_data`.
