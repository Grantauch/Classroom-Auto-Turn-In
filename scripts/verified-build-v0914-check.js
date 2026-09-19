'use strict';
// Regression gate for the defects found by the v0.9.17 end-to-end run.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
process.env.CATI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cati-v0914-'));

const submit = read('engine/submit-weekly.js');
const actions = read('engine/classroom-actions.js');
const discovery = read('engine/classroom-discovery.js');
const browser = read('engine/browser.js');
const sched = read('main-services/scheduler-service.js');
const nsh = read('build/installer.nsh');
const main = read('main.js');
const ui = read('renderer/app.js');
const picker = read('engine/classroom-picker.js');
const drive = read('engine/scan-drive-folder.js');
const pkg = JSON.parse(read('package.json'));

// Safety Check probes: upcoming weeks first, several tries, never the first past week only.
assert(/SAFETY_PROBE_LIMIT=\d+/.test(submit) && submit.includes('const upcoming=') && submit.includes('const earlier='), 'Safety Check probe ordering regressed');
assert(!submit.includes('const probe=ineligible.find('), 'Safety Check reverted to a single oldest-week probe');
assert(submit.includes('function listedAsCompleted(') && submit.includes('async function openClassworkPage('), 'completed-card handling or Classwork fallback is missing');
assert(submit.includes("confirmedBy:'Classroom completed state while attaching'"), 'attach-phase completion by another computer is not recorded');

assert(submit.includes("savePageEvidence(page,'ERROR-run')") && fs.existsSync(path.join(root, 'engine/page-evidence.js')), 'stopped runs no longer save troubleshooting evidence');

