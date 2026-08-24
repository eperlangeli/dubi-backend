#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
  generateDraftRecipeDay,
  loadHarnessData,
  summarizeHarnessResult,
} = require('./lib/draft-recipe-harness');

function parseArgs(argv) {
  const args = {
    profile: null,
    date: '2026-09-01',
    json: false,
    all: false,
    outputDir: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--profile') args.profile = argv[++index];
    else if (arg === '--date') args.date = argv[++index];
    else if (arg === '--json') args.json = true;
    else if (arg === '--all') args.all = true;
    else if (arg === '--output-dir') args.outputDir = argv[++index];
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function printUsage() {
  console.log([
    'Usage:',
    '  node scripts/run-draft-recipe-harness.js --profile fake_profile_01 --date 2026-09-01',
    '  node scripts/run-draft-recipe-harness.js --profile fake_profile_01 --date 2026-09-01 --json',
    '  node scripts/run-draft-recipe-harness.js --all --date 2026-09-01 --json',
  ].join('\n'));
}

function writeOutput(outputDir, result) {
  if (!outputDir) return;
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `${result.profile_id}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(result, null, 2)}\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.all && !args.profile)) {
    printUsage();
    process.exit(args.help ? 0 : 2);
  }

  const rootDir = path.resolve(__dirname, '..');
  const data = loadHarnessData(rootDir);
  const profiles = args.all
    ? data.profiles
    : data.profiles.filter((profile) => profile.profile_id === args.profile);

  if (profiles.length === 0) {
    throw new Error(`Profile not found: ${args.profile}`);
  }

  const results = profiles.map((profile) => generateDraftRecipeDay(profile, {
    rootDir,
    testDate: args.date,
    data,
  }));

  results.forEach((result) => writeOutput(args.outputDir, result));

  if (args.json) {
    console.log(JSON.stringify(args.all ? results : results[0], null, 2));
  } else {
    results.forEach((result) => {
      console.log(JSON.stringify(summarizeHarnessResult(result), null, 2));
    });
  }

  process.exit(results.every((result) => result.generation_status === 'SUCCESS') ? 0 : 1);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
