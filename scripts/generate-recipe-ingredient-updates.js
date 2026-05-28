const recipes = require('../seed-recipes');

const sqlString = (value) => `'${String(value).replace(/'/g, "''")}'`;

const statements = recipes.map((recipe) => {
  const ingredients = JSON.stringify(recipe.ingredients).replace(/'/g, "''");
  return `UPDATE recipes SET ingredients = '${ingredients}'::jsonb WHERE name = ${sqlString(recipe.name)};`;
});

process.stdout.write(statements.join('\n'));
