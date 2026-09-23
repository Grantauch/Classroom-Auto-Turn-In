'use strict';
// End-to-end release gate for the Classroom/Drive automation engine.
//
// Runs the real engine helper processes (through the same engine runner the
// desktop app uses, with Electron in node mode) and a real Chrome/Edge browser
// against an offline Google Classroom/Drive simulator. Nothing touches the
// network or a real Google account.
//
// Usage: node scripts/e2e/engine-e2e-check.js [--only=name,name] [--engine-dir=<packaged resources/app.asar/engine>] [--exec=<packaged app binary>]
// With --engine-dir and --exec the helper processes run from inside a packaged
// app (asar archive, unpacked Playwright) exactly as the installed app runs them.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2);
const opt = name => (argv.find(a => a.startsWith(`--${name}=`)) || '').slice(name.length + 3);
const only = new Set(opt('only').split(',').filter(Boolean));
const appDir = root;
const execPath = opt('exec') ? path.resolve(opt('exec')) : defaultElectron();
const engineDir = opt('engine-dir') ? path.resolve(opt('engine-dir')) : path.join(appDir, 'engine');
const req = rel => require(path.join(appDir, rel));
const forceHeadless = process.env.CATI_E2E_HEADLESS === '1';

function defaultElectron() {
  try { return require(path.join(root, 'node_modules', 'electron')); } catch { return process.execPath; }
}

const { createEngineRunner } = req('main-services/engine-runner.js');
const { createLocalData } = req('main-services/local-data.js');
const { createAiService } = req('main-services/ai-service.js');
const { lastPayload, events: protocolEvents } = req('engine/protocol.js');
const { computeSafetyFingerprint, assertUniquePlans } = req('engine/safety.js');
const { publicError } = req('engine/user-errors.js');
const { readState, writeState } = require('./mock-google');

const COURSE_ID = 'NzQxMjM0NTY3ODkw';
const FOLDER_ID = '1WeeklyPlansFolder2627abcdefghij';
const TOPIC = 'Lesson Plans - Teaching Staff Only';
const fid = w => `1PlanFile${String(w).padStart(2, '0')}AbCdEfGhIjKlMnOpQrStU`;

function baseState(overrides = {}) {
  const files = [1, 2, 3, 4, 5].map(w => ({ id: fid(w), name: `Week ${String(w).padStart(2, '0')} - Lesson Plans`, kind: 'gdoc' }));
  const planItem = (w, dueOffsetDays, status = 'assigned', attachments = []) => ({ id: String(600000 + w), title: `Week ${w} - Lesson Plans`, dueOffsetDays, status, attachments, materials: [{ fileId: '1TemplateDocForStaffAbCdEfGhIjKlMn' }] });
  return {
    signedIn: true,
    account: { name: 'Test Teacher' },
    course: { id: COURSE_ID, name: 'MMHS Staff Lesson Plans', section: '2026-27' },
    classworkVariant: 'region-topic-prefix',
    itemLinkVariant: 'expand',
    renderDelayMs: 350,
    attachDelayMs: 700,
    confirmDialog: true,
    linkInputType: 'url',
    privateCommentLink: true,
    topics: [
      { id: 't-archive', name: 'Archive 2025-26', items: [{ id: '500003', title: 'Week 3 - Lesson Plans', dueOffsetDays: 0, status: 'assigned', attachments: [] }] },
      { id: 't-plans', name: TOPIC, items: [planItem(5, 14), planItem(4, 7), planItem(3, 0), planItem(2, -7, 'turned_in', [{ fileId: fid(2) }]), planItem(1, -14, 'turned_in', [{ fileId: fid(1) }])] },
      { id: 't-pd', name: 'Professional Development', items: [{ id: '800001', title: 'PD reflection', dueOffsetDays: 3, status: 'assigned', attachments: [] }] }
    ],
    noTopicItems: [{ id: '700003', title: 'Week 3 - Lesson Plans', dueOffsetDays: 0, status: 'assigned', attachments: [] }],
    drive: { folderId: FOLDER_ID, folderName: 'Weekly Plans 26-27', files, exposeHref: false, virtualized: true },
    otherDocs: [{ id: '1TemplateDocForStaffAbCdEfGhIjKlMn', name: 'Lesson Plan Template', kind: 'gdoc' }, { id: '1SomeOtherDocumentAbCdEfGhIjKlMno', name: 'Sub Plans', kind: 'gdoc' }],
    events: [],
    ...overrides
  };
}
function planItem(state, week) { return state.topics.find(t => t.name === TOPIC).items.find(i => i.title === `Week ${week} - Lesson Plans`); }
function editState(file, fn) { const s = readState(file); fn(s); writeState(file, s); }

