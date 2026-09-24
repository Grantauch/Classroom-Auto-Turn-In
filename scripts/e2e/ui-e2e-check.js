'use strict';
// UI-level end-to-end release gate. Launches the real desktop app (main
// process, preload bridge, renderer) and drives the guided setup exactly as a
// teacher would: choose Classroom, choose topic, choose and check the Drive
// folder, run the Safety Check, finish and turn on automatic turn-in, then
// "Check now". Afterwards it runs the app the way Windows Task Scheduler does
// (--background-run), including a temporary network failure and the automatic
// retry task that failure creates.
//
// Google Classroom/Drive are the offline simulator. On a non-Windows host the
// Windows Task Scheduler is the PowerShell mock (requires pwsh). Nothing here is
// packaged into the teacher installer.
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const assert = require('assert');

const root = path.join(__dirname, '..', '..');
if (process.platform === 'win32') {
  console.log('UI end-to-end check skipped on Windows: it would register real scheduled tasks. The engine gate and installed-package validation cover Windows.');
  process.exit(0);
}
const pwsh = [process.env.CATI_PWSH, 'pwsh'].filter(Boolean).find(p => !cp.spawnSync(p, ['-NoProfile', '-Command', 'exit 0'], { timeout: 30000 }).error);
if (!pwsh) { console.log('UI end-to-end check skipped: PowerShell (pwsh) is needed for the mock Windows Task Scheduler.'); process.exit(0); }

const { _electron } = require(require.resolve('playwright-core', { paths: [path.join(root, 'engine')] }));
const electronBin = require(path.join(root, 'node_modules', 'electron'));
const { readState, writeState } = require('./mock-google');
const { buildPrelude } = require('./mock-task-scheduler');

const COURSE_ID = 'NzQxMjM0NTY3ODkw';
const FOLDER_ID = '1WeeklyPlansFolder2627abcdefghij';
const TOPIC = 'Lesson Plans - Teaching Staff Only';
const fid = w => `1PlanFile${String(w).padStart(2, '0')}AbCdEfGhIjKlMnOpQrStU`;

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cati-ui-e2e-'));
const stateFile = path.join(temp, 'google-state.json');
const registry = path.join(temp, 'tasks.json');
const configHome = path.join(temp, 'config');
const shimDir = path.join(temp, 'bin');
fs.mkdirSync(shimDir, { recursive: true });
fs.writeFileSync(registry, '{}');
const preludeFile = path.join(temp, 'prelude.ps1');
fs.writeFileSync(preludeFile, buildPrelude(registry));
fs.writeFileSync(path.join(shimDir, 'powershell.exe'), `#!/usr/bin/env bash
script=""
while [ $# -gt 0 ]; do case "$1" in -Command) script="$2"; shift 2;; *) shift;; esac; done
tmp="$(mktemp --suffix=.ps1)"
trap 'rm -f "$tmp"' EXIT
cat "${preludeFile}" > "$tmp"
printf '\\n%s\\n' "$script" >> "$tmp"
"${pwsh}" -NoProfile -NonInteractive -File "$tmp"
`, { mode: 0o755 });
fs.writeFileSync(path.join(shimDir, 'taskkill'), `#!/usr/bin/env bash
pid=""; while [ $# -gt 0 ]; do case "$1" in /PID) pid="$2"; shift 2;; *) shift;; esac; done
[ -n "$pid" ] && pkill -9 -P "$pid"; [ -n "$pid" ] && kill -9 "$pid"; exit 0
`, { mode: 0o755 });

