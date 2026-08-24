const fs = require('fs');
const path = require('path');

const CANONICAL_CSV_PATH = path.join(__dirname, '..', 'data', 'review-packs', 'recipe-nutrition-review-v1.csv');

const SOURCE_FIELDS = Object.freeze([
  'authoring_key',
  'recipe_name',
  'meal_type',
  'recipe_format',
  'cuisine_family',
  'difficulty',
  'prep_time_min',
  'cook_time_min',
  'ingredient_ids',
  'ingredient_summary',
  'calories',
  'protein_g',
  'carbs_g',
  'fat_g',
  'fiber_g',
  'ingredient_count',
  'measurement_basis_status',
  'serving_bounds_status',
  'serving_step_review_count',
  'meal_timing_review_count',
]);

const PROFESSIONAL_FIELDS = Object.freeze([
  'nutrition_review_decision',
  'nutrition_review_notes',
  'nutrition_reviewer_name',
  'nutrition_reviewed_at',
  'portion_review_decision',
  'portion_review_notes',
  'workout_timing_review_decision',
  'workout_timing_review_notes',
  'final_nutrition_status',
]);

const REVIEW_FIELDS = Object.freeze([...SOURCE_FIELDS, ...PROFESSIONAL_FIELDS]);
const NUTRITION_DECISIONS = Object.freeze(['', 'APPROVED', 'APPROVED_WITH_CHANGES', 'REJECTED']);
const WORKOUT_DECISIONS = Object.freeze(['', 'APPROVED', 'APPROVED_WITH_CHANGES', 'REJECTED', 'NOT_APPLICABLE']);
const FINAL_STATUSES = Object.freeze(['PENDING', 'APPROVED', 'CHANGES_REQUIRED', 'REJECTED']);
const WORKOUT_MEAL_TYPES = Object.freeze(['pre_workout', 'post_workout']);

const ERROR_CODES = Object.freeze({
  CANONICAL_REVIEW_DATA_CHANGED: 'CANONICAL_REVIEW_DATA_CHANGED',
  DUPLICATE_AUTHORING_KEY: 'DUPLICATE_AUTHORING_KEY',
  FINAL_STATUS_INCONSISTENT: 'FINAL_STATUS_INCONSISTENT',
  INVALID_DECISION_VALUE: 'INVALID_DECISION_VALUE',
  MISSING_AUTHORING_KEY: 'MISSING_AUTHORING_KEY',
  MISSING_RECIPE: 'MISSING_RECIPE',
  EXTRA_RECIPE: 'EXTRA_RECIPE',
  REQUIRED_NOTES_MISSING: 'REQUIRED_NOTES_MISSING',
  REVIEWER_NAME_MISSING: 'REVIEWER_NAME_MISSING',
  REVIEWED_AT_MISSING: 'REVIEWED_AT_MISSING',
  REVIEW_FILE_FORMAT_ERROR: 'REVIEW_FILE_FORMAT_ERROR',
});

const WARNING_CODES = Object.freeze({
  WORKOUT_NOT_APPLICABLE_ON_WORKOUT_RECIPE: 'WORKOUT_NOT_APPLICABLE_ON_WORKOUT_RECIPE',
});

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map((header) => header.replace(/^\uFEFF/, ''));
  return rows.slice(1)
    .filter((values) => values.some((value) => value !== ''))
    .map((values) => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = values[index] ?? '';
      });
      return record;
    });
}

function csvEscape(value) {
  const text = value === undefined || value === null ? '' : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function recordsToCsv(records) {
  return [
    REVIEW_FIELDS.join(','),
    ...records.map((record) => REVIEW_FIELDS.map((field) => csvEscape(record[field])).join(',')),
  ].join('\n');
}

function normalizeReviewRecord(record) {
  const normalized = {};
  REVIEW_FIELDS.forEach((field) => {
    normalized[field] = record[field] === undefined || record[field] === null
      ? ''
      : String(record[field]).trim();
  });
  return normalized;
}

function normalizeJsonInput(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.records)) return parsed.records;
  return null;
}

function loadReviewFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const raw = fs.readFileSync(filePath, 'utf8');

  if (extension === '.csv') {
    return parseCsv(raw).map(normalizeReviewRecord);
  }

  if (extension === '.json') {
    const records = normalizeJsonInput(JSON.parse(raw));
    if (!records) {
      throw new Error('JSON review file must be an array or an object with a records array');
    }
    return records.map(normalizeReviewRecord);
  }

  throw new Error('Supported review return formats: .csv, .json');
}