function makeHarness(name, state) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cati-e2e-${name}-`));
  const userData = path.join(dir, 'userData');
  fs.mkdirSync(userData, { recursive: true });
  const stateFile = path.join(dir, 'google-state.json');
  writeState(stateFile, state);
  const localData = createLocalData(() => userData);
  let headless = forceHeadless;
  const env = () => ({
    ...process.env,
    CATI_DATA_DIR: localData.dataDir(),
    ELECTRON_RUN_AS_NODE: '1',
    CATI_BACKGROUND_MODE: headless ? '1' : '0',
    CATI_E2E_MOCK_STATE: stateFile,
    CATI_E2E_BUNDLED_BROWSER: process.platform === 'win32' ? '0' : '1',
    CATI_E2E_ENGINE_DIR: engineDir,
    NODE_OPTIONS: `--require ${JSON.stringify(path.join(__dirname, 'preload.js'))}`
  });
  const runner = createEngineRunner({ engineDir, execPath, envProvider: env });
  const run = (file, args = []) => runner.run(file, args, { broadcast: false }).then(out => ({ ok: true, out, exitCode: 0 }), err => ({ ok: false, err, out: err.output || '', exitCode: err.exitCode }));
  const ai = createAiService({ safeStorage: { isEncryptionAvailable: () => false }, localData, ensureAutomationIdle() {}, runNodeScript: (file, args, broadcast) => runner.run(file, args, { broadcast }), lastPayload, acquireLock() { return {}; }, releaseLock() {}, runAutomation() {}, userSafeError: (op, e) => publicError(e, op), compactError: e => String(e?.message || e), getMainWindow: () => null });
  const h = {
    name, dir, userData, stateFile, localData,
    setHeadless(v) { headless = v; },
    state: () => readState(stateFile),
    events: type => (readState(stateFile).events || []).filter(e => !type || e.type === type),
    configure(extra = {}) {
      const cfg = localData.loadConfig();
      return localData.saveConfig({ ...cfg, courseUrl: `https://classroom.google.com/c/${COURSE_ID}`, courseDisplayName: 'MMHS Staff Lesson Plans', topicName: TOPIC, driveFolderUrl: `https://drive.google.com/drive/folders/${FOLDER_ID}`, driveFolderName: 'Weekly Plans 26-27', ...extra });
    },
    scan: () => ai.scanAndSaveDrivePlans(),
    run,
    // Mirrors main.js runAutomation(): a dry run must emit a certificate whose
    // fingerprint matches the saved setup before automatic turn-in may start.
    async safetyCheck() {
      // The app runs the Safety Check in a visible browser. Build machines can
      // force background mode with CATI_E2E_HEADLESS=1.
      headless = forceHeadless;
      const r = await run('submit-weekly.js', ['--dry-run']);
      r.result = lastPayload(r.out, 'run-result');
      r.cert = lastPayload(r.out, 'dry-cert');
      if (r.ok && r.cert) {
        const cfg = localData.loadConfig(), plans = localData.loadPlans();
        assertUniquePlans(plans);
        assert.strictEqual(r.cert.fingerprint, computeSafetyFingerprint(cfg, plans), 'certificate fingerprint must match saved setup');
        cfg.lastDryRunOkAt = new Date().toISOString();
        cfg.safetyCertification = { ...r.cert, passedAt: cfg.lastDryRunOkAt };
        localData.saveConfig(cfg);
      }
      return r;
    },
    setLive() { const cfg = localData.loadConfig(); cfg.dryRun = false; localData.saveConfig(cfg); assert.strictEqual(localData.loadConfig().dryRun, false, 'live mode did not persist'); },
    async live() {
      headless = true;
      const r = await run('submit-weekly.js');
      r.result = lastPayload(r.out, 'run-result');
      return r;
    },
    log() { const d = path.join(localData.dataDir(), 'logs'); return fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.endsWith('.log')).map(f => fs.readFileSync(path.join(d, f), 'utf8')).join('\n') : ''; },
    cleanup() { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
  };
  return h;
}

