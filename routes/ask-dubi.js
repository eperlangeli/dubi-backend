const express = require('express');

const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

const normalize = (value = '') => String(value)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim();

const safeText = (value, fallback = '') => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || fallback;
};

const mealLabels = {
  it: {
    colazione: 'colazione',
    snack_m: 'spuntino mattutino',
    pranzo: 'pranzo',
    snack: 'spuntino pomeridiano',
    cena: 'cena',
    snack_n: 'spuntino serale'
  },
  en: {
    colazione: 'breakfast',
    snack_m: 'morning snack',
    pranzo: 'lunch',
    snack: 'afternoon snack',
    cena: 'dinner',
    snack_n: 'evening snack'
  }
};

const getLang = (lang = 'it') => String(lang).startsWith('en') ? 'en' : 'it';

const detectMealId = (message = '') => {
  const text = normalize(message);
  if (/(colazione|breakfast)/.test(text)) return 'colazione';
  if (/(spuntino|snack|merenda).*(matt|morning)/.test(text)) return 'snack_m';
  if (/(spuntino|snack|merenda).*(pomer|poem|afternoon)|merenda/.test(text)) return 'snack';
  if (/(cena|stasera|sera|dinner|tonight|evening)/.test(text)) return 'cena';
  if (/(pranzo|lunch)/.test(text)) return 'pranzo';
  if (/(spuntino|snack)/.test(text)) return 'snack';
  return null;
};

const isGreetingOnly = (message = '') => {
  const text = normalize(message).replace(/[!?.,;:]/g, '').trim();
  return /^(ciao|hey|ei|buongiorno|buonasera|hello|hi|salve)$/.test(text);
};

const hasMealReplacementIntent = (message = '') => {
  const text = normalize(message);
  return /(non mi piace|non voglio|odio|stufo|stufa|cambia|cambiami|sostituisci|sostituire|swap|replace|alternativa|vorrei|voglio|mi va|preferirei|mangiare|mangiarmi).*(altro|altor|divers|camb|sostitu|alternativ|replace|swap)/.test(text)
    || /(altro|altor|divers).*(cena|pranzo|colazione|spuntino|pasto)/.test(text)
    || /(cena|pranzo|colazione|spuntino|pasto).*(altro|altor|divers)/.test(text);
};

const formatMacros = (macros = {}) => {
  const cal = Math.round(Number(macros.cal || macros.calories || 0));
  const p = Math.round(Number(macros.p || macros.protein || 0));
  const c = Math.round(Number(macros.c || macros.carbs || 0));
  const f = Math.round(Number(macros.f || macros.fats || 0));
  return `${cal} kcal, ${p}g P, ${c}g C, ${f}g G`;
};

const compactMeals = (todayMeals = []) => (Array.isArray(todayMeals) ? todayMeals : [])
  .slice(0, 8)
  .map((meal) => ({
    id: meal.id,
    label: meal.label || mealLabels.it[meal.id] || meal.id,
    time: meal.time || null,
    items: Array.isArray(meal.items) ? meal.items.slice(0, 8).map((item) => safeText(item)).filter(Boolean) : [],
    macros: meal.macros || meal.scaledMacros || null,
    why: safeText(meal.why || '', '').slice(0, 500)
  }));

const findMeal = (todayMeals, mealId) => compactMeals(todayMeals).find((meal) => meal.id === mealId) || null;

const buildGreetingAnswer = ({ userData = {}, lang = 'it' }) => {
  const l = getLang(lang);
  const name = safeText(userData.name || '').split(' ')[0];
  if (l === 'en') {
    return {
      title: name ? `Hi ${name}, I am here` : 'Hi, I am here',
      body: [
        'Ask me anything about your plan: why a meal is there, how to swap it, what to do if you eat out, or how DUBI generated your macros.',
        'If you want to change a meal, write it directly: for example “change my dinner” or “I want something else for lunch”.'
      ],
      source: 'DUBI assistant'
    };
  }
  return {
    title: name ? `Ciao ${name}, sono qui` : 'Ciao, sono qui',
    body: [
      'Puoi chiedermi qualsiasi cosa sul tuo piano: perche c’e un pasto, come sostituirlo, cosa fare se mangi fuori o come DUBI ha generato i macro.',
      'Se vuoi cambiare un pasto, scrivilo diretto: per esempio “cambiami la cena” oppure “voglio mangiare altro a pranzo”.'
    ],
    source: 'Assistente DUBI'
  };
};

