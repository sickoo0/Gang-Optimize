import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import packingFixtures from '../tests/packing-fixtures.js';
import validatePlan from '../tests/plan-invariants.js';

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

function session({ fixtureJobs, cap = '0', custom = '0', mode = 'balanced', sheetSettings = settings }) {
  return JSON.stringify({ version: 3, savedAt: new Date().toISOString(), jobs: fixtureJobs, latest: null, proposals: [],
    selectedSheet: 0, settings: sheetSettings, optimizationMode: mode, overproductionCap: cap, customOverproduction: custom,
    scrollTop: 0, appScrollTop: 0, lastOptimizationError: null });
}
async function newPanel(seed, options = {}) {
  const context = await browser.newContext({ viewport: { width: 460, height: 900 }, deviceScaleFactor: 1 });
  await context.addInitScript(({ key, value }) => {
    if (value !== null && !sessionStorage.getItem('bytebase-test-seeded')) {localStorage.setItem(key, value);sessionStorage.setItem('bytebase-test-seeded','1');}
    window.previewRectangles = [];
    const stroke = CanvasRenderingContext2D.prototype.strokeRect, clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.strokeRect = function (...args) {
      if (this.canvas.id === 'sheetCanvas') window.previewRectangles.push(args);
      return stroke.apply(this, args);
    };
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.id === 'sheetCanvas') window.previewRectangles = [];
      return clear.apply(this, args);
    };
  },
    { key: 'com.bytebase.gangoptimizer.session.v1', value: seed });
  if (options.bridgePlan) await context.addInitScript(({ placed }) => {
    window.__bridgeCalls = [];
    window.__adobe_cep__ = { evalScript(expression, callback) {
      window.__bridgeCalls.push(expression);
      callback(JSON.stringify({ sheets: 1, placed, verified: placed }));
    } };
    window.confirm = () => { throw Error('Native CEP confirm dialog blocked layout creation'); };
  }, { placed: options.bridgePlan.totalCopies });
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
    cutMargin: document.querySelector('#inset').value,
    status: document.querySelector('#status').textContent,
    savedVersion: JSON.parse(localStorage.getItem('com.bytebase.gangoptimizer.session.v1') || '{}').version
  }));
  assert.equal(migration.mode, 'overproduction');
  assert.equal(migration.cap, 'auto');
  assert.equal(migration.savedVersion, 4);
  assert.equal(migration.cutMargin, '5', 'a saved production margin remains unchanged after upgrade');
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

  const utilizationInput = packingFixtures.find(fixture => fixture.name === 'measured-six-cap76');
  const { context: utilizationContext, page: utilizationPage } = await newPanel(session({ fixtureJobs: utilizationInput.jobs, cap: 'custom', custom: '76', mode: 'utilization' }));
  await utilizationPage.locator('#optimize').click();
  await utilizationPage.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Planned '), null, { timeout: 20000 });
  const actualPreview = await utilizationPage.evaluate(() => ({
    plan: JSON.parse(localStorage.getItem('com.bytebase.gangoptimizer.session.v1')).latest,
    rectangles: window.previewRectangles, width: document.querySelector('#sheetCanvas').width
  }));
  validatePlan(actualPreview.plan, utilizationInput);
  assert.ok(actualPreview.plan.areaPct >= 92.1, 'worker retains or improves baseline utilization');
  const scale = actualPreview.width / settings.sheetW;
  assert.equal(actualPreview.rectangles.length, 1 + actualPreview.plan.totalCopies * 2);
  for (const [index, placement] of actualPreview.plan.sheets[0].placements.entries()) {
    const box = actualPreview.rectangles[index * 2], artwork = actualPreview.rectangles[1 + index * 2];
    const expected = [placement.x, placement.y, placement.w, placement.h].map(mm => mm * scale);
    const inner = [placement.x + 5, placement.y + 5, placement.w - 10, placement.h - 10].map(mm => mm * scale);
    for (let axis = 0; axis < 4; axis++) { assert.ok(Math.abs(box[axis] - expected[axis]) < 1e-6); assert.ok(Math.abs(artwork[axis] - inner[axis]) < 1e-6); }
  }
  await utilizationPage.screenshot({ path: path.join(artifacts, 'maximum-utilization-preview.png'), fullPage: true });
  results.push({ name: 'maximum-utilization-worker-and-preview', cutBoxPct: actualPreview.plan.areaPct, artworkPct: actualPreview.plan.artworkAreaPct, placements: actualPreview.plan.totalCopies });
  await utilizationContext.close();

  const createSeed = JSON.parse(session({ fixtureJobs: utilizationInput.jobs, cap: 'custom', custom: '76', mode: 'utilization' }));
  createSeed.latest = actualPreview.plan;
  createSeed.proposals = actualPreview.plan.proposals;
  const { context: createContext, page: createPage } = await newPanel(JSON.stringify(createSeed), { bridgePlan: actualPreview.plan });
  assert.equal(await createPage.locator('#create').isDisabled(), false);
  await createPage.locator('#inkNames').fill('280c\n485c\n7616c\nWhite-BG\nLim');
  await createPage.locator('#applyInkNames').click();
  await createPage.locator('#verifyInks').check();
  assert.equal(await createPage.locator('#frameLegend').innerText(),'1/5 280c  2/5 485c  3/5 7616c  4/5 hvid  5/5 lim');
  assert.equal(await createPage.locator('#lockSpecialInks').isDisabled(),true,'MASCOT special order is fixed');
  assert.match((await createPage.locator('#inkSequence').innerText()),/White-BG.*4\/5 hvid[\s\S]*Lim.*5\/5 lim/);
  assert.deepEqual(await createPage.locator('#inkSequence .ink-swatch').evaluateAll(nodes=>nodes.slice(-2).map(n=>getComputedStyle(n).backgroundColor)),['rgb(167, 169, 172)','rgb(255, 242, 0)']);
  await createPage.locator('#create').click();
  await createPage.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Created and verified '), null, { timeout: 3000 });
  const bridgeCalls = await createPage.evaluate(() => window.__bridgeCalls);
  assert.equal(bridgeCalls.length, 1, 'the Create button calls Illustrator exactly once');
  const payload = /^Bytebase\.createLayout\("([^"]+)"\)$/.exec(bridgeCalls[0]);
  assert.ok(payload, 'the CEP bridge receives a createLayout request');
  assert.equal(JSON.parse(decodeURIComponent(payload[1])).layout.totalCopies, actualPreview.plan.totalCopies);
  const creation=JSON.parse(decodeURIComponent(payload[1]));assert.equal(creation.production.options.verified,true);
  assert.deepEqual(creation.production.profile.inks.spots['White-BG'].values,[0,0,0,40]);
  assert.deepEqual(creation.production.profile.inks.spots.Lim.values,[0,0,100,0]);
  const originalLayout=await createPage.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('com.bytebase.gangoptimizer.session.v1')).latest));
  await createPage.locator('#frameTextMode').selectOption('current');
  await createPage.locator('#currentFrame').selectOption('4');
  assert.equal(await createPage.locator('#frameLegend').innerText(),'5/5 lim');
  assert.equal(await createPage.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('com.bytebase.gangoptimizer.session.v1')).latest)),originalLayout,'appearance change retains optimized layout');
  await createPage.reload();
  assert.equal(await createPage.locator('#frameLegend').innerText(),'5/5 lim');
  assert.equal(await createPage.locator('#verifyInks').isChecked(),true);
  await createPage.locator('.production-setup details summary').click();
  await createPage.locator('#duplicateProfile').click();
  assert.equal(await createPage.locator('#productionProfile option').count(),4);
  await createPage.locator('#profileName').fill('Test company');await createPage.locator('#renameProfile').click();
  assert.equal(await createPage.locator('#productionProfile option:checked').innerText(),'Test company');
  const svg='<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="none" stroke="black" stroke-width="0.2"/></svg>';
  await createPage.locator('#importMarkSVG').setInputFiles({name:'target.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});
  await createPage.waitForFunction(()=>document.getElementById('markType').value==='svg');
  const profile=JSON.parse(await createPage.locator('#profileEditor').inputValue());
  assert.equal(profile.assets.imported,svg);
  await createPage.locator('#importMarkSVG').setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg><script/></svg>')});
  await createPage.waitForFunction(()=>document.getElementById('status').textContent.includes('SVG:'));
  assert.equal(JSON.parse(await createPage.locator('#profileEditor').inputValue()).assets.imported,svg,'unsafe import retains previous profile');
  profile.sheet.width=710;await createPage.locator('#profileEditor').fill(JSON.stringify(profile));await createPage.locator('#saveProfile').click();
  assert.equal(await createPage.locator('#sheetW').inputValue(),'710');assert.equal(await createPage.locator('#metricSheets').innerText(),'–');
  await createPage.reload();assert.equal(await createPage.locator('#sheetW').inputValue(),'710');assert.equal(await createPage.locator('#productionProfile option:checked').innerText(),'Test company');
  results.push({name:'production-setup-profiles-svg-legend-persistence',passed:true});
  results.push({ name: 'create-button-invokes-illustrator-bridge', placements: actualPreview.plan.totalCopies });
  await createContext.close();
  const { context: freshContext, page: freshPage } = await newPanel(null);
  assert.equal(await freshPage.locator('#inset').inputValue(), '0', 'a new installation defaults to no cut margin');
  assert.equal(await freshPage.locator('#cutMarginLegend').innerText(), 'Cut margin: 0 mm / side');
  await freshContext.close();

  const zeroInput = packingFixtures.find(fixture => fixture.name === 'zero-cut-margin');
  const { context: marginContext, page: marginPage } = await newPanel(session({ fixtureJobs: zeroInput.jobs, cap: '0', mode: 'utilization', sheetSettings: zeroInput.settings }));
  await marginPage.locator('#optimize').click();
  await marginPage.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Planned '), null, { timeout: 20000 });
  const zeroPreview = await marginPage.evaluate(() => ({
    plan: JSON.parse(localStorage.getItem('com.bytebase.gangoptimizer.session.v1')).latest,
    rectangles: window.previewRectangles
  }));
  validatePlan(zeroPreview.plan, zeroInput);
  assert.equal(zeroPreview.rectangles.length, 1 + zeroPreview.plan.totalCopies, 'zero margin has no inner margin outline');
  assert.equal(await marginPage.locator('#artworkLegend').isVisible(), false);
  await marginPage.locator('#inset').fill('4');
  await marginPage.locator('#inset').dispatchEvent('change');
  assert.equal(await marginPage.locator('#create').isDisabled(), true, 'changing the margin invalidates the previous layout');
  assert.equal(await marginPage.locator('#cutMarginLegend').innerText(), 'Cut margin: 4 mm / side');
  await marginPage.locator('#optimize').click();
  await marginPage.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Planned '), null, { timeout: 20000 });
  const fourPreview = await marginPage.evaluate(() => ({
    plan: JSON.parse(localStorage.getItem('com.bytebase.gangoptimizer.session.v1')).latest,
    rectangles: window.previewRectangles
  }));
  validatePlan(fourPreview.plan, { ...zeroInput, settings: { ...zeroInput.settings, inset: 4 } });
  assert.equal(fourPreview.rectangles.length, 1 + fourPreview.plan.totalCopies * 2);
  assert.equal(await marginPage.locator('#artworkLegend').isVisible(), true);
  results.push({ name: 'editable-cut-margin', zeroMm: zeroPreview.plan.areaPct, fourMm: fourPreview.plan.areaPct });
  await marginContext.close();
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
