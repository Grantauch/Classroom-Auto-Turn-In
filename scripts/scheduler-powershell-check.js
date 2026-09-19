'use strict';
// Runs the exact Task Scheduler PowerShell that the app generates against
// in-process mock ScheduledTasks cmdlets. It proves the scripts parse, bind
// their parameters, work in Constrained Language Mode, and that the health
// parser understands what they register. Nothing touches the real Windows Task
// Scheduler: the mock functions shadow the real cmdlets inside each process.
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const assert = require('assert');

function findShell() {
  const names = process.platform === 'win32' ? ['powershell.exe', 'pwsh.exe'] : ['pwsh'];
  const extra = process.env.CATI_PWSH ? [process.env.CATI_PWSH] : [];
  for (const name of [...extra, ...names]) {
    const r = cp.spawnSync(name, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], { encoding: 'utf8', timeout: 30000 });
    if (!r.error && r.status === 0) return name;
  }
  return null;
}
const shell = findShell();
if (!shell) {
  if (process.platform === 'win32') { console.error('Scheduler PowerShell check FAILED: PowerShell was not found.'); process.exit(1); }
  console.log('Scheduler PowerShell check skipped: PowerShell (pwsh) is not installed on this non-Windows host.');
  process.exit(0);
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cati-sched-ps-'));
const registry = path.join(temp, 'tasks.json');
fs.writeFileSync(registry, '{}');
const scripts = [];

// Mock ScheduledTasks module. Defined in full language mode, then the app's
// own script runs in Constrained Language Mode.
const { buildPrelude } = require('./e2e/mock-task-scheduler');
const prelude = buildPrelude(registry);

const realSpawn = cp.spawn;
cp.spawn = (cmd, args, opts) => {
  if (cmd !== 'powershell.exe') return realSpawn(cmd, args, opts);
  const i = args.indexOf('-Command');
  assert(i >= 0, 'scheduler must pass its script with -Command');
  const script = args[i + 1];
  scripts.push(script);
  const file = path.join(temp, `run-${scripts.length}.ps1`);
  fs.writeFileSync(file, `${prelude}\n${script}\n`);
  return realSpawn(shell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], { ...opts, windowsHide: true });
};

const { createSchedulerService } = require('../main-services/scheduler-service');
const { createLocalData } = require('../main-services/local-data');
const { schedulePoints, retryOffsets, triggerStartTime } = require('../engine/scheduler');
const { nextRetryPlan, isRetryChainFresh } = require('../engine/retry-policy');
const { publicError } = require('../engine/user-errors');

const userData = path.join(temp, 'userData');
const localData = createLocalData(() => userData);
let machine = { role: 'primary', backupDelayMinutes: 60 };
const exe = 'C:\\Users\\teacher\\AppData\\Local\\Programs\\Classroom Auto Turn-In\\Classroom Auto Turn-In.exe';
Object.defineProperty(process, 'execPath', { value: exe });
const service = createSchedulerService({
  app: { isPackaged: true, getAppPath: () => 'C:\\app' }, localData, logger: () => {}, userSafeError: (op, e) => publicError(e, op), compactError: e => String(e?.message || e),
  schedulePoints, retryOffsets, triggerStartTime, nextRetryPlan, isRetryChainFresh, getMachine: () => machine, platform: 'win32'
});
const tasks = () => {
  const all = JSON.parse(fs.readFileSync(registry, 'utf8').replace(/^\uFEFF/, ''));
  for (const t of Object.values(all)) for (const tr of t.Triggers || []) tr.StartBoundary = String(tr.StartBoundary).replace(/^S\|/, '');
  return all;
};

