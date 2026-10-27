import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'artifacts', 'cep-debug');
const port = Number(process.env.CEP_DEBUG_PORT || 8088);
const calculate = process.argv.includes('--calculate');
const reload = process.argv.includes('--reload');
const tryCustom76 = process.argv.includes('--try-custom-76');
const createLayout = process.argv.includes('--create');
const maximumUtilization = process.argv.includes('--maximum-utilization');
const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const report = { generatedAt: new Date().toISOString(), port, calculate, reload, tryCustom76, createLayout, maximumUtilization, events: [], errors: [] };
let browser;
let reloadInProgress = false;

function redact(value) {
  return String(value).replace(/file:\/\/\/[^\s"']+/gi, '<local-panel-url>')
    .replace(/\b[A-Za-z]:[\\/][^\s"']+/g, '<local-path>').replace(/[^\s"']+\.pdf/gi, '<pdf>');
}
function watchPage(target) {
  target.on('console', async message => {
    const entry = { type: `console-${message.type()}`, text: redact(message.text()) };
    try {
      const args = await Promise.all(message.args().map(arg => arg.jsonValue().catch(() => null)));
      if (args[1] && typeof args[1] === 'object') entry.data = sanitize(args[1]);
    } catch {}
    report.events.push(entry);
  });
  target.on('pageerror', error => report.errors.push({ type: 'pageerror', text: redact(error.message) }));
  target.on('crash', () => {
    if (reloadInProgress) {
      report.events.push({ type: 'reload-renderer-detached', text: 'CEP replaced the panel renderer during the requested reload.' });
      return;
    }
    report.errors.push({ type: 'crash', text: 'CEP panel page crashed.' });
  });
  target.on('requestfailed', request => {
    const error = request.failure()?.errorText || 'unknown';
    if (/cc-api-data\.adobe\.io\/ingest\//i.test(request.url()) && /ERR_NETWORK_ACCESS_DENIED/i.test(error)) {
      report.events.push({ type: 'environment-request-blocked', service: 'Adobe CEP telemetry', url: redact(request.url()) });
      return;
    }
    if (reloadInProgress && /ERR_ABORTED/i.test(error)) {
      report.events.push({ type: 'reload-request-aborted', url: redact(request.url()) });
      return;
    }
    report.errors.push({ type: 'requestfailed', url: redact(request.url()), error: redact(error) });
  });
}
function watchBrowser(target) {
  target.on('disconnected', () => report.events.push({ type: 'debugger-disconnected', text: 'Playwright detached from CEP.' }));
}
try {
  await mkdir(artifacts, { recursive: true });
  const response = await fetch(`http://127.0.0.1:${port}/json`).catch(error => {
    throw Error(`Cannot reach CEP debug port ${port}. Start Illustrator and open BYTEBASE Gang Optimizer, then retry. (${error.message})`);
  });
  if (!response.ok) throw Error(`CEP debug endpoint returned HTTP ${response.status}.`);
  const targets = await response.json();
  report.targets = targets.map(({ id, title, type, url }) => ({ id, title, type, url: redact(url) }));
  if (!targets.length) throw Error(`CEP debug port ${port} is available but has no panel targets. Open BYTEBASE Gang Optimizer in Illustrator.`);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 5000, isLocal: true, noDefaults: true });
  const pages = browser.contexts().flatMap(context => context.pages());
  let page = pages[0];
  for (const candidate of pages) {
    if (/Gang Optimizer/i.test(await candidate.title().catch(() => ''))) { page = candidate; break; }
  }
  if (!page) throw Error('Playwright attached to CEP, but no panel page target was found.');
  report.panel = { url: redact(page.url()), title: await page.title() };
  watchPage(page);
  watchBrowser(browser);
  if (reload) {
    reloadInProgress = true;
    const oldToken = await page.evaluate(() => new URLSearchParams(location.search).get('bytebaseReload') || '');
    const started = await page.evaluate(() => {
      const button = document.querySelector('#reloadPanel');
      if (!button || button.hidden || button.disabled) return false;
      button.click();
      return true;
    });
    if (!started) throw Error('Reload Panel is hidden or disabled. Enable CEP development mode before using --reload.');
    try {
      await page.waitForFunction(previous => {
        const token = new URLSearchParams(location.search).get('bytebaseReload') || '';
        return document.readyState === 'complete' && !!document.querySelector('#optimize') && token && token !== previous;
      }, oldToken, { timeout: 15000 });
    } catch (error) {
      if (!/ERR_ABORTED|frame was detached|Target crashed/i.test(error.message)) throw error;
      // CEP may detach the renderer while location.replace loads the cache-busted
      // panel. Reattach to the same CEP target and verify its restored document.
      report.events.push({ type: 'reload-navigation', text: 'CEP replaced the panel document; reconnecting to the restored panel.' });
      await browser.close().catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 350));
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 5000, isLocal: true, noDefaults: true });
      watchBrowser(browser);
      page = browser.contexts().flatMap(context => context.pages())
        .find(candidate => /\/client\/index\.html(?:\?|$)/i.test(candidate.url()));
      if (!page) throw Error('CEP reloaded, but the panel page could not be reattached.');
      watchPage(page);
      await page.waitForFunction(() => document.readyState === 'complete' && !!document.querySelector('#optimize'), null, { timeout: 10000 });
    }
    reloadInProgress = false;
  }
  const before = await capturePanel(page);
  report.before = before;
  await page.screenshot({ path: path.join(artifacts, `${stamp}-before.png`), fullPage: true, timeout: 5000 });
  if (maximumUtilization) {
    await page.evaluate(() => {
      const mode = document.querySelector('#optimizationMode');
      mode.value = 'utilization';
      mode.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  if (calculate) {
    if (before.optimizeDisabled) throw Error('Calculate button is disabled. See the before snapshot in the report.');
    await runCalculation(page, 'current settings');
    report.currentSettingsResult = await capturePanel(page);
    await page.screenshot({ path: path.join(artifacts, `${stamp}-current-settings.png`), fullPage: true, timeout: 5000 }).catch(error =>
      report.errors.push({ type: 'screenshot', text: redact(error.message) }));
    if (tryCustom76 && !page.isClosed()) {
      await page.evaluate(() => {
        const cap = document.querySelector('#overproductionCap');
        cap.value = 'custom'; cap.dispatchEvent(new Event('change', { bubbles: true }));
        const custom = document.querySelector('#customOverproduction');
        custom.value = '76'; custom.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await runCalculation(page, 'custom 76%');
      report.custom76Result = await capturePanel(page);
      await page.screenshot({ path: path.join(artifacts, `${stamp}-custom-76.png`), fullPage: true, timeout: 5000 }).catch(error =>
        report.errors.push({ type: 'screenshot', text: redact(error.message) }));
    }
  }
  if (createLayout) {
    const ready = await capturePanel(page);
    if (ready.createDisabled) throw Error('Create working Illustrator layout is disabled. Calculate a valid layout first.');
    await page.evaluate(() => {
      const originalConfirm = window.confirm;
      window.confirm = () => true;
      try { document.querySelector('#create').click(); }
      finally { window.confirm = originalConfirm; }
    });
    await page.waitForFunction(() => {
      const status = document.querySelector('#status')?.textContent || '';
      return /^(Created and verified |Layout generation failed:|Verify the ink list)/i.test(status);
    }, null, { timeout: 60000 });
    report.creationResult = await capturePanel(page);
    await page.screenshot({ path: path.join(artifacts, `${stamp}-created-layout.png`), fullPage: true, timeout: 5000 }).catch(error =>
      report.errors.push({ type: 'screenshot', text: redact(error.message) }));
  }
  report.after = await capturePanel(page);
  await page.screenshot({ path: path.join(artifacts, `${stamp}-after.png`), fullPage: true, timeout: 5000 }).catch(error =>
    report.errors.push({ type: 'screenshot', text: redact(error.message) }));
  if (report.creationResult?.status?.startsWith('Verify the ink list'))
    report.events.push({ type: 'generation-blocked', text: 'The panel received the Create click and directed the user to manually verify PDF ink candidates before Illustrator generation.' });
  if (report.creationResult?.status?.startsWith('Layout generation failed:'))
    report.errors.push({ type: 'generation', text: redact(report.creationResult.status) });
  if (report.after?.status?.startsWith('Calculation failed:') && !calculate) report.result = 'Panel loaded; calculation not requested.';
  else report.result = report.errors.length ? 'Completed with recorded errors.' : 'Completed without recorded errors.';
} catch (error) {
  report.result = 'Failed';
  report.errors.push({ type: 'fatal', text: redact(error.stack || error.message || error) });
} finally {
  report.artifactDirectory = artifacts;
  await writeFile(path.join(artifacts, `${stamp}-report.json`), JSON.stringify(report, null, 2));
  if (browser) await browser.close().catch(() => {});
  console.log(JSON.stringify(report, null, 2));
  if (report.result === 'Failed') process.exitCode = 1;
}

async function capturePanel(page) {
  if (!page || page.isClosed()) return { closed: true };
  try {
    return await page.evaluate(() => {
      const text = id => document.querySelector(`#${id}`)?.textContent?.trim() || '';
      const saved = JSON.parse(localStorage.getItem('com.bytebase.gangoptimizer.session.v1') || '{}');
      const layout = saved.latest;
      let debug = [];
      try { debug = (localStorage.getItem('com.bytebase.gangoptimizer.debug') || '').split('\n').filter(Boolean).slice(-5).map(JSON.parse); } catch {}
      return { title: document.title, url: location.href, status: text('status'),
        optimizeDisabled: !!document.querySelector('#optimize')?.disabled,
        createDisabled: !!document.querySelector('#create')?.disabled,
        sheets: text('metricSheets'), placements: text('metricCopies'), usage: text('metricUsage'),
        jobCount: Array.isArray(saved.jobs) ? saved.jobs.length : 0,
        jobs: Array.isArray(saved.jobs) ? saved.jobs.map(job => ({ id: job.id, orderQ: Number(job.orderQ) || 0,
          width: Number(job.width) || 0, height: Number(job.height) || 0 })) : [],
        layout: layout ? {
          sheetCount: layout.sheetCount,
          placements: layout.totalCopies,
          totalProduced: layout.totalProduced,
          totalOverproduction: layout.totalOverproduction,
          areaPct: layout.areaPct,
          layoutQuality: layout.layoutQuality,
          jobs: (layout.jobs || []).map(job => ({ id: job.id, orderQ: job.orderQ,
            copiesPerSheet: job.copiesPerSheet, printingRuns: job.printingRuns,
            producedQuantity: job.producedQuantity, overproduction: job.overproduction,
            overproductionPct: job.overproductionPct })),
          sheets: (layout.sheets || []).map(sheet => ({ index: sheet.index,
            areaPct: sheet.areaPct, largestFreeRectArea: sheet.largestFreeRectArea,
            largestNonCornerFreeRectArea: sheet.largestNonCornerFreeRectArea,
            printingRuns: sheet.printingRuns, totalPlacements: sheet.totalPlacements,
            placements: (sheet.placements || []).map(placement => ({ id: placement.id,
              x: placement.x, y: placement.y, w: placement.w, h: placement.h })) }))
        } : null,
        settings: saved.settings || {}, overproductionCap: saved.overproductionCap || '0',
        customOverproduction: saved.customOverproduction || '0', lastOptimizationError: saved.lastOptimizationError || null, debug };
    });
  } catch (error) { return { unavailable: true, reason: redact(error.message) }; }
}

async function runCalculation(page, label) {
  try {
    await page.evaluate(() => document.querySelector('#optimize').click());
    await page.waitForFunction(() => {
      const status = document.querySelector('#status').textContent || '';
      return /^(Calculation failed:|Planned )/.test(status);
    }, null, { timeout: 20000 });
  } catch (error) { report.errors.push({ type: `calculation-${label}`, text: redact(error.message) }); }
}

function sanitize(value) {
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitize(item)]));
  return value;
}