const buildReplacementAnswer = ({ message, todayMeals = [], lang = 'it' }) => {
  const l = getLang(lang);
  const mealId = detectMealId(message) || 'cena';
  const label = (mealLabels[l] || mealLabels.it)[mealId] || mealId;
  const meal = findMeal(todayMeals, mealId);
  const current = meal?.items?.length ? meal.items.join(', ') : null;
  const macros = meal?.macros ? formatMacros(meal.macros) : null;

  if (l === 'en') {
    return {
      title: `Sure, I can change your ${label}`,
      body: [
        current ? `Current ${label}: ${current}${macros ? ` (${macros})` : ''}.` : `I understand: you want a different ${label}.`,
        'DUBI will replace the meal while keeping the same nutritional block, so the daily calories and macros stay aligned.',
        'If the replacement includes an ingredient that is not already in your shopping list, DUBI should remind you and ask whether to add it.'
      ],
      source: 'DUBI meal adaptation',
      planChange: {
        action: 'replace_meal',
        mealId,
        banner: `${label} replaced - macros preserved`,
        planNote: `DUBI will replace ${label} while preserving the original calorie and macro block.`,
        confirmLabel: `Yes, change ${label}`
      }
    };
  }

  return {
    title: `Certo, posso cambiare la ${label}`,
    body: [
      current ? `Pasto attuale: ${current}${macros ? ` (${macros})` : ''}.` : `Ho capito: vuoi un’alternativa per la ${label}.`,
      'DUBI sostituisce il pasto mantenendo lo stesso blocco nutrizionale, quindi calorie e macro della giornata restano allineati.',
      'Se l’alternativa contiene un ingrediente non presente nella lista della spesa, DUBI te lo deve ricordare e chiederti se vuoi aggiungerlo.'
    ],
    source: 'DUBI - adattamento pasto',
    planChange: {
      action: 'replace_meal',
      mealId,
      banner: `${label} sostituita - macro mantenuti`,
      planNote: `DUBI sostituisce la ${label} mantenendo il blocco originale di calorie e macronutrienti.`,
      confirmLabel: `Si, cambia la ${label}`
    }
  };
};

const buildLocalExplanationAnswer = ({ message, todayMeals = [], lang = 'it' }) => {
  const l = getLang(lang);
  const mealId = detectMealId(message);
  const meal = mealId ? findMeal(todayMeals, mealId) : null;
  const label = meal ? ((mealLabels[l] || mealLabels.it)[meal.id] || meal.id) : null;
  const text = normalize(message);
  const asksWhy = /(perche|come mai|motivo|logica|why|reason)/.test(text);
  const asksMacro = /(macro|calori|prote|carbo|grassi|piu|piu ricco|ricc|more|calorie)/.test(text);

  if (!meal || (!asksWhy && !asksMacro)) return null;

  if (l === 'en') {
    return {
      title: 'Here is the logic of that meal',
      body: [
        `${label}: ${meal.items.join(', ')}${meal.macros ? ` (${formatMacros(meal.macros)})` : ''}.`,
        'DUBI reads the meal by roles: protein source, main carbohydrate source, vegetables/fiber, fats and workout timing.',
        'If a meal feels too large, too small or repetitive, ask DUBI to swap it while keeping the same macro block.'
      ],
      source: 'DUBI meal audit'
    };
  }

  return {
    title: 'Ecco la logica di quel pasto',
    body: [
      `${label}: ${meal.items.join(', ')}${meal.macros ? ` (${formatMacros(meal.macros)})` : ''}.`,
      'DUBI legge il pasto per ruoli: fonte proteica, carboidrato principale, verdure/fibra, grassi e timing rispetto all’allenamento.',
      'Se un pasto ti sembra troppo grande, troppo piccolo o ripetitivo, chiedi a DUBI di sostituirlo mantenendo lo stesso blocco di macro.'
    ],
    source: 'DUBI - audit pasto'
  };
};

const buildDeterministicAnswer = (payload) => {
  if (isGreetingOnly(payload.message)) return buildGreetingAnswer(payload);
  if (hasMealReplacementIntent(payload.message)) return buildReplacementAnswer(payload);
  return buildLocalExplanationAnswer(payload);
};

const buildOpenAiMessages = ({ message, userData = {}, plan = {}, todayMeals = [], context = null, lang = 'it' }) => {
  const l = getLang(lang);
  const compactContext = {
    lang: l,
    user: {
      name: userData.name || null,
      goal: userData.goal || null,
      diet: userData.diet || null,
      allergies: userData.allergies || null,
      sport: userData.sport || null,
      trainingTime: userData.trainingTime || userData.training_time || null,
      workoutDays: userData.workoutDays || userData.workout_days || null,
      breakfastPref: userData.breakfastPref || userData.breakfast_pref || null
    },
    targets: {
      calories: plan.calories || plan.caloriesTarget || null,
      protein: plan.protein || plan.proteinTarget || null,
      carbs: plan.carbs || plan.carbsTarget || null,
      fat: plan.fat || plan.fatsTarget || null,
      mealCount: plan.mealCount || null
    },
    todayMeals: compactMeals(todayMeals),
    previousAnswer: context ? {
      title: context.title || null,
      body: Array.isArray(context.body) ? context.body.slice(0, 4) : [],
      addableItem: context.addableItem ? context.addableItem.label : null
    } : null
  };

  return [
    {
      role: 'system',
      content: [
        'You are Ask DUBI, the controlled nutrition and product assistant inside the DUBI app.',
        'Answer only about DUBI, the user plan, meals, ingredients, macros, training timing, wearable data usage, settings and app support.',
        'Use only the supplied context. If data is missing, say it is missing. Never invent biometric data, diagnoses, clinical prescriptions or exact provider data.',
        'Be practical, direct and agent-like. If the user clearly asks to change a meal, return a replace_meal planChange with the correct mealId.',
        'For replacements, do not invent a full recipe unless supplied. Explain that DUBI will preserve the original macro block.',
        'Keep health disclaimer light: DUBI is educational and does not replace a clinician.',
        'Return JSON only with this shape: {"title":string,"body":string[],"source":string,"intent":string,"needsClarification":boolean,"planChange":null|{"action":string,"mealId":string,"banner":string,"planNote":string,"confirmLabel":string}}.',
        'Allowed planChange actions: replace_meal, open_settings. Use replace_meal only for today meal swaps. Use open_settings for permanent changes like allergies, goal, diet or training schedule.',
        'Do not return generic filler like "this is a good question" when the meal or intent is clear.'
      ].join(' ')
    },
    {
      role: 'user',
      content: JSON.stringify({
        question: message,
        context: compactContext
      })
    }
  ];
};

