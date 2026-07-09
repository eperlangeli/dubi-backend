// DUBI v1.2 training adaptation placeholders.
// Values are provisional and da validare col nutrizionista before Phase 2 meal-regeneration logic.

const TRAINING_ADAPTATION = Object.freeze({
  carbohydrates: Object.freeze({
    missedTrainingReductionPercent: Object.freeze({ min: 15, max: 20 })
  }),
  calories: Object.freeze({
    trainingDayIncreaseKcal: Object.freeze({ min: 200, max: 300 }),
    missedTrainingReductionKcal: Object.freeze({ min: 200, max: 300 })
  })
});

module.exports = {
  TRAINING_ADAPTATION
};
