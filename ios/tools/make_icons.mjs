// Draws the site's line icons (src/lib/ui/icons.ts) as template images for the app (Assets.xcassets/i-<name>).
// Run from the repo root: node ios/tools/make_icons.mjs glass chat cart … (Playwright's Chromium draws them).
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
// Playwright is installed globally, not in the project
const { chromium } = createRequire(import.meta.url)('playwright');

const src = readFileSync('src/lib/ui/icons.ts', 'utf8');
const names = process.argv[2] === '--flags' ? [] : process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 48, height: 48 }, deviceScaleFactor: 3 });
for (const name of names) {
  // A name with a dash is quoted in icons.ts ('barrel-grapes': …)
  const m = src.match(new RegExp(`^\\s+'?${name}'?: '([^']+)'`, 'm'));
  if (!m) { console.error('no icon', name); continue; }
  await page.setContent(`<html><body style="margin:0;background:transparent"><svg viewBox="0 0 24 24" width="48" height="48"
    style="display:block;fill:none;stroke:#000;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round">${m[1]}</svg></body></html>`);
  const png = await page.locator('svg').screenshot({ omitBackground: true });
  const dir = `ios/Winetastr/Assets.xcassets/i-${name}.imageset`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/i.png`, png);
  writeFileSync(`${dir}/Contents.json`, JSON.stringify({ images: [{ filename: 'i.png', idiom: 'universal', scale: '3x' }], info: { author: 'xcode', version: 1 }, properties: { 'template-rendering-intent': 'template' } }));
  console.log('ok', name);
}
await browser.close();

// The language flags (src/i18n/flags.ts) as plain images: node ios/tools/make_icons.mjs --flags da en is
if (process.argv[2] === '--flags') {
  const flags = readFileSync('src/i18n/flags.ts', 'utf8');
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 24, height: 16 }, deviceScaleFactor: 3 });
  for (const code of process.argv.slice(3)) {
    const m = flags.match(new RegExp(`^\\s+${code}: svg\\('([^']+)', '([^']+)'\\)`, 'm'));
    if (!m) { console.error('no flag', code); continue; }
    await p.setContent(`<html><body style="margin:0"><svg viewBox="${m[1]}" width="24" height="16" preserveAspectRatio="xMidYMid slice" style="display:block">${m[2]}</svg></body></html>`);
    const png = await p.locator('svg').screenshot();
    const dir = `ios/Winetastr/Assets.xcassets/flag-${code}.imageset`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/f.png`, png);
    writeFileSync(`${dir}/Contents.json`, JSON.stringify({ images: [{ filename: 'f.png', idiom: 'universal', scale: '3x' }], info: { author: 'xcode', version: 1 } }));
    console.log('ok flag', code);
  }
  await b.close();
}