const sanitizePlanChange = (planChange) => {
  if (!planChange || typeof planChange !== 'object') return null;
  const action = safeText(planChange.action);
  if (!['replace_meal', 'open_settings'].includes(action)) return null;
  const mealId = action === 'replace_meal' ? safeText(planChange.mealId || '').replace(/\s+/g, '_') : null;
  if (action === 'replace_meal' && !mealId) return null;
  return {
    action,
    mealId,
    banner: safeText(planChange.banner, action === 'replace_meal' ? 'Pasto sostituito - macro mantenuti' : 'Aggiorna impostazioni'),
    planNote: safeText(planChange.planNote, action === 'replace_meal' ? 'DUBI sostituisce il pasto mantenendo calorie e macronutrienti.' : 'Aggiorna il profilo per rigenerare il piano in modo corretto.'),
    confirmLabel: safeText(planChange.confirmLabel, action === 'replace_meal' ? 'Si, cambia questo pasto' : 'Apri impostazioni')
  };
};

const sanitizeAnswer = (answer, fallback) => {
  if (!answer || typeof answer !== 'object') return fallback || null;
  const body = Array.isArray(answer.body)
    ? answer.body.map((line) => safeText(line)).filter(Boolean).slice(0, 5)
    : [safeText(answer.body)].filter(Boolean);
  if (!body.length) return fallback || null;
  return {
    title: safeText(answer.title, fallback?.title || 'Risposta DUBI'),
    body,
    source: safeText(answer.source, fallback?.source || 'DUBI'),
    intent: safeText(answer.intent, fallback?.intent || 'answer'),
    needsClarification: Boolean(answer.needsClarification),
    planChange: sanitizePlanChange(answer.planChange) || fallback?.planChange || null
  };
};

const callOpenAi = async (payload) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 750,
      response_format: { type: 'json_object' },
      messages: buildOpenAiMessages(payload)
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI request failed ${response.status}: ${text.slice(0, 300)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) return null;
  return JSON.parse(content);
};

module.exports = (pool) => {
  const router = express.Router();
  const authModule = require('./auth')(pool);
  const { verifyToken } = authModule;

  router.post('/message', verifyToken, async (req, res) => {
    try {
      const payload = {
        message: safeText(req.body?.message),
        lang: req.body?.lang || 'it',
        userData: req.body?.userData || {},
        plan: req.body?.plan || {},
        todayMeals: req.body?.todayMeals || [],
        context: req.body?.context || null
      };

      if (!payload.message) return res.status(400).json({ error: 'Message required' });

      const deterministic = buildDeterministicAnswer(payload);
      if (deterministic?.planChange || isGreetingOnly(payload.message)) {
        return res.json({ success: true, mode: 'deterministic', answer: sanitizeAnswer(deterministic) });
      }

      try {
        const aiAnswer = await callOpenAi(payload);
        const answer = sanitizeAnswer(aiAnswer, deterministic);
        if (answer) return res.json({ success: true, mode: aiAnswer ? 'openai' : 'deterministic', answer });
      } catch (error) {
        console.error('Ask DUBI OpenAI fallback:', error.message);
      }

      if (deterministic) return res.json({ success: true, mode: 'deterministic', answer: sanitizeAnswer(deterministic) });

      const l = getLang(payload.lang);
      const fallback = l === 'en'
        ? {
          title: 'Tell me one more detail',
          body: ['I can help with your DUBI plan, meals, macros, ingredients, wearable data and app settings.', 'Tell me which meal or ingredient you mean and I will answer with the plan context.'],
          source: 'DUBI assistant'
        }
        : {
          title: 'Dimmi un dettaglio in piu',
          body: ['Posso aiutarti su piano DUBI, pasti, macro, ingredienti, dati wearable e impostazioni.', 'Indicami quale pasto o ingrediente intendi e ti rispondo usando il contesto del piano.'],
          source: 'Assistente DUBI'
        };
      return res.json({ success: true, mode: 'fallback', answer: fallback });
    } catch (error) {
      console.error('Ask DUBI message error:', error);
      res.status(500).json({ error: 'Ask DUBI failed' });
    }
  });

  return router;
};
