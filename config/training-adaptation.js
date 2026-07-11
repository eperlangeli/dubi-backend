// DUBI v1.2 training + biometric adaptation.
// Values are provisional and da validare col nutrizionista before production-grade
// clinical/nutritionist sign-off. Keep every rule conservative and explainable.

const TRAINING_ADAPTATION = Object.freeze({
  version: 'daily-biometric-adaptation-v1',
  scienceBasis: Object.freeze([
    Object.freeze({
      id: 'acsm-and-dc-2016',
      label: 'Thomas, Erdman & Burke: Nutrition and Athletic Performance (2016)',
      principle: 'Energy and carbohydrate needs should be periodized around daily training load and individualized.'
    }),
    Object.freeze({
      id: 'issn-protein-2017',
      label: 'ISSN Position Stand: Protein and Exercise (2017)',
      principle: 'Most exercising people need roughly 1.4-2.0 g/kg/day protein; per-meal distribution matters.'
    }),
    Object.freeze({
      id: 'burke-2011-carb-loading',
      label: 'Burke et al.: Carbohydrate loading for endurance athletes (2011)',
      principle: 'Endurance fueling should prioritize carbohydrate availability around demanding sessions and competition.'
    }),
    Object.freeze({
      id: 'ioc-maughan-2018',
      label: 'IOC Consensus / Maughan et al. (2018)',
      principle: 'Competition nutrition and supplementation require evidence-based, sport-specific decision making.'
    }),
    Object.freeze({
      id: 'antonio-jissn-2021',
      label: 'Antonio et al., JISSN (2021)',
      principle: 'Sports supplementation should be food-first, evidence-ranked and goal-specific.'
    }),
    Object.freeze({
      id: 'impey-fuel-work-required',
      label: 'Impey et al.: Fuel for the Work Required',
      principle: 'Carbohydrate availability can be periodized according to the purpose and intensity of the session.'
    }),
    Object.freeze({
      id: 'ivy-portman-nutrient-timing',
      label: 'Ivy & Portman: Nutrient Timing',
      principle: 'Nutrient timing around training can support recovery when total daily intake is adequate.'
    }),
    Object.freeze({
      id: 'fullagar-2015-sleep-recovery',
      label: 'Fullagar et al. (2015): Sleep and athletic performance',
      principle: 'Sleep and recovery signals should influence fueling/recovery guidance conservatively.'
    }),
    Object.freeze({
      id: 'ioc-reds-2023',
      label: 'IOC REDs Consensus Statement (2023)',
      principle: 'Avoid aggressive energy restriction when training/recovery signals suggest low energy availability risk.'
    }),
    Object.freeze({
      id: 'sleep-athlete-consensus-2021',
      label: 'Sleep and the Athlete expert consensus (2021)',
      principle: 'Sleep and recovery signals should modulate training-day fueling conservatively, not trigger extreme cuts.'
    })
  ]),
  carbohydrates: Object.freeze({
    missedTrainingReductionPercent: Object.freeze({ min: 15, max: 20 }),
    plannedTrainingIncreaseG: Object.freeze({ min: 35, max: 60 }),
    detectedTrainingIncreaseG: Object.freeze({ min: 45, max: 75 }),
    highActivityIncreaseG: Object.freeze({ min: 25, max: 55 }),
    lowActivityReductionG: Object.freeze({ min: 15, max: 35 }),
    recoverySupportIncreaseG: Object.freeze({ min: 15, max: 35 })
  }),
  calories: Object.freeze({
    trainingDayIncreaseKcal: Object.freeze({ min: 200, max: 300 }),
    missedTrainingReductionKcal: Object.freeze({ min: 200, max: 300 }),
    highActivityIncreaseKcal: Object.freeze({ min: 120, max: 250 }),
    lowActivityReductionKcal: Object.freeze({ min: 80, max: 160 }),
    recoverySupportKcal: Object.freeze({ min: 80, max: 180 })
  }),
  wearableThresholds: Object.freeze({
    minDaysForTrend: 3,
    lowSteps: 4000,
    highSteps: 10000,
    veryHighSteps: 14000,
    highActivityKcal: 550,
    veryHighActivityKcal: 850,
    poorSleepHours: 6,
    goodSleepHours: 7,
    lowRecoveryScore: 50,
    goodRecoveryScore: 70,
    meaningfulHrvDropPercent: -10
  }),
  guardrails: Object.freeze({
    minProteinPerKg: 1.4,
    recoveryProteinPerKg: 1.6,
    fatFloorG: 30,
    minCarbsG: 80,
    minCaloriesBySex: Object.freeze({
      male: 1500,
      female: 1200,
      unknown: 1200
    }),
    minCaloriesBmrMultiplier: 0.9,
    maxDailyKcalIncrease: 350,
    maxDailyKcalReduction: 300,
    maxDailyCarbIncreaseG: 90,
    maxDailyCarbReductionG: 70
  }),
  goalDamping: Object.freeze({
    fat_loss: 0.7,
    cut: 0.75,
    definition: 0.75,
    maintain: 1,
    muscle_gain: 1,
    lean_bulk: 1
  })
});

module.exports = {
  TRAINING_ADAPTATION
};
