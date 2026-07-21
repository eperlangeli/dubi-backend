require('dotenv').config();

const { Pool } = require('pg');

const apply = process.argv.includes('--apply');

const cleanKey = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase()
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ');

const fromMap = (value, map, fallback = '') => {
  const key = cleanKey(value);
  return map[key] || fallback || key;
};

const maps = {
  goal: {
    fatloss: 'fat_loss',
    'fat loss': 'fat_loss',
    dimagrimento: 'fat_loss',
    gain: 'muscle_gain',
    'muscle gain': 'muscle_gain',
    massa: 'muscle_gain',
    'aumento muscolare': 'muscle_gain',
    maintain: 'maintenance',
    maintenance: 'maintenance',
    mantenimento: 'maintenance',
    definition: 'definition',
    definizione: 'definition'
  },
  diet: {
    onnivoro: 'omnivore',
    omnivore: 'omnivore',
    pescetariano: 'pescatarian',
    pescatarian: 'pescatarian',
    vegetariano: 'vegetarian',
    vegetarian: 'vegetarian',
    vegano: 'vegan',
    vegan: 'vegan'
  },
  intensity: {
    leggera: 'low',
    bassa: 'low',
    light: 'low',
    low: 'low',
    moderata: 'moderate',
    moderate: 'moderate',
    alta: 'high',
    high: 'high'
  },
  breakfast: {
    dolce: 'sweet',
    sweet: 'sweet',
    salata: 'savory',
    salato: 'savory',
    savory: 'savory',
    entrambi: 'both',
    both: 'both',
    none: 'none'
  },
  training: {
    mattina: 'morning_fasted',
    morning: 'morning_fasted',
    pranzo: 'afternoon',
    lunch: 'afternoon',
    pomeriggio: 'afternoon',
    afternoon: 'afternoon',
    sera: 'evening',
    evening: 'evening',
    varia: 'varies',
    varies: 'varies',
    variable: 'varies'
  },
  sport: {
    palestra: 'gym',
    gym: 'gym',
    corsa: 'running',
    running: 'running',
    ciclismo: 'cycling',
    cycling: 'cycling',
    nuoto: 'swimming',
    swimming: 'swimming',
    calcio: 'football',
    football: 'football',
    soccer: 'football',
    yoga: 'yoga',
    crossfit: 'crossfit',
    tennis: 'tennis',
    altro: 'other',
    other: 'other'
  },
  allergy: {
    uovo: 'egg',
    uova: 'egg',
    egg: 'egg',
    eggs: 'egg',
    glutine: 'gluten',
    gluten: 'gluten',
    celiaco: 'gluten',
    celiachia: 'gluten',
    latte: 'dairy',
    lattosio: 'dairy',
    dairy: 'dairy',
    milk: 'dairy',
    'frutta secca': 'nuts',
    noci: 'nuts',
    mandorle: 'nuts',
    arachidi: 'nuts',
    nuts: 'nuts',
    crostacei: 'shellfish',
    gamberi: 'shellfish',
    shellfish: 'shellfish',
    soia: 'soy',
    soy: 'soy',
    sesamo: 'sesame',
    sesame: 'sesame',
    pesce: 'fish',
    fish: 'fish'
  }
};

const canonicalList = (value) => {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[,;\n]+/);
  return [...new Set(raw
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .map((item) => fromMap(item, maps.allergy, cleanKey(item)))
    .filter(Boolean))].join(', ');
};

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    const { rows } = await pool.query(`
      SELECT user_id, goal, diet, workout_intensity, allergies, sport, training_time, breakfast_pref
      FROM user_onboarding
    `);

    let changed = 0;

    for (const row of rows) {
      const next = {
        goal: fromMap(row.goal, maps.goal, 'maintenance'),
        diet: fromMap(row.diet, maps.diet, 'omnivore'),
        workout_intensity: fromMap(row.workout_intensity, maps.intensity, 'moderate'),
        allergies: canonicalList(row.allergies),
        sport: fromMap(row.sport, maps.sport, cleanKey(row.sport)),
        training_time: fromMap(row.training_time, maps.training, 'varies'),
        breakfast_pref: fromMap(row.breakfast_pref, maps.breakfast, 'both')
      };

      const isChanged = Object.keys(next).some((key) => String(row[key] || '') !== String(next[key] || ''));
      if (!isChanged) continue;

      changed += 1;
      console.log(`${apply ? 'UPDATE' : 'DRY'} ${row.user_id}`, {
        from: row,
        to: next
      });

      if (apply) {
        await pool.query(`
          UPDATE user_onboarding
          SET goal = $2,
              diet = $3,
              workout_intensity = $4,
              allergies = $5,
              sport = $6,
              training_time = $7,
              breakfast_pref = $8,
              updated_at = CURRENT_TIMESTAMP
          WHERE user_id = $1
        `, [
          row.user_id,
          next.goal,
          next.diet,
          next.workout_intensity,
          next.allergies,
          next.sport,
          next.training_time,
          next.breakfast_pref
        ]);
      }
    }

    console.log(`${apply ? 'Applied' : 'Dry run'} complete. Profiles needing changes: ${changed}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