function explain(h, r) {
  const lines = String(r.out || '').split(/\r?\n/).filter(l => l && !l.startsWith('CATI_EVENT:')).slice(-40).join('\n');
  return `\n--- ${h.name}: exit=${r.exitCode} ok=${r.ok}\nresult=${JSON.stringify(r.result || lastPayload(r.out, 'run-result'), null, 1)}\n--- engine output tail ---\n${lines}\n--- mock events ---\n${JSON.stringify(h.events(), null, 1)}`;
}
function expectCertified(h, r, week) {
  assert(r.ok, `Safety Check failed${explain(h, r)}`);
  assert(r.cert && Array.isArray(r.cert.verified) && r.cert.verified.length === 1, `Safety Check produced no certificate${explain(h, r)}`);
  if (week !== undefined) assert.strictEqual(Number(r.cert.verified[0].week), week, `Safety Check certified the wrong week${explain(h, r)}`);
  assert.deepStrictEqual(h.events().filter(e => e.type !== 'nav'), [], `Safety Check mutated Classroom${explain(h, r)}`);
  assert(h.localData.loadConfig().safetyCertification, 'certificate was not saved');
}

const scenarios = [];
const scenario = (name, fn) => scenarios.push({ name, fn });

scenario('happy-path', async h => {
  h.configure();
  const plans = await h.scan();
  assert.deepStrictEqual(plans.map(p => p.week), [1, 2, 3, 4, 5], 'Drive scan did not find all five weekly plans');
  for (const p of plans) assert(p.url.includes(fid(p.week)), `Week ${p.week} resolved to the wrong Drive file: ${p.url}`);
  const dry = await h.safetyCheck();
  expectCertified(h, dry, 3);
  h.setLive();
  const live = await h.live();
  assert(live.ok && live.result.status === 'SUCCESS' && live.result.submitted === 1, `live run did not submit Week 3${explain(h, live)}`);
  const turnIns = h.events('turn-in');
  assert.strictEqual(turnIns.length, 1, `expected exactly one turn-in${explain(h, live)}`);
  assert.strictEqual(turnIns[0].assignmentId, '600003', `wrong assignment turned in${explain(h, live)}`);
  assert.deepStrictEqual(turnIns[0].attachments, [fid(3)], `wrong attachment set turned in${explain(h, live)}`);
  assert.strictEqual(h.events('attach').length, 1, 'plan was attached more than once');
  assert.strictEqual(h.events('duplicate-submit').length, 0, 'duplicate submission');
  const st = h.localData.loadState();
  const rec = st.submissions[`${COURSE_ID}:600003`];
  assert(rec && rec.confirmed && rec.detected === false, `submission was not recorded as confirmed: ${JSON.stringify(rec)}`);
  const again = await h.live();
  assert(again.ok && again.result.status === 'NO_ACTION', `second live run should do nothing${explain(h, again)}`);
  assert.strictEqual(h.events('turn-in').length, 1, 'second run turned something in');
  assert.strictEqual(h.events('submit-click').length, 1, 'second run clicked a submission control');
  const launches = fs.readFileSync(`${h.stateFile}.launches.log`, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert(launches.some(l => l.headless === true) && (forceHeadless || launches.some(l => l.headless === false)), 'expected both visible Safety Check and silent scheduled browser launches');
  const agents = [...new Set((h.state().requests || []).filter(r => r.type === 'nav').map(r => r.ua))];
  assert(agents.length && agents.every(ua => /Chrome\//.test(ua) && !/Headless/i.test(ua)), `Google saw a headless browser identity: ${JSON.stringify(agents)}`);
});

scenario('midweek-setup-future-week', async h => {
  // Keep the due date far enough away that at least one normal weekday check
  // always remains before it, regardless of the calendar date of this test.
  editState(h.stateFile, s => { planItem(s, 3).dueOffsetDays = 7; });
  h.configure();
  await h.scan();
  const dry = await h.safetyCheck();
  expectCertified(h, dry, 3);
  h.setLive();
  const live = await h.live();
  assert(live.ok && live.result.status === 'NO_ACTION', `nothing is due, so the live run must not act${explain(h, live)}`);
  assert.strictEqual(h.events('attach').length + h.events('submit-click').length, 0, 'future assignment was touched');
});

scenario('all-caught-up-safety-uses-next-week', async h => {
  editState(h.stateFile, s => { const w3 = planItem(s, 3); w3.status = 'turned_in'; w3.attachments = [{ fileId: fid(3) }]; w3.dueOffsetDays = -1; });
  h.configure();
  await h.scan();
  const dry = await h.safetyCheck();
  expectCertified(h, dry, 4);
});

scenario('plan-already-attached-by-teacher', async h => {
  editState(h.stateFile, s => { planItem(s, 3).attachments = [{ fileId: fid(3) }]; });
  h.configure();
  await h.scan();
  expectCertified(h, await h.safetyCheck(), 3);
  h.setLive();
  const live = await h.live();
  assert(live.ok && live.result.submitted === 1, `live run should finish the already-attached plan${explain(h, live)}`);
  assert.strictEqual(h.events('attach').length, 0, 'plan was attached a second time');
  assert.deepStrictEqual(h.events('turn-in').map(e => e.attachments), [[fid(3)]], `wrong turn-in${explain(h, live)}`);
});

scenario('unexpected-attachment-blocks', async h => {
  editState(h.stateFile, s => { planItem(s, 3).attachments = [{ fileId: '1SomeOtherDocumentAbCdEfGhIjKlMno' }]; });
  h.configure();
  await h.scan();
  const dry = await h.safetyCheck();
  assert(!dry.ok && dry.result.status === 'BLOCKED', `unexpected attachment must block the Safety Check${explain(h, dry)}`);
  assert.strictEqual(publicError(dry.result.message, 'automation:run').code, 'AT-ATT-101', `wrong support code${explain(h, dry)}`);
  assert.strictEqual(h.events('submit-click').length + h.events('attach').length, 0, 'mutation during blocked Safety Check');
  assert(/Page outline \(ERROR-run\): .*Your work/.test(h.log()), 'a stopped check did not record its page outline');
  const shots = fs.readdirSync(path.join(h.localData.dataDir(), 'logs')).filter(f => /ERROR-run\.png$/.test(f));
  assert(shots.length === 1, `a stopped check did not save one troubleshooting screenshot: ${shots}`);
});

scenario('unexpected-attachment-live', async h => {
  h.configure();
  await h.scan();
  expectCertified(h, await h.safetyCheck(), 3);
  h.setLive();
  editState(h.stateFile, s => { planItem(s, 3).attachments = [{ externalUrl: 'https://example.org/not-a-plan', title: 'Not a plan' }]; });
  const live = await h.live();
  assert(!live.ok && live.result.status === 'BLOCKED' && live.result.retryable === false, `live run must block on the unexpected attachment${explain(h, live)}`);
  assert.strictEqual(h.events('submit-click').length + h.events('attach').length, 0, `nothing may be attached or submitted${explain(h, live)}`);
});

scenario('duplicate-drive-plan', async h => {
  editState(h.stateFile, s => { s.drive.files.push({ id: '1DuplicateWeek3PlanAbCdEfGhIjKlMn', name: 'Week 3 - Lesson Plans', kind: 'docx' }); });
  h.configure();
  let error = null;
  try { await h.scan(); } catch (e) { error = e; }
  assert(error, 'duplicate Drive files must stop the scan');
  assert.strictEqual(publicError(error, 'drive:scan-folder').code, 'AT-DRV-105', `wrong support code for duplicate plan: ${error.message}`);
});

scenario('duplicate-assignment-in-topic', async h => {
  editState(h.stateFile, s => { s.topics.find(t => t.name === TOPIC).items.push({ id: '600099', title: 'Week 3 - Lesson Plans', dueOffsetDays: 0, status: 'assigned', attachments: [] }); });
  h.configure();
  await h.scan();
  const dry = await h.safetyCheck();
  assert(!dry.ok && dry.result.status === 'BLOCKED', `duplicate assignment must block${explain(h, dry)}`);
  assert.strictEqual(publicError(dry.result.message, 'automation:run').code, 'AT-CLS-111', `wrong support code${explain(h, dry)}`);
});

scenario('signed-out', async h => {
  h.configure();
  await h.scan();
  expectCertified(h, await h.safetyCheck(), 3);
  h.setLive();
  editState(h.stateFile, s => { s.signedIn = false; });
  const live = await h.live();
  assert(!live.ok && live.result.status === 'BLOCKED' && live.result.retryable === false, `signed-out run must block without retry${explain(h, live)}`);
  assert.strictEqual(publicError(live.result.message, 'automation:run').code, 'AT-GGL-101', `wrong support code${explain(h, live)}`);
});

scenario('network-down-is-retryable', async h => {
  h.configure();
  await h.scan();
  expectCertified(h, await h.safetyCheck(), 3);
  h.setLive();
  editState(h.stateFile, s => { s.networkDown = true; });
  const live = await h.live();
  assert(!live.ok && live.result.status === 'FAILED' && live.result.retryable === true && live.result.errorType === 'TRANSIENT', `network outage must be a retryable failure${explain(h, live)}`);
  editState(h.stateFile, s => { s.networkDown = false; });
  const retry = await h.live();
  assert(retry.ok && retry.result.submitted === 1, `retry after recovery must submit${explain(h, retry)}`);
});

scenario('other-computer-finishes-first', async h => {
  h.configure();
  await h.scan();
  expectCertified(h, await h.safetyCheck(), 3);
  h.setLive();
  editState(h.stateFile, s => { s.otherComputerCompletesAfterAttach = '600003'; });
  const live = await h.live();
  assert(live.ok, `run should end cleanly${explain(h, live)}`);
  assert.strictEqual(h.events('submit-click').length, 0, `no submission click may happen after another computer finished${explain(h, live)}`);
  assert.strictEqual(live.result.submitted, 0, 'must not count another computer\'s submission');
});

scenario('classroom-does-not-confirm', async h => {
  h.configure();
  await h.scan();
  expectCertified(h, await h.safetyCheck(), 3);
  h.setLive();
  editState(h.stateFile, s => { s.ignoreTurnIn = true; });
  const live = await h.live();
  assert(!live.ok && live.result.status !== 'SUCCESS', `unconfirmed turn-in must not be reported as success${explain(h, live)}`);
  assert.strictEqual(publicError(live.result.message, 'automation:run').code, 'AT-SUB-102', `wrong support code${explain(h, live)}`);
  const rec = h.localData.loadState().submissions[`${COURSE_ID}:600003`];
  assert(!rec || rec.confirmed !== true, 'unconfirmed turn-in was recorded as confirmed');
});

scenario('no-confirmation-dialog-variant', async h => {
  editState(h.stateFile, s => { s.confirmDialog = false; s.linkInputType = 'text'; s.itemLinkVariant = 'title-link'; s.addAsDivButton = true; s.attachmentIdAttr = true; });
  h.configure();
  await h.scan();
  expectCertified(h, await h.safetyCheck(), 3);
  h.setLive();
  const live = await h.live();
  assert(live.ok && live.result.submitted === 1, `variant layout should still submit${explain(h, live)}`);
  assert.deepStrictEqual(h.events('turn-in').map(e => e.attachments), [[fid(3)]]);
});

scenario('topic-region-without-prefix', async h => {
  editState(h.stateFile, s => { s.classworkVariant = 'region-plain'; });
  h.configure();
  await h.scan();
  expectCertified(h, await h.safetyCheck(), 3);
});

scenario('topic-heading-only-layout', async h => {
  editState(h.stateFile, s => { s.classworkVariant = 'heading-only'; });
  h.configure();
  await h.scan();
  const dry = await h.safetyCheck();
  expectCertified(h, dry, 3);
  h.setLive();
  const live = await h.live();
  assert(live.ok && live.result.submitted === 1, `heading-only layout should submit the topic's Week 3${explain(h, live)}`);
  assert.deepStrictEqual(h.events('turn-in').map(e => e.assignmentId), ['600003'], 'wrong assignment in heading-only layout');
});

scenario('due-date-formats-and-status-labels', async h => {
  editState(h.stateFile, s => { s.dueWithTime = true; s.lowercaseRelative = true; s.listShowsStatusInsteadOfDue = true; s.topics.find(t => t.name === TOPIC).items.push({ id: '600010', title: 'Week 10 - Lesson Plans', dueOffsetDays: null, status: 'assigned', attachments: [] }); s.drive.files.push({ id: fid(10), name: 'Week 10 - Lesson Plans', kind: 'docx' }); });
  h.configure();
  await h.scan();
  const dry = await h.safetyCheck();
  expectCertified(h, dry, 3);
  h.setLive();
  const live = await h.live();
  assert(live.ok && live.result.status === 'SUCCESS' && live.result.submitted === 1, `due-date variants should not block${explain(h, live)}`);
});

scenario('collapsed-card-detail-date-fallback', async h => {
  editState(h.stateFile, s => { s.listHidesDueDates = true; s.numericDetailDueDates = true; });
  h.configure({ earliestWeek: 3, latestWeek: 3 });
  await h.scan();
  const dry = await h.safetyCheck();
  expectCertified(h, dry, 3);
  assert(/verified assignment detail page/.test(h.log()), `detail due-date source was not recorded${explain(h, dry)}`);
  h.setLive();
  const live = await h.live();
  assert(live.ok && live.result.status === 'SUCCESS' && live.result.submitted === 1, `numeric detail-page due date should allow Week 3${explain(h, live)}`);
  assert.deepStrictEqual(h.events('turn-in').map(e => e.assignmentId), ['600003']);
});

scenario('due-date-unreadable-after-detail-fallback', async h => {
  editState(h.stateFile, s => { s.listHidesDueDates = true; s.detailHidesDueDates = true; });
  h.configure({ earliestWeek: 3, latestWeek: 3 });
  await h.scan();
  const dry = await h.safetyCheck();
  assert(!dry.ok && dry.result.status === 'BLOCKED', `unreadable card and detail due date must stop safely${explain(h, dry)}`);
  assert.strictEqual(publicError(dry.result.blockers?.[0]?.message, 'automation:run').code, 'AT-CLS-110', `wrong support code${explain(h, dry)}`);
  assert(/Week 3/.test(dry.result.blockers?.[0]?.message||''), `due-date blocker lost the week number${explain(h, dry)}`);
  assert.strictEqual(h.events('attach').length + h.events('submit-click').length, 0, 'unreadable due date mutated Classroom');
});

scenario('due-on-a-day-without-a-check', async h => {
  const codes = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const today = codes[new Date().getDay()];
  editState(h.stateFile, s => { s.weekdayLabels = true; planItem(s, 3).dueOffsetDays = 2; });
  // Only today is a check day, so today is the last check before Week 3 is due.
  h.configure({ schedule: { time: '06:30', days: [today], enabled: false } });
  await h.scan();
  expectCertified(h, await h.safetyCheck(), 3);
  h.setLive();
  const live = await h.live();
  assert(live.ok && live.result.submitted === 1, `Week 3 should be turned in at the last check before its due day${explain(h, live)}`);
  assert.deepStrictEqual(h.events('turn-in').map(e => e.assignmentId), ['600003']);
});

scenario('due-later-with-a-check-before-it', async h => {
  const codes = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const d = new Date();
  const today = codes[d.getDay()], tomorrow = codes[(d.getDay() + 1) % 7];
  editState(h.stateFile, s => { s.weekdayLabels = true; planItem(s, 3).dueOffsetDays = 2; });
  h.configure({ schedule: { time: '06:30', days: [today, tomorrow], enabled: false } });
  await h.scan();
  expectCertified(h, await h.safetyCheck(), 3);
  h.setLive();
  const live = await h.live();
  assert(live.ok && live.result.status === 'NO_ACTION', `a later check can still turn Week 3 in on time, so nothing should happen today${explain(h, live)}`);
  assert.strictEqual(h.events('attach').length + h.events('submit-click').length, 0);
});

scenario('slow-classroom-rendering', async h => {
  editState(h.stateFile, s => { s.renderDelayMs = 4500; s.attachDelayMs = 2500; });
  h.configure();
  await h.scan();
  expectCertified(h, await h.safetyCheck(), 3);
  h.setLive();
  const live = await h.live();
  assert(live.ok && live.result.submitted === 1, `slow page rendering should still complete${explain(h, live)}`);
});

scenario('topic-discovery-variants', async h => {
  h.configure();
  for (const variant of ['region-topic-prefix', 'region-plain', 'heading-only']) {
    editState(h.stateFile, s => { s.classworkVariant = variant; s.renderDelayMs = 1500; });
    const r = await h.run('discover-topics.js');
    const topics = lastPayload(r.out, 'topics');
    assert(r.ok && Array.isArray(topics), `topic discovery failed for ${variant}${explain(h, r)}`);
    for (const name of [TOPIC, 'Archive 2025-26', 'Professional Development']) assert(topics.includes(name), `${variant}: topic list is missing "${name}": ${JSON.stringify(topics)}`);
    if (variant !== 'heading-only') assert.strictEqual(topics.length, 3, `${variant}: only real topics should be listed: ${JSON.stringify(topics)}`);
  }
});

scenario('live-requires-certificate', async h => {
  h.configure();
  await h.scan();
  const cfg = h.localData.loadConfig();
  cfg.dryRun = false;
  h.localData.saveConfig(cfg);
  const live = await h.live();
  assert(!live.ok && live.result.status === 'BLOCKED', `live run without Safety Check must block${explain(h, live)}`);
  assert.strictEqual(publicError(live.result.message, 'automation:run').code, 'AT-SAFE-101');
  assert.strictEqual(h.events('attach').length + h.events('submit-click').length, 0);
});

(async () => {
  const selected = scenarios.filter(s => !only.size || only.has(s.name));
  assert(selected.length, 'no scenarios selected');
  let failed = 0;
  for (const s of selected) {
    const h = makeHarness(s.name, baseState());
    const started = Date.now();
    try {
      await s.fn(h);
      console.log(`PASS ${s.name} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
      if (process.env.CATI_E2E_VERBOSE) console.log(h.log());
      h.cleanup();
    } catch (e) {
      failed++;
      console.log(`FAIL ${s.name}: ${e.message}\n(kept ${h.dir})`);
      const log = h.log();
      if (log) console.log(`--- app log tail ---\n${log.split('\n').slice(-25).join('\n')}`);
    }
  }
  if (failed) { console.error(`Engine end-to-end checks FAILED: ${failed} of ${selected.length} scenario(s).`); process.exit(1); }
  console.log(`Engine end-to-end checks passed: ${selected.length} scenario(s) against the offline Classroom/Drive simulator (${path.basename(execPath)}).`);
})().catch(e => { console.error(e); process.exit(1); });
