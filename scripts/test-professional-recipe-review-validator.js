const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  constants,
  loadCanonicalRecords,
  recordsToCsv,
  validateRecords,
} = require('./validate-professional-recipe-review');

const canonical = loadCanonicalRecords();

function cloneRecords() {
  return canonical.map((record) => ({ ...record }));
}

function writeTempReview(records, extension = 'csv') {
  const filePath = path.join(os.tmpdir(), `dubi-professional-review-${process.pid}-${Math.random().toString(16).slice(2)}.${extension}`);
  if (extension === 'csv') {
    fs.writeFileSync(filePath, recordsToCsv(records), 'utf8');
  } else {
    fs.writeFileSync(filePath, JSON.stringify({ records }, null, 2), 'utf8');
  }
  return filePath;
}

function firstByMealType(mealType) {
  const record = canonical.find((item) => item.meal_type === mealType);
  assert(record, `Missing canonical fixture for meal type ${mealType}`);
  return record.authoring_key;
}

function findRecord(records, authoringKey) {
  const record = records.find((item) => item.authoring_key === authoringKey);
  assert(record, `Missing fixture record ${authoringKey}`);
  return record;
}

function markReviewed(record, {
  nutrition = 'APPROVED',
  portion = 'APPROVED',
  workout = '',
  finalStatus = 'APPROVED',
  nutritionNotes = '',
  portionNotes = '',
  workoutNotes = '',
} = {}) {
  record.nutrition_review_decision = nutrition;
  record.nutrition_review_notes = nutritionNotes;
  record.portion_review_decision = portion;
  record.portion_review_notes = portionNotes;
  record.workout_timing_review_decision = workout;
  record.workout_timing_review_notes = workoutNotes;
  record.nutrition_reviewer_name = 'Reviewer Fixture';
  record.nutrition_reviewed_at = '2026-08-24';
  record.final_nutrition_status = finalStatus;
}

function assertError(report, code) {
  assert.strictEqual(report.valid, false, `Expected invalid report for ${code}`);
  assert(
    report.errors.some((error) => error.code === code),
    `Expected error ${code}, got ${JSON.stringify(report.errors, null, 2)}`
  );
}

{
  const report = validateRecords(cloneRecords());
  assert.strictEqual(report.valid, true, JSON.stringify(report.errors, null, 2));
  assert.strictEqual(report.complete, false);
  assert.strictEqual(report.summary.total_recipes, 130);
  assert.strictEqual(report.summary.pending, 130);
  assert.strictEqual(report.summary.unreviewed_count, 130);
}

{
  const records = cloneRecords();
  const normal = findRecord(records, firstByMealType('breakfast'));
  markReviewed(normal, { workout: 'NOT_APPLICABLE' });
  const report = validateRecords(records);
  assert.strictEqual(report.valid, true, JSON.stringify(report.errors, null, 2));
  assert.strictEqual(report.summary.approved, 1);
  assert.strictEqual(report.summary.fully_reviewed_count, 1);
}

{
  const records = cloneRecords();
  const item = findRecord(records, firstByMealType('snack'));
  markReviewed(item, {
    nutrition: 'APPROVED_WITH_CHANGES',
    nutritionNotes: '',
    finalStatus: 'CHANGES_REQUIRED',
  });
  assertError(validateRecords(records), constants.ERROR_CODES.REQUIRED_NOTES_MISSING);
}

{
  const records = cloneRecords();
  const item = findRecord(records, firstByMealType('lunch/dinner'));
  markReviewed(item, {
    nutrition: 'REJECTED',
    nutritionNotes: '',
    finalStatus: 'REJECTED',
  });
  assertError(validateRecords(records), constants.ERROR_CODES.REQUIRED_NOTES_MISSING);
}

{
  const records = cloneRecords();
  const item = findRecord(records, firstByMealType('breakfast'));
  markReviewed(item, {
    nutrition: 'APPROVED',
    portion: '',
    workout: 'NOT_APPLICABLE',
    finalStatus: 'APPROVED',
  });
  assertError(validateRecords(records), constants.ERROR_CODES.FINAL_STATUS_INCONSISTENT);
}

{
  const records = cloneRecords();
  records[0].calories = String(Number(records[0].calories) + 1);
  assertError(validateRecords(records), constants.ERROR_CODES.CANONICAL_REVIEW_DATA_CHANGED);
}

{
  const records = cloneRecords();
  delete records[0].authoring_key;
  const report = validateRecords(records);
  assertError(report, constants.ERROR_CODES.MISSING_AUTHORING_KEY);
  assert(report.errors.some((error) => error.code === constants.ERROR_CODES.MISSING_RECIPE));
}

{
  const records = cloneRecords();
  records[1].authoring_key = records[0].authoring_key;
  assertError(validateRecords(records), constants.ERROR_CODES.DUPLICATE_AUTHORING_KEY);
}

{
  const records = cloneRecords();
  const item = findRecord(records, firstByMealType('breakfast'));
  item.nutrition_review_decision = 'APPROVED';
  item.portion_review_decision = 'APPROVED';
  item.workout_timing_review_decision = 'NOT_APPLICABLE';
  item.final_nutrition_status = 'APPROVED';
  item.nutrition_reviewed_at = '2026-08-24';
  assertError(validateRecords(records), constants.ERROR_CODES.REVIEWER_NAME_MISSING);
}

{
  const records = cloneRecords();
  const item = findRecord(records, firstByMealType('pre_workout'));
  markReviewed(item, {
    nutrition: 'APPROVED',
    portion: 'APPROVED',
    workout: 'NOT_APPLICABLE',
    finalStatus: 'PENDING',
  });
  const report = validateRecords(records);
  assert.strictEqual(report.valid, true, JSON.stringify(report.errors, null, 2));
  assert(
    report.warnings.some((warning) => warning.code === constants.WARNING_CODES.WORKOUT_NOT_APPLICABLE_ON_WORKOUT_RECIPE),
    `Expected workout warning, got ${JSON.stringify(report.warnings, null, 2)}`
  );
}

{
  const records = cloneRecords();
  const item = findRecord(records, firstByMealType('snack'));
  markReviewed(item, {
    nutrition: 'APPROVED_WITH_CHANGES',
    nutritionNotes: 'Adjust serving size before import.',
    finalStatus: 'CHANGES_REQUIRED',
  });
  const report = validateRecords(records);
  assert.strictEqual(report.valid, true, JSON.stringify(report.errors, null, 2));
  assert.strictEqual(report.change_requests.length, 1);
  assert.strictEqual(report.change_requests[0].authoring_key, item.authoring_key);
}

{
  const records = cloneRecords();
  const filePath = writeTempReview(records, 'csv');
  try {
    const result = spawnSync(process.execPath, [
      path.join(__dirname, 'validate-professional-recipe-review.js'),
      '--json',
      filePath,
    ], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, `Expected CLI exit 0\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.strictEqual(report.valid, true);
    assert.strictEqual(report.summary.total_recipes, 130);
  } finally {
    fs.rmSync(filePath, { force: true });
  }
}

console.log('professional recipe review validator tests passed');
