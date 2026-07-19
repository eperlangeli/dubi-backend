const assert = require('assert');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'training-route-test-secret';

const trainingRoutes = require('../routes/training');

const makePool = () => {
  const state = {
    weekPlans: new Map(),
    confirmations: new Map(),
    dailyPlanInvalidations: [],
    nextPlanId: 1,
    nextConfirmationId: 1
  };

  const key = (userId, date) => `${userId}:${date}`;

  return {
    state,
    async query(sql, params = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();

      if (normalized.startsWith('SELECT * FROM training_week_plans')) {
        const [userId, weekStart] = params;
        const row = state.weekPlans.get(key(userId, weekStart));
        return { rows: row ? [row] : [] };
      }

      if (normalized.startsWith('INSERT INTO training_week_plans')) {
        const [userId, weekStart, plannedDaysJson] = params;
        const row = {
          id: state.nextPlanId++,
          user_id: userId,
          week_start: weekStart,
          planned_days: JSON.parse(plannedDaysJson),
          source: 'user',
          created_at: new Date().toISOString()
        };
        state.weekPlans.set(key(userId, weekStart), row);
        return { rows: [row] };
      }

      if (normalized.startsWith('INSERT INTO training_confirmations')) {
        const [userId, day, planned, status, trainingTimeSlot, trainingSport = null] = params;
        const row = {
          id: state.nextConfirmationId++,
          user_id: userId,
          day,
          planned,
          status,
          training_time_slot: trainingTimeSlot,
          training_sport: trainingSport,
          answered_at: status === 'unconfirmed' ? null : new Date().toISOString(),
          detected_strain: null,
          detected_duration_min: null,
          detected_active_kcal: null
        };
        state.confirmations.set(key(userId, day), row);
        return { rows: [row] };
      }

      if (
        normalized.startsWith('SELECT * FROM training_confirmations')
        || normalized.startsWith('SELECT training_confirmations.*')
      ) {
        const [userId, day] = params;
        const row = state.confirmations.get(key(userId, day));
        return { rows: row ? [row] : [] };
      }

      if (normalized.startsWith('DELETE FROM daily_plans')) {
        const [userId, day] = params;
        state.dailyPlanInvalidations.push(key(userId, day));
        return { rows: [] };
      }

      throw new Error(`Unexpected query in training route test: ${normalized}`);
    }
  };
};

const requestJson = async (baseUrl, path, { method = 'GET', token, body } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const json = await response.json();
  return { status: response.status, json };
};

const main = async () => {
  const pool = makePool();
  const app = express();
  app.use(express.json());
  app.use('/api/training', trainingRoutes(pool));

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const token = jwt.sign({ userId: 42 }, process.env.JWT_SECRET);
    const today = new Date().toISOString().slice(0, 10);

    const weekBefore = await requestJson(baseUrl, '/api/training/week', { token });
    assert.strictEqual(weekBefore.status, 200);
    assert.strictEqual(weekBefore.json.ask_weekly, true);
    assert.strictEqual(weekBefore.json.plan, null);

    const weekSave = await requestJson(baseUrl, '/api/training/week', {
      method: 'POST',
      token,
      body: { planned_days: [today] }
    });
    assert.strictEqual(weekSave.status, 200);
    assert.strictEqual(weekSave.json.ask_weekly, false);
    assert.deepStrictEqual(weekSave.json.plan.planned_days, [today]);

    const confirm = await requestJson(baseUrl, '/api/training/day/confirm', {
      method: 'POST',
      token,
      body: { day: today, answer: 'yes', time_slot: 'morning_fasted', sport: 'running' }
    });
    assert.strictEqual(confirm.status, 200);
    assert.strictEqual(confirm.json.confirmation.status, 'confirmed_yes');
    assert.strictEqual(confirm.json.confirmation.planned, true);
    assert.strictEqual(confirm.json.confirmation.training_time_slot, 'morning_fasted');
    assert.strictEqual(confirm.json.confirmation.training_sport, 'running');
    assert(pool.state.dailyPlanInvalidations.includes(`42:${today}`));

    const invalidSlot = await requestJson(baseUrl, '/api/training/day/confirm', {
      method: 'POST',
      token,
      body: { day: today, answer: 'yes', time_slot: 'night_owl' }
    });
    assert.strictEqual(invalidSlot.status, 400);
    assert.strictEqual(invalidSlot.json.error, 'invalid_time_slot');

    const todayState = await requestJson(baseUrl, '/api/training/day/today', { token });
    assert.strictEqual(todayState.status, 200);
    assert.strictEqual(todayState.json.planned, true);
    assert.strictEqual(todayState.json.status, 'confirmed_yes');
    assert.strictEqual(todayState.json.training_time_slot, 'morning_fasted');
    assert.strictEqual(todayState.json.training_sport, 'running');

    console.log('training route endpoint tests passed');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
