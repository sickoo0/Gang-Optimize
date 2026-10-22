import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'artifacts', 'browser-preview');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const jobs = [
  { id: '1', fileName: 'job-1.pdf', filePath: 'C:/test/job-1.pdf', width: 290.3602, height: 50.8106, orderQ: 5, orderQConfirmed: true, measured: true },
  { id: '2', fileName: 'job-2.pdf', filePath: 'C:/test/job-2.pdf', width: 260.3601, height: 45.4872, orderQ: 100, orderQConfirmed: true, measured: true },
  { id: '3', fileName: 'job-3.pdf', filePath: 'C:/test/job-3.pdf', width: 90.36, height: 21.6007, orderQ: 100, orderQConfirmed: true, measured: true },
  { id: '4', fileName: 'job-4.pdf', filePath: 'C:/test/job-4.pdf', width: 130.3602, height: 66.1559, orderQ: 150, orderQConfirmed: true, measured: true },
  { id: '5', fileName: 'job-5.pdf', filePath: 'C:/test/job-5.pdf', width: 290.3601, height: 140.5507, orderQ: 100, orderQConfirmed: true, measured: true }
];
const settings = { sheetW: 700, sheetH: 500, edge: 20, inset: 5, rotate: true };
const targetJobs = [
  { id: '1', fileName: 'job-1.pdf', filePath: 'C:/test/job-1.pdf', width: 90.3594, height: 18.9135, orderQ: 100, orderQConfirmed: true, measured: true },
  { id: '2', fileName: 'job-2.pdf', filePath: 'C:/test/job-2.pdf', width: 260.3601, height: 161.1883, orderQ: 50, orderQConfirmed: true, measured: true },
  { id: '3', fileName: 'job-3.pdf', filePath: 'C:/test/job-3.pdf', width: 80.0001, height: 25, orderQ: 1000, orderQConfirmed: true, measured: true },
  { id: '4', fileName: 'job-4.pdf', filePath: 'C:/test/job-4.pdf', width: 90, height: 18.5533, orderQ: 120, orderQConfirmed: true, measured: true },
  { id: '5', fileName: 'job-5.pdf', filePath: 'C:/test/job-5.pdf', width: 100.0002, height: 64.1742, orderQ: 400, orderQConfirmed: true, measured: true },
  { id: '6', fileName: 'job-6.pdf', filePath: 'C:/test/job-6.pdf', width: 90.3527, height: 31.4064, orderQ: 100, orderQConfirmed: true, measured: true }
];
const failures = [];
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const candidate = path.resolve(root, `.${pathname}`);
    if (candidate !== root && !candidate.startsWith(root + path.sep)) throw Error('Path outside project root');
    const body = await readFile(candidate);
    response.writeHead(200, { 'content-type': mime[path.extname(candidate)] || 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404); response.end('Not found');
  }
});

await mkdirArtifacts();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const browser = await chromium.launch({ headless: true });

function session({ fixtureJobs, cap = '0', custom = '0', mode = 'balanced' }) {
  return JSON.stringify({ version: 2, savedAt: new Date().toISOString(), jobs: fixtureJobs, latest: null, proposals: [],
    selectedSheet: 0, settings, optimizationMode: mode, overproductionCap: cap, customOverproduction: custom,
    scrollTop: 0, appScrollTop: 0, lastOptimizationError: null });
}
async function newPanel(seed) {
  const context = await browser.newContext({ viewport: { width: 460, height: 900 }, deviceScaleFactor: 1 });
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, value),
    { key: 'com.bytebase.gangoptimizer.session.v1', value: seed });
  const page = await context.newPage();
  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('crash', () => failures.push('page crash'));
  page.on('console', message => { if (message.type() === 'error') failures.push(`console: ${message.text()}`); });
  await page.goto(`http://127.0.0.1:${address.port}/client/index.html`, { waitUntil: 'load' });
  await page.locator('#status').waitFor();
  return { context, page };
}
async function runInfeasibleCase({ name, cap, custom, expected }) {
  const { context, page } = await newPanel(session({ fixtureJobs: jobs, cap, custom, mode: 'utilization' }));
  await page.screenshot({ path: path.join(artifacts, `${name}-before.png`), fullPage: true });
  await page.locator('#optimize').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Calculation failed:'), null, { timeout: 5000 });
  const status = await page.locator('#status').innerText();
  assert.match(status, new RegExp(expected));
  assert.equal(await page.locator('#create').isDisabled(), true);
  assert.match(status, /one sheet|single gang sheet/);
  await page.screenshot({ path: path.join(artifacts, `${name}-after.png`), fullPage: true });
  await context.close();
  return { name, status };
}
async function mkdirArtifacts() {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(artifacts, { recursive: true });
}