(async () => {
  const cfg = localData.loadConfig();
  cfg.schedule = { ...cfg.schedule, time: '06:30', days: ['MON', 'TUE', 'WED', 'THU', 'FRI'] };
  localData.saveConfig(cfg);

  const installed = await service.installSchedule();
  assert(installed.health.healthy, `fresh schedule should be healthy: ${JSON.stringify(installed.health)}`);
  let t = tasks()['Classroom Auto Turn-In'];
  assert(t, 'primary task was not registered');
  assert.strictEqual(t.Actions[0].Execute, exe);
  assert.strictEqual(t.Actions[0].Arguments, '--background-run');
  assert.strictEqual(t.Triggers[0].DaysOfWeek, 62, 'weekday mask should be Mon-Fri');
  assert(/T06:30:00$/.test(t.Triggers[0].StartBoundary), `unexpected start ${t.Triggers[0].StartBoundary}`);
  assert.strictEqual(t.Principal.LogonType, 'Interactive');
  assert.strictEqual(t.Principal.RunLevel, 'Limited');
  assert(/\\/.test(t.Principal.UserId), `principal should be DOMAIN\\user, got ${t.Principal.UserId}`);
  assert.strictEqual(t.Settings.StartWhenAvailable, true);
  assert.strictEqual(t.Settings.DisallowStartIfOnBatteries, false, 'task must be allowed to start on battery power');
  assert.strictEqual(t.Settings.StopIfGoingOnBatteries, false, 'task must keep running on battery power');
  assert.strictEqual(t.Settings.ExecutionTimeLimitMinutes, 25);
  assert.strictEqual(t.Settings.MultipleInstances, 'IgnoreNew');
  assert.strictEqual(localData.loadConfig().schedule.enabled, true);

  // Retry task at a precise local time.
  const chain = service.newRetryChain();
  const failed = { status: 'FAILED', retryable: true, message: 'net::ERR_INTERNET_DISCONNECTED' };
  const retry = await service.scheduleNextRetry(chain, 0, localData.loadConfig(), failed);
  assert(retry && retry.attempt === 1, `retry 1 should be scheduled: ${JSON.stringify(retry)}`);
  const r1 = tasks()['Classroom Auto Turn-In Retry 1'];
  assert(r1, 'retry task missing');
  assert.strictEqual(r1.Triggers[0].Kind, 'Once');
  const at = new Date(retry.runAt);
  const expect = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}T${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  assert(r1.Triggers[0].StartBoundary.startsWith(expect), `retry trigger ${r1.Triggers[0].StartBoundary} should start at local ${expect}`);
  assert(r1.Actions[0].Arguments.includes('--retry-attempt=1') && r1.Actions[0].Arguments.includes(`--retry-chain=${chain.id}`));
  let health = await service.getScheduleHealth();
  assert(health.healthy && health.retryActive && health.retryAttempt === 1, `health should report the pending retry: ${JSON.stringify(health)}`);

  await service.clearRetryTasks();
  assert(!tasks()['Classroom Auto Turn-In Retry 1'], 'retry task was not cleared');
  health = await service.getScheduleHealth();
  assert(health.retryProblem && health.retrySupportCode === 'AT-SCH-106', 'a vanished retry must be reported');

  // Backup computer across midnight.
  machine = { role: 'backup', backupDelayMinutes: 60 };
  const late = localData.loadConfig();
  late.schedule = { ...late.schedule, time: '23:30', days: ['FRI'] };
  localData.saveConfig(late);
  health = await service.getScheduleHealth();
  assert(!health.healthy && health.scheduleMatches === false, 'changed schedule must be reported until saved again');
  await service.installSchedule();
  t = tasks()['Classroom Auto Turn-In'];
  assert(/T00:30:00$/.test(t.Triggers[0].StartBoundary), `backup trigger should be 00:30, got ${t.Triggers[0].StartBoundary}`);
  assert.strictEqual(t.Triggers[0].DaysOfWeek, 64, 'backup trigger should move to Saturday');
  assert((await service.getScheduleHealth()).healthy, 'backup schedule should be healthy');

  // Startup repair after the install path changed.
  const reg = JSON.parse(fs.readFileSync(registry, 'utf8').replace(/^\uFEFF/, ''));
  reg['Classroom Auto Turn-In'].Actions[0].Execute = 'C:\\Old\\Classroom Auto Turn-In.exe';
  fs.writeFileSync(registry, JSON.stringify(reg));
  const repaired = await service.reconcileScheduleOnStartup();
  assert(repaired.repaired && repaired.health.healthy, `stale task path must be repaired: ${JSON.stringify(repaired)}`);

  // Manual-only computer with a leftover task is reported, then removal works.
  machine = { role: 'manual', backupDelayMinutes: 60 };
  health = await service.getScheduleHealth();
  assert(!health.healthy && health.supportCode === 'AT-SCH-107', 'manual-only leftover task must be flagged');
  const removed = await service.removeSchedule();
  assert(!removed.health.exists && !tasks()['Classroom Auto Turn-In'], 'schedule removal failed');
  assert.strictEqual(localData.loadConfig().schedule.enabled, false);

  assert(scripts.length >= 10, 'expected the scheduler to run several PowerShell scripts');
  for (const s of scripts) assert(!/\[System\.|\[DateTimeOffset\]/.test(s), `scheduler script uses a .NET type that Constrained Language Mode blocks: ${s.slice(0, 120)}`);
  fs.rmSync(temp, { recursive: true, force: true });
  console.log(`Scheduler PowerShell checks passed with ${shell}: ${scripts.length} generated scripts ran in Constrained Language Mode against mock Task Scheduler cmdlets.`);
})().catch(e => { console.error(`Scheduler PowerShell check FAILED: ${e.stack || e.message}\n(kept ${temp})`); process.exit(1); });