const files = [1, 2, 3, 4, 5].map(w => ({ id: fid(w), name: `Week ${String(w).padStart(2, '0')} - Lesson Plans`, kind: 'gdoc' }));
const planItem = (w, dueOffsetDays, status = 'assigned', attachments = []) => ({ id: String(600000 + w), title: `Week ${w} - Lesson Plans`, dueOffsetDays, status, attachments });
writeState(stateFile, {
  signedIn: true, account: { name: 'Test Teacher' },
  course: { id: COURSE_ID, name: 'MMHS Staff Lesson Plans', section: '2026-27' },
  classworkVariant: 'region-topic-prefix', itemLinkVariant: 'expand', renderDelayMs: 400, attachDelayMs: 700, confirmDialog: true, linkInputType: 'url',
  topics: [
    { id: 't-archive', name: 'Archive 2025-26', items: [{ id: '500003', title: 'Week 3 - Lesson Plans', dueOffsetDays: 0, status: 'assigned', attachments: [] }] },
    { id: 't-plans', name: TOPIC, items: [planItem(6, 1), planItem(5, 14), planItem(4, 7), planItem(3, 0), planItem(2, -7, 'turned_in', [{ fileId: fid(2) }]), planItem(1, -14, 'turned_in', [{ fileId: fid(1) }])] }
  ],
  noTopicItems: [],
  drive: { folderId: FOLDER_ID, folderName: 'Weekly Plans 26-27', files, exposeHref: false, virtualized: true },
  otherDocs: [], events: [],
  autoPick: { classroom: true, drive: true }
});
const edit = fn => { const s = readState(stateFile); fn(s); writeState(stateFile, s); };
const events = type => (readState(stateFile).events || []).filter(e => e.type === type);
const tasks = () => JSON.parse(fs.readFileSync(registry, 'utf8'));
const userData = path.join(configHome, 'classroom-auto-turn-in');
const dataDir = path.join(userData, 'data');
const readJson = name => JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));
const appLog = () => { const d = path.join(dataDir, 'logs'); return fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.endsWith('.log')).map(f => fs.readFileSync(path.join(d, f), 'utf8')).join('') : ''; };