let results = [];
try {
  const legacyState = JSON.parse(session({ fixtureJobs: targetJobs, cap: '0', mode: 'balanced' }));
  legacyState.version = 1;
  const { context: migrationContext, page: migrationPage } = await newPanel(JSON.stringify(legacyState));
  const migration = await migrationPage.evaluate(() => ({
    mode: document.querySelector('#optimizationMode').value, cap: document.querySelector('#overproductionCap').value,
    status: document.querySelector('#status').textContent,
    savedVersion: JSON.parse(localStorage.getItem('com.bytebase.gangoptimizer.session.v1') || '{}').version
  }));
  assert.equal(migration.mode, 'overproduction');
  assert.equal(migration.cap, 'auto');
  assert.equal(migration.savedVersion, 2);
  assert.match(migration.status, /fresh preview/i);
  await migrationContext.close();
  results.push({ name: 'legacy-settings-auto-migration', ...migration });

  results.push(await runInfeasibleCase({name:'order-zero-cap-single-sheet',cap:'0',custom:'0',expected:'single gang sheet at 0% overproduction'}));
  results.push(await runInfeasibleCase({ name: 'order-custom-76', cap: 'custom', custom: '76', expected: '344.4%' }));

  const { context: automaticContext, page: automaticPage } = await newPanel(session({ fixtureJobs: targetJobs, cap: 'auto', mode: 'overproduction' }));
  await automaticPage.locator('#optimize').click();
  await automaticPage.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Planned '), null, { timeout: 20000 });
  const automatic = await automaticPage.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('com.bytebase.gangoptimizer.session.v1') || '{}');
    return { status: document.querySelector('#status').textContent, sheets: document.querySelector('#metricSheets').textContent,
      placements: document.querySelector('#metricCopies').textContent, usage: document.querySelector('#metricUsage').textContent,
      runs: saved.latest?.sheets?.[0]?.printingRuns, overproduction: saved.latest?.totalOverproduction,
      cap: saved.overproductionCap };
  });
  assert.equal(automatic.sheets, '1');
  assert.equal(automatic.placements, '36');
  assert.equal(automatic.runs, 50);
  assert.equal(automatic.overproduction, 30);
  assert.equal(automatic.cap, 'auto');
  await automaticPage.screenshot({ path: path.join(artifacts, 'automatic-recommended-layout.png'), fullPage: true });
  await automaticContext.close();
  results.push({ name: 'automatic-recommended-layout', ...automatic });

  const compactJobs = [
    { id: 'a', fileName: 'a.pdf', filePath: 'C:/test/a.pdf', width: 90, height: 50, orderQ: 5, orderQConfirmed: true, measured: true },
    { id: 'b', fileName: 'b.pdf', filePath: 'C:/test/b.pdf', width: 115, height: 80, orderQ: 10, orderQConfirmed: true, measured: true },
    { id: 'c', fileName: 'c.pdf', filePath: 'C:/test/c.pdf', width: 60, height: 40, orderQ: 15, orderQConfirmed: true, measured: true }
  ];
  const { context, page } = await newPanel(session({ fixtureJobs: compactJobs, cap: '0', mode: 'balanced' }));
  await page.locator('#optimize').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Planned '), null, { timeout: 20000 });
  const preview = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('com.bytebase.gangoptimizer.session.v1') || '{}');
    return { status: document.querySelector('#status').textContent,
      sheets: document.querySelector('#metricSheets').textContent, placements: document.querySelector('#metricCopies').textContent,
      usage: document.querySelector('#metricUsage').textContent, canvasWidth: document.querySelector('#sheetCanvas').width,
      largestFreeRectArea: saved.latest?.sheets?.[0]?.largestFreeRectArea,
      createDisabled: document.querySelector('#create').disabled };
  });
  assert.equal(preview.sheets, '1');
  assert.equal(Number(preview.placements), 30);
  assert.ok(Number.parseFloat(preview.usage) > 0);
  assert.ok(preview.largestFreeRectArea <= 303600 * 0.05,
    `layout should avoid a large blank cavity; largest free rectangle is ${preview.largestFreeRectArea} mm²`);
  assert.equal(preview.createDisabled, true, 'browser preview cannot create a fake Illustrator document');
  await page.screenshot({ path: path.join(artifacts, 'valid-one-sheet-preview.png'), fullPage: true });
  await context.close();
  results.push({ name: 'valid-one-sheet-preview', ...preview });

  assert.deepEqual(failures, [], `browser runtime errors: ${failures.join('; ')}`);
  const report = { generatedAt: new Date().toISOString(), browser: browser.version(), results, failures, artifacts };
  await (await import('node:fs/promises')).writeFile(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  const report = { generatedAt: new Date().toISOString(), results, failures, error: error.stack || String(error), artifacts };
  await (await import('node:fs/promises')).writeFile(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