// Real waits (Playwright ignores isVisible timeouts).
assert(/async function maybeClick[\s\S]{0,300}waitFor\(\{state:'visible'/.test(actions), 'maybeClick no longer waits for the control');
assert(actions.includes('async function findLinkEntryDialog(') && actions.includes('const scope=linkDialog?linkDialog.dialog:page;'), 'Link entry is no longer scoped to the dialog');
assert(!/input=page\.getByRole\('textbox'\)\.last\(\)/.test(actions), 'Link entry can fall back to any text box on the page');
assert(actions.includes('hasAction(p)'), 'Your work scope no longer prefers the panel action buttons');
assert(discovery.includes('TOPIC_WAIT_MS') && discovery.includes('async function markTopicSectionByHeading('), 'topic waiting or heading fallback is missing');
assert(drive.includes('waitForMatchingRows'), 'Drive scan no longer waits for the file list');

// Silent runs must not announce HeadlessChrome.
assert(browser.includes("ua.replace(/HeadlessChrome\\//g,'Chrome/')"), 'silent browser identity override is missing');

// Task Scheduler scripts: Constrained Language Mode safe, battery friendly.
for (const bad of ['[System.Security.Principal.WindowsIdentity]', '[DateTimeOffset]', '[pscustomobject]']) assert(!sched.includes(bad), `scheduler script uses ${bad}, which Constrained Language Mode blocks`);
assert(sched.includes('-AllowStartIfOnBatteries') && sched.includes('-DontStopIfGoingOnBatteries'), 'scheduled tasks can be skipped on battery power');

// Upgrades keep the schedule; real uninstalls remove it.
assert(/\$\{ifNot\} \$\{isUpdated\}[\s\S]*schtasks\.exe \/Delete[\s\S]*\$\{endIf\}/.test(nsh), 'uninstall hook deletes scheduled tasks during upgrades');

// Notifications need the installer's app ID.
assert(main.includes(`app.setAppUserModelId('${pkg.build.appId}')`), 'Windows app user model ID does not match the installer appId');

// Build configuration.
assert.strictEqual(pkg.build.publish, null, 'publishing must stay disabled so a GitHub token cannot break the build');
assert(pkg.scripts['check:e2e'] && pkg.scripts['check:deep'].includes('scheduler-powershell-check.js'), 'end-to-end or PowerShell gates are not wired into npm scripts');
for (const bat of ['BUILD-SETUP-EXE.bat', 'BUILD-WINDOWS.bat', 'PREPARE-RC-LOCKFILE.bat', 'RUN-PRE-FLIGHT-TESTS.bat']) {
  const raw = fs.readFileSync(path.join(root, bat));
  assert(!/(^|[^\r])\n/.test(raw.toString('latin1')), `${bat} must use Windows line endings`);
}
assert(read('BUILD-SETUP-EXE.bat').includes('npm run check:e2e') && read('RUN-PRE-FLIGHT-TESTS.bat').includes('npm run check:e2e'), 'Windows builders skip the end-to-end suite');

// Setup wizard.
assert(ui.includes('function renderTopicChoices(') && !ui.includes("sel.innerHTML='';const o=document.createElement('option');o.textContent=cfg.topicName"), 'discovered topics are still reset to one guessed name');
assert(/setupBrowserButtonIds=\[[^\]]*'wizNext'[^\]]*'runLive'/.test(ui), 'wizard buttons are not locked while a Google setup window is open');
assert(picker.includes('NOT_A_COURSE_NAME') && /Stream\|Classwork\|People/.test(picker), 'tab labels can still be saved as the Classroom name');

// Behavior.
const lib = require('../engine/lib');
const ymd = d => d && `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const wed = new Date(2026, 8, 16, 7, 0); // Wednesday
for (const [text, want] of [['Due Friday', '2026-09-18'], ['Due Fri, Sep 25', '2026-09-25'], ['Due today at 11:59 PM', '2026-09-16'], ['Due tomorrow', '2026-09-17'], ['Due Wednesday', '2026-09-23'], ['Due Sat 9/26', null], ['Turned in', null]]) {
  assert.strictEqual(ymd(lib.parseClassroomDueDate(text, wed)), want, text);
}
const weekdays = { submitOverdue: false, schedule: { days: ['MON', 'TUE', 'WED', 'THU', 'FRI'] } };
const fri = new Date(2026, 8, 18, 6, 30);
assert.strictEqual(lib.assignmentEligibility({ cardText: 'Due Sep 20' }, null, weekdays, fri).eligible, true, 'Sunday due date is not turned in at the Friday check');
assert.strictEqual(lib.assignmentEligibility({ cardText: 'Due Sep 19' }, null, weekdays, fri).eligible, true, 'Saturday due date is not turned in at the Friday check');
assert.strictEqual(lib.assignmentEligibility({ cardText: 'Due Sep 21' }, null, weekdays, fri).eligible, false, 'Monday due date must wait for the Monday check');
assert.strictEqual(lib.assignmentEligibility({ cardText: 'Due Sep 20' }, null, weekdays, wed).eligible, false, 'a Sunday due date is not due on Wednesday');
assert.strictEqual(lib.assignmentEligibility({ cardText: 'Due Sep 15' }, null, weekdays, wed).eligible, false, 'past due must wait for overdue catch-up');
assert.strictEqual(lib.assignmentEligibility({ cardText: 'Due Sep 15' }, null, { ...weekdays, submitOverdue: true }, wed).eligible, true);
const noDue = lib.assignmentEligibility({ cardText: 'Week 9 - Lesson Plans No due date' }, null, weekdays, wed);
assert.strictEqual(noDue.eligible, false); assert.strictEqual(noDue.unknown, false);
assert.strictEqual(lib.assignmentEligibility({ cardText: 'Week 9 - Lesson Plans' }, null, weekdays, wed).unknown, true, 'a missing date must still block');
const { classroomDisplayName } = require('../engine/classroom-picker');
assert.strictEqual(classroomDisplayName({ courseName: 'Stream', title: 'MMHS Staff Lesson Plans - Google Classroom' }), 'MMHS Staff Lesson Plans');

fs.rmSync(process.env.CATI_DATA_DIR, { recursive: true, force: true });
console.log('v0.9.17 verified-build regression checks passed.');