const env = {
  ...process.env,
  PATH: `${shimDir}:${path.dirname(pwsh.includes('/') ? pwsh : cp.execSync(`command -v ${pwsh}`, { encoding: 'utf8' }).trim())}:${process.env.PATH}`,
  XDG_CONFIG_HOME: configHome,
  CATI_E2E_FAKE_WINDOWS_SCHEDULER: '1',
  CATI_E2E_MOCK_STATE: stateFile,
  CATI_E2E_ENGINE_DIR: path.join(root, 'engine'),
  ELECTRON_ENABLE_LOGGING: '0'
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.NODE_OPTIONS;
// Playwright removes NODE_OPTIONS, so the main-process hook is passed with -r.
const mainPreloadArgs = ['-r', path.join(__dirname, 'electron-main-preload.js')];
const launchesLog = `${stateFile}.launches.log`;
function assertOfflineBrowser() {
  // Every engine browser must have been started through the offline simulator.
  const launched = fs.existsSync(launchesLog) ? fs.readFileSync(launchesLog, 'utf8').trim().split('\n').filter(Boolean) : [];
  assert(launched.length > 0, 'the engine browser was not routed through the offline Google simulator');
}

async function step(name, fn) {
  const started = Date.now();
  await fn();
  console.log(`  ok  ${name} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
}

function backgroundRun(extraArgs = []) {
  return new Promise(resolve => {
    const child = cp.spawn(electronBin, [...mainPreloadArgs, '--no-sandbox', root, '--background-run', ...extraArgs], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 8 * 60 * 1000);
    child.on('exit', code => { clearTimeout(timer); resolve({ code, out }); });
  });
}

(async () => {
  let app;
  const consoleErrors = [];
  try {
    app = await _electron.launch({ executablePath: electronBin, args: [...mainPreloadArgs, '--no-sandbox', root], env, timeout: 60000 });
    const hooked = await app.evaluate(() => String(process.env.NODE_OPTIONS || ''));
    assert(hooked.includes('preload.js'), `main-process test hook is not active (NODE_OPTIONS=${hooked})`);
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    });
    const win = await app.firstWindow();
    win.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    win.on('pageerror', e => consoleErrors.push(String(e)));
    const toastText = () => win.locator('#toastRegion').innerText().catch(() => '');
    const waitText = async (sel, re, timeout = 120000) => {
      await win.waitForFunction(([s, src]) => new RegExp(src, 'i').test(document.querySelector(s)?.textContent || ''), [sel, re.source], { timeout, polling: 250 })
        .catch(async e => { throw new Error(`${sel} never matched ${re}: "${await win.locator(sel).innerText().catch(() => '')}" toasts="${await toastText()}" (${e.message.split('\n')[0]})`); });
    };

    await step('first launch opens the guided setup', async () => {
      // First run asks what the teacher wants; lesson-plan turn-in opens the guided setup.
      await win.locator('#welcome:not(.hidden)').waitFor({ timeout: 30000 });
      await win.click('[data-welcome="turnin"]');
      await win.locator('#wizard:not(.hidden)').waitFor({ timeout: 30000 });
      await waitText('#wizStepLabel', /Step 1 of 5/);
    });
    await step('choose Classroom through the Google picker', async () => {
      await win.click('#wizSelectCourse');
      await waitText('#wizCourse', /MMHS Staff Lesson Plans/, 180000);
      assertOfflineBrowser();
      await waitText('#runStatus', /Found 2 topics/, 120000);
      await win.waitForFunction(() => !document.querySelector('#wizNext').disabled && !document.querySelector('#wizSelectCourse').disabled, null, { timeout: 60000 });
      const options = await win.locator('#wizTopic option').allTextContents();
      assert.deepStrictEqual(options.sort(), ['Archive 2025-26', TOPIC].sort(), `unexpected topic choices ${JSON.stringify(options)}`);
    });
    await step('choose the lesson-plan topic', async () => {
      await win.click('#wizNext');
      await waitText('#wizStepLabel', /Step 2 of 5/);
      await win.selectOption('#wizTopic', TOPIC);
      await win.click('#wizNext');
      await waitText('#wizStepLabel', /Step 3 of 5/);
    });
    await step('choose and check the Drive folder', async () => {
      await win.click('#wizSelectDrive');
      await waitText('#wizDrive', /Weekly Plans 26-27/, 180000);
      await win.waitForFunction(() => !document.querySelector('#wizScanDrive').disabled, null, { timeout: 60000 });
      await win.fill('#wizPlanExample', 'Week 03 - Lesson Plans');
      await win.click('#wizScanDrive');
      await waitText('#wizScanResult', /Found 5 matching plans/, 180000);
      await win.waitForFunction(() => !document.querySelector('#wizNext').disabled, null, { timeout: 60000 });
      await win.click('#wizNext');
      await waitText('#wizStepLabel', /Step 4 of 5/);
    });
    await step('set preferences', async () => {
      await win.fill('#wizAssignmentExample', 'Week 3 - Lesson Plans');
      await win.click('#wizNext');
      await waitText('#wizStepLabel', /Step 5 of 5/);
    });
    await step('run the Safety Check', async () => {
      await win.click('#wizRunTest');
      await win.waitForFunction(() => !document.querySelector('#wizFinish').disabled, null, { timeout: 240000 })
        .catch(async () => { throw new Error(`Safety Check did not pass. status="${await win.locator('#runStatus').innerText()}" toasts="${await toastText()}"\n${appLog().slice(-3000)}`); });
      assert.strictEqual(events('attach').length + events('submit-click').length, 0, 'Safety Check changed Classroom');
    });
    await step('finish setup and turn on automatic turn-in', async () => {
      await win.fill('#wizScheduleTime', '06:45');
      await win.click('#wizFinish');
      await win.locator('#wizardComplete:not(.hidden)').waitFor({ timeout: 120000 })
        .catch(async () => { throw new Error(`wizard did not complete. toasts="${await toastText()}"\n${appLog().slice(-2000)}`); });
      await waitText('#wizardCompleteText', /Automatic turn-in is on/);
      const t = tasks()['Classroom Auto Turn-In'];
      assert(t, 'Finishing setup did not register the Windows task');
      assert(/T06:45:00$/.test(String(t.Triggers[0].StartBoundary).replace(/^S\|/, '')), `task time is wrong: ${t.Triggers[0].StartBoundary}`);
      assert.strictEqual(t.Actions[0].Arguments.includes('--background-run'), true);
      const cfg = readJson('config.json');
      assert.strictEqual(cfg.dryRun, false, 'automatic submissions were not turned on');
      assert.strictEqual(cfg.setupComplete, true);
      assert.strictEqual(cfg.topicName, TOPIC);
      await win.click('#wizDone');
    });
    await step('Home reports ready', async () => {
      await win.click('[data-page="dashboard"]');
      await waitText('#dashPlans', /^5$/);
      await waitText('#readyCount', /8\/8/, 60000);
    });
    await step('Check now turns in the plan that is due today', async () => {
      await win.click('[data-page="automation"]');
      await waitText('#modeTitle', /ON/);
      await win.click('#runLive');
      await waitText('#runStatus', /successfully turned in 1 lesson plan/, 240000);
      const turned = events('turn-in');
      assert.deepStrictEqual(turned.map(e => [e.assignmentId, e.attachments]), [['600003', [fid(3)]]], `unexpected turn-ins: ${JSON.stringify(turned)}`);
      await win.click('[data-page="dashboard"]');
      await waitText('#dashSubmitted', /^1$/);
    });
    await step('settings page and pause/resume schedule round-trip', async () => {
      await win.click('[data-page="automation"]');
      await win.click('#removeSchedule');
      await win.locator('#confirmModal:not(.hidden) #confirmOk').click({ timeout: 5000 }).catch(() => {});
      await win.waitForFunction(() => true);
      await new Promise(r => setTimeout(r, 4000));
      assert(!tasks()['Classroom Auto Turn-In'], `pausing did not remove the task; toasts="${await toastText()}"`);
      await win.click('#installSchedule');
      await new Promise(r => setTimeout(r, 5000));
      assert(tasks()['Classroom Auto Turn-In'], `saving the schedule did not recreate the task; toasts="${await toastText()}"`);
    });
    assert.deepStrictEqual(consoleErrors.filter(e => !/Autofill|devtools/i.test(e)), [], 'renderer reported errors');
  } finally {
    if (app) await app.close().catch(() => {});
  }

  // Windows Task Scheduler runs the installed app with --background-run.
  await step('scheduled run with nothing due exits cleanly', async () => {
    const r = await backgroundRun();
    assert.strictEqual(r.code, 0, `background run exit ${r.code}\n${r.out.slice(-2000)}`);
    assert.strictEqual(events('turn-in').length, 1, 'a scheduled run turned in something unexpectedly');
  });

  await step('temporary network failure schedules one retry', async () => {
    edit(s => { const w6 = s.topics[1].items.find(i => i.id === '600006'); w6.dueOffsetDays = 0; s.drive.files.push({ id: fid(6), name: 'Week 06 - Lesson Plans', kind: 'gdoc' }); s.networkDown = true; });
    const r = await backgroundRun();
    assert.strictEqual(r.code, 0, `a retryable failure should exit quietly, got ${r.code}\n${appLog().slice(-2500)}`);
    const retry = tasks()['Classroom Auto Turn-In Retry 1'];
    assert(retry, `no retry task was registered\n${appLog().slice(-2500)}`);
    const args = retry.Actions[0].Arguments;
    assert(/--background-run --retry-attempt=1 --retry-chain=\S+/.test(args), `retry arguments are wrong: ${args}`);
    const state = readJson('retry-state.json');
    assert(state.active && state.nextAttempt === 1, `retry chain state is wrong: ${JSON.stringify(state)}`);
    edit(s => { s.networkDown = false; });
    const chain = /--retry-chain=(\S+)/.exec(args)[1];
    const r2 = await backgroundRun(['--retry-attempt=1', `--retry-chain=${chain}`]);
    assert.strictEqual(r2.code, 0, `retry run exit ${r2.code}\n${appLog().slice(-2500)}`);
    assert.deepStrictEqual(events('turn-in').map(e => e.assignmentId), ['600003', '600006'], `retry did not turn in Week 6: ${JSON.stringify(events('turn-in'))}`);
    assert(!tasks()['Classroom Auto Turn-In Retry 1'], 'the used retry task was not cleared');
    const done = readJson('retry-state.json');
    assert(!done.active, 'retry chain is still active after success');
    const stale = await backgroundRun(['--retry-attempt=1', `--retry-chain=${chain}`]);
    assert.strictEqual(stale.code, 0);
    assert.strictEqual(events('turn-in').length, 2, 'a stale retry acted');
    assert(/Stale retry attempt 1 was skipped safely/.test(appLog()), 'stale retry was not recognized');
  });

  fs.rmSync(temp, { recursive: true, force: true });
  console.log('UI end-to-end check passed: guided setup, Safety Check, turn-on, Check now, schedule pause/save, scheduled run, and retry chain.');
})().catch(e => {
  console.error(`UI end-to-end check FAILED: ${e.stack || e.message}\n(kept ${temp})`);
  process.exit(1);
});