function loadCanonicalRecords() {
  return parseCsv(fs.readFileSync(CANONICAL_CSV_PATH, 'utf8')).map(normalizeReviewRecord);
}

function makeIssue(code, authoringKey, message, details = {}) {
  return {
    code,
    authoring_key: authoringKey || null,
    message,
    ...details,
  };
}

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function parseableDate(value) {
  if (isBlank(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time);
}

function isWorkoutMeal(record) {
  return WORKOUT_MEAL_TYPES.includes(record.meal_type);
}

function validateDecisionValue(record, field, allowed, errors, counters) {
  if (!allowed.includes(record[field])) {
    counters.invalid_decision_values += 1;
    errors.push(makeIssue(
      ERROR_CODES.INVALID_DECISION_VALUE,
      record.authoring_key,
      `${field} has invalid value ${JSON.stringify(record[field])}`,
      { field, value: record[field] }
    ));
  }
}

function validateRequiredNotes(record, decisionField, notesField, errors, counters) {
  const decision = record[decisionField];
  if ((decision === 'APPROVED_WITH_CHANGES' || decision === 'REJECTED') && isBlank(record[notesField])) {
    counters.required_notes_missing += 1;
    errors.push(makeIssue(
      ERROR_CODES.REQUIRED_NOTES_MISSING,
      record.authoring_key,
      `${notesField} is required when ${decisionField} is ${decision}`,
      { decision_field: decisionField, notes_field: notesField }
    ));
  }
}

function hasAnyProfessionalDecision(record) {
  return !isBlank(record.nutrition_review_decision)
    || !isBlank(record.portion_review_decision)
    || !isBlank(record.workout_timing_review_decision)
    || record.final_nutrition_status !== 'PENDING';
}

function validateReviewerIdentity(record, errors, counters) {
  if (!hasAnyProfessionalDecision(record)) return;

  if (isBlank(record.nutrition_reviewer_name)) {
    counters.reviewer_name_missing += 1;
    errors.push(makeIssue(
      ERROR_CODES.REVIEWER_NAME_MISSING,
      record.authoring_key,
      'nutrition_reviewer_name is required when any professional decision is nonblank'
    ));
  }

  if (!parseableDate(record.nutrition_reviewed_at)) {
    counters.reviewed_at_missing += 1;
    errors.push(makeIssue(
      ERROR_CODES.REVIEWED_AT_MISSING,
      record.authoring_key,
      'nutrition_reviewed_at must be present and parseable when any professional decision is nonblank'
    ));
  }
}

function validateFinalStatus(record, errors, counters) {
  const nutrition = record.nutrition_review_decision;
  const portion = record.portion_review_decision;
  const workout = record.workout_timing_review_decision;
  const finalStatus = record.final_nutrition_status;
  let inconsistent = false;
  let message = '';

  if (finalStatus === 'APPROVED') {
    const workoutOk = isWorkoutMeal(record)
      ? workout === 'APPROVED'
      : workout === '' || workout === 'NOT_APPLICABLE';
    inconsistent = nutrition !== 'APPROVED' || portion !== 'APPROVED' || !workoutOk;
    message = 'APPROVED final status requires approved component decisions';
  } else if (finalStatus === 'CHANGES_REQUIRED') {
    inconsistent = ![nutrition, portion, workout].includes('APPROVED_WITH_CHANGES');
    message = 'CHANGES_REQUIRED final status requires at least one APPROVED_WITH_CHANGES decision';
  } else if (finalStatus === 'REJECTED') {
    inconsistent = ![nutrition, portion, workout].includes('REJECTED');
    message = 'REJECTED final status requires at least one REJECTED decision';
  }

  if (inconsistent) {
    counters.final_status_inconsistencies += 1;
    errors.push(makeIssue(
      ERROR_CODES.FINAL_STATUS_INCONSISTENT,
      record.authoring_key,
      message,
      { final_nutrition_status: finalStatus }
    ));
  }
}

function compareCanonicalData(returnedRecords, canonicalRecords, errors, counters) {
  const canonicalByKey = new Map(canonicalRecords.map((record) => [record.authoring_key, record]));
  const returnedByKey = new Map();
  const seenKeys = new Set();

  returnedRecords.forEach((record, index) => {
    if (isBlank(record.authoring_key)) {
      errors.push(makeIssue(
        ERROR_CODES.MISSING_AUTHORING_KEY,
        null,
        `record[${index}] is missing authoring_key`
      ));
      return;
    }

    if (seenKeys.has(record.authoring_key)) {
      errors.push(makeIssue(
        ERROR_CODES.DUPLICATE_AUTHORING_KEY,
        record.authoring_key,
        `duplicate authoring_key ${JSON.stringify(record.authoring_key)}`
      ));
      return;
    }

    seenKeys.add(record.authoring_key);
    returnedByKey.set(record.authoring_key, record);
  });

  canonicalByKey.forEach((canonical, key) => {
    if (!returnedByKey.has(key)) {
      errors.push(makeIssue(ERROR_CODES.MISSING_RECIPE, key, 'canonical recipe is missing from returned review file'));
    }
  });

  returnedByKey.forEach((record, key) => {
    const canonical = canonicalByKey.get(key);
    if (!canonical) {
      errors.push(makeIssue(ERROR_CODES.EXTRA_RECIPE, key, 'returned review file contains a recipe outside the canonical review corpus'));
      return;
    }

    SOURCE_FIELDS.forEach((field) => {
      if (record[field] !== canonical[field]) {
        counters.canonical_data_changes += 1;
        errors.push(makeIssue(
          ERROR_CODES.CANONICAL_REVIEW_DATA_CHANGED,
          key,
          `${field} changed from canonical review data`,
          { field, canonical_value: canonical[field], returned_value: record[field] }
        ));
      }
    });
  });
}

function validateProfessionalFields(record, errors, warnings, counters) {
  validateDecisionValue(record, 'nutrition_review_decision', NUTRITION_DECISIONS, errors, counters);
  validateDecisionValue(record, 'portion_review_decision', NUTRITION_DECISIONS, errors, counters);
  validateDecisionValue(record, 'workout_timing_review_decision', WORKOUT_DECISIONS, errors, counters);
  validateDecisionValue(record, 'final_nutrition_status', FINAL_STATUSES, errors, counters);

  validateRequiredNotes(record, 'nutrition_review_decision', 'nutrition_review_notes', errors, counters);
  validateRequiredNotes(record, 'portion_review_decision', 'portion_review_notes', errors, counters);
  validateRequiredNotes(record, 'workout_timing_review_decision', 'workout_timing_review_notes', errors, counters);

  if (isWorkoutMeal(record) && record.workout_timing_review_decision === 'NOT_APPLICABLE') {
    warnings.push(makeIssue(
      WARNING_CODES.WORKOUT_NOT_APPLICABLE_ON_WORKOUT_RECIPE,
      record.authoring_key,
      'pre_workout/post_workout recipe has workout timing decision NOT_APPLICABLE'
    ));
  }

  validateReviewerIdentity(record, errors, counters);
  validateFinalStatus(record, errors, counters);
}

function statusSummary(records) {
  const counts = {
    pending: 0,
    approved: 0,
    changes_required: 0,
    rejected: 0,
    fully_reviewed_count: 0,
    partially_reviewed_count: 0,
    unreviewed_count: 0,
    nutrition_decision_missing: 0,
    portion_decision_missing: 0,
    workout_decision_missing_where_required: 0,
  };

  records.forEach((record) => {
    if (record.final_nutrition_status === 'PENDING') counts.pending += 1;
    if (record.final_nutrition_status === 'APPROVED') counts.approved += 1;
    if (record.final_nutrition_status === 'CHANGES_REQUIRED') counts.changes_required += 1;
    if (record.final_nutrition_status === 'REJECTED') counts.rejected += 1;

    if (isBlank(record.nutrition_review_decision)) counts.nutrition_decision_missing += 1;
    if (isBlank(record.portion_review_decision)) counts.portion_decision_missing += 1;
    if (isWorkoutMeal(record) && isBlank(record.workout_timing_review_decision)) {
      counts.workout_decision_missing_where_required += 1;
    }

    const requiredDecisions = [
      record.nutrition_review_decision,
      record.portion_review_decision,
      ...(isWorkoutMeal(record) ? [record.workout_timing_review_decision] : []),
    ];
    const anyComponentDecision = requiredDecisions.some((decision) => !isBlank(decision));
    const allRequiredDecisions = requiredDecisions.every((decision) => !isBlank(decision));
    const hasReviewer = !isBlank(record.nutrition_reviewer_name) && parseableDate(record.nutrition_reviewed_at);

    if (allRequiredDecisions && hasReviewer && record.final_nutrition_status !== 'PENDING') {
      counts.fully_reviewed_count += 1;
    } else if (anyComponentDecision || record.final_nutrition_status !== 'PENDING') {
      counts.partially_reviewed_count += 1;
    } else {
      counts.unreviewed_count += 1;
    }
  });

  return counts;
}

function extractChangeRequests(records) {
  return records
    .filter((record) => record.final_nutrition_status === 'CHANGES_REQUIRED'
      || record.nutrition_review_decision === 'APPROVED_WITH_CHANGES'
      || record.portion_review_decision === 'APPROVED_WITH_CHANGES'
      || record.workout_timing_review_decision === 'APPROVED_WITH_CHANGES')
    .map((record) => ({
      authoring_key: record.authoring_key,
      recipe_name: record.recipe_name,
      nutrition_review_notes: record.nutrition_review_notes,
      portion_review_notes: record.portion_review_notes,
      workout_timing_review_notes: record.workout_timing_review_notes,
    }));
}

function validateRecords(returnedRecords, options = {}) {
  const canonicalRecords = options.canonicalRecords || loadCanonicalRecords();
  const records = returnedRecords.map(normalizeReviewRecord);
  const errors = [];
  const warnings = [];
  const counters = {
    reviewer_name_missing: 0,
    reviewed_at_missing: 0,
    required_notes_missing: 0,
    canonical_data_changes: 0,
    invalid_decision_values: 0,
    final_status_inconsistencies: 0,
  };

  if (records.length !== canonicalRecords.length) {
    errors.push(makeIssue(
      ERROR_CODES.REVIEW_FILE_FORMAT_ERROR,
      null,
      `returned review file must contain exactly ${canonicalRecords.length} records`,
      { expected: canonicalRecords.length, actual: records.length }
    ));
  }

  compareCanonicalData(records, canonicalRecords, errors, counters);
  records.forEach((record) => validateProfessionalFields(record, errors, warnings, counters));

  const summary = {
    total_recipes: records.length,
    ...statusSummary(records),
    reviewer_name_missing: counters.reviewer_name_missing,
    reviewed_at_missing: counters.reviewed_at_missing,
    required_notes_missing: counters.required_notes_missing,
    canonical_data_changes: counters.canonical_data_changes,
    invalid_decision_values: counters.invalid_decision_values,
    final_status_inconsistencies: counters.final_status_inconsistencies,
  };

  return {
    valid: errors.length === 0,
    complete: summary.fully_reviewed_count === canonicalRecords.length,
    summary,
    errors,
    warnings,
    change_requests: extractChangeRequests(records),
  };
}

function validateFile(filePath) {
  return validateRecords(loadReviewFile(filePath));
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const filePath = args.find((arg) => arg !== '--json');

  if (!filePath) {
    console.error('Usage: node scripts/validate-professional-recipe-review.js [--json] <returned-review.csv|json>');
    process.exit(2);
  }

  try {
    const report = validateFile(filePath);
    if (jsonOutput) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`valid: ${report.valid}`);
      console.log(`complete: ${report.complete}`);
      console.log(JSON.stringify(report.summary, null, 2));
      if (report.errors.length > 0) {
        console.log('errors:');
        report.errors.forEach((error) => console.log(`- ${error.code}: ${error.message}`));
      }
      if (report.warnings.length > 0) {
        console.log('warnings:');
        report.warnings.forEach((warning) => console.log(`- ${warning.code}: ${warning.message}`));
      }
      if (report.change_requests.length > 0) {
        console.log('change_requests:');
        console.log(JSON.stringify(report.change_requests, null, 2));
      }
    }
    process.exit(report.valid ? 0 : 1);
  } catch (error) {
    const report = {
      valid: false,
      complete: false,
      summary: {
        total_recipes: 0,
        pending: 0,
        approved: 0,
        changes_required: 0,
        rejected: 0,
        fully_reviewed_count: 0,
        partially_reviewed_count: 0,
        unreviewed_count: 0,
        nutrition_decision_missing: 0,
        portion_decision_missing: 0,
        workout_decision_missing_where_required: 0,
        reviewer_name_missing: 0,
        reviewed_at_missing: 0,
        required_notes_missing: 0,
        canonical_data_changes: 0,
        invalid_decision_values: 0,
        final_status_inconsistencies: 0,
      },
      errors: [makeIssue(ERROR_CODES.REVIEW_FILE_FORMAT_ERROR, null, error.message)],
      warnings: [],
      change_requests: [],
    };
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }
}

module.exports = {
  constants: {
    ERROR_CODES,
    WARNING_CODES,
    REVIEW_FIELDS,
    SOURCE_FIELDS,
    PROFESSIONAL_FIELDS,
  },
  loadCanonicalRecords,
  loadReviewFile,
  parseCsv,
  recordsToCsv,
  validateFile,
  validateRecords,
};
