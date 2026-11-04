// Picks the database for this build (runs before `astro build`, see package.json).
// Cloudflare Pages sets CF_PAGES_BRANCH: main → the live database, any other branch → the test database.
// Locally: DB=test npm run build (or dev) for the test database; nothing set → live, as before.
import fs from 'node:fs';

const branch = process.env.CF_PAGES_BRANCH;
const target = process.env.DB === 'test' || process.env.DB === 'live'
  ? process.env.DB
  : branch && branch !== 'main' ? 'test' : 'live';
const file = new URL('../src/lib/db-target.ts', import.meta.url);
const src = fs.readFileSync(file, 'utf8').replace(/= '(live|test)';/, `= '${target}';`);
fs.writeFileSync(file, src);
console.log(`db-target: ${target}${branch ? ` (branch ${branch})` : ''}`);
