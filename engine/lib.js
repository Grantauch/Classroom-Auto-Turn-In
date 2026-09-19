const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {computeSafetyFingerprint,assertUniquePlans,normalizeState} = require('./safety');
const {validateConfig,validatePlanList} = require('./validation');
const {defaultProfileDirForDataRoot,defaultConfig:buildDefaultConfig,migrateConfig} = require('./app-config');
const {atomicWriteJson,readJsonWithBackup} = require('./json-store');

const ROOT = process.env.CATI_DATA_DIR || __dirname;
function ensureRoot(){ fs.mkdirSync(ROOT,{recursive:true}); }
function defaultProfileDir(){ return defaultProfileDirForDataRoot(ROOT); }
function defaultConfig(){ return buildDefaultConfig({profileDir:defaultProfileDir()}); }
function loadConfig() {
  ensureRoot();
  const p=path.join(ROOT,'config.json');
  if(!fs.existsSync(p)&&!fs.existsSync(`${p}.bak`)) atomicWriteJson(p,defaultConfig(),{backup:true});
  const raw=readJsonWithBackup(p,{fallback:defaultConfig(),label:'Configuration',logger:log});
  return validateConfig(migrateConfig(raw,{profileDir:defaultProfileDir()}));
}
function saveConfig(cfg) {
  ensureRoot();
  cfg=validateConfig(migrateConfig(cfg,{profileDir:defaultProfileDir()}));
  const previous=loadConfig();
  const plans=loadPlans();
  const before=computeSafetyFingerprint(previous,plans);
  const after=computeSafetyFingerprint(cfg,plans);
  if(before!==after) cfg={...cfg,dryRun:true,lastDryRunOkAt:null,safetyCertification:null};
  atomicWriteJson(path.join(ROOT,'config.json'),cfg,{backup:true});
  return cfg;
}
function plansPath(){ return path.join(ROOT,'plans.json'); }
function loadPlans() {
  ensureRoot();
  if(!fs.existsSync(plansPath())&&!fs.existsSync(`${plansPath()}.bak`)) atomicWriteJson(plansPath(),[],{backup:true});
  return readJsonWithBackup(plansPath(),{fallback:[],label:'Lesson-plan mappings',logger:log});
}
function savePlans(plans){
  ensureRoot();
  assertUniquePlans(plans);validatePlanList(plans);
  const cfg=loadConfig(),oldPlans=loadPlans();
  const before=computeSafetyFingerprint(cfg,oldPlans),after=computeSafetyFingerprint(cfg,plans);
  atomicWriteJson(plansPath(),plans,{backup:true});
  if(before!==after) atomicWriteJson(path.join(ROOT,'config.json'),{...cfg,dryRun:true,lastDryRunOkAt:null,safetyCertification:null},{backup:true});
  return plans;
}

function statePath() { return path.join(ROOT, 'state.json'); }
function loadState() {
  const primary=statePath(), backup=`${primary}.bak`;
  const primaryExists=fs.existsSync(primary), backupExists=fs.existsSync(backup);
  if(!primaryExists && !backupExists) return normalizeState({});
  if(primaryExists){
    try { return normalizeState(JSON.parse(fs.readFileSync(primary,'utf8'))); } catch{/* best-effort fallback */}
  }
  if(backupExists){
    try {
      const recovered=normalizeState(JSON.parse(fs.readFileSync(backup,'utf8')));
      recovered.recoveredFromBackupAt=new Date().toISOString();
      try{fs.copyFileSync(backup,primary)}catch{/* best-effort fallback */}
      log('Submission history recovered from the last known-good backup.');
      return recovered;
    } catch{/* best-effort fallback */}
  }
  const err=new Error('Saved submission history could not be read safely. Open Classroom Auto Turn-In and repair or reset the local data before another automatic check.');
  err.code='DATA_CORRUPT'; err.retryable=false; throw err;
}
function saveState(s) { atomicWriteJson(statePath(),s,{backup:true}); }
function lockPath(){ return path.join(ROOT,'automation.lock'); }
function pidIsAlive(pid){
  const n=Number(pid);if(!Number.isInteger(n)||n<=0)return false;
  try{process.kill(n,0);return true}catch(e){return e?.code==='EPERM'}
}
function acquireRunLock({staleMinutes=45}={}) {
  ensureRoot();
  const file=lockPath();
  const payload={pid:process.pid,startedAt:new Date().toISOString(),token:crypto.randomBytes(12).toString('hex')};
  const tryCreate=()=>{
    const fd=fs.openSync(file,'wx');
    try { fs.writeFileSync(fd,JSON.stringify(payload,null,2),'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    return payload;
  };
  try { return tryCreate(); }
  catch(e) {
    if(e.code!=='EEXIST') throw e;
    let existing=null;
    try { existing=JSON.parse(fs.readFileSync(file,'utf8')); } catch{/* best-effort fallback */}
    const age=existing?.startedAt ? (Date.now()-new Date(existing.startedAt).getTime())/60000 : Infinity;
    const alive=pidIsAlive(existing?.pid);
    // A confirmed-live process owns the lock regardless of age. Long-running
    // Google/browser operations must never become concurrent merely because a
    // wall-clock stale threshold was crossed.
    if(!alive || !Number.isFinite(age)) {
      try { fs.unlinkSync(file); } catch{/* best-effort fallback */}
      try { return tryCreate(); } catch{/* best-effort fallback */}
    }
    const err=new Error(`Another Classroom Auto Turn-In run is already active${existing?.startedAt?` (started ${existing.startedAt})`:''}.`);
    err.code='RUN_LOCKED'; err.retryable=false; throw err;
  }
}
function releaseRunLock(lock) {
  // Only the process that successfully acquired this exact lock may remove it.
  // A blocked contender has no token and must never delete another run's lock.
  if(!lock?.token) return false;
  const file=lockPath();
  try {
    const current=JSON.parse(fs.readFileSync(file,'utf8'));
    if(current.token!==lock.token) return false;
    fs.unlinkSync(file);
    return true;
  } catch { return false; }
}
function getRunLockInfo(){
  try { return JSON.parse(fs.readFileSync(lockPath(),'utf8')); } catch { return null; }
}
function cleanupDiagnostics(retentionDays=45) {
  const days=Math.max(1,Math.min(365,Number(retentionDays)||45));
  const dir=logDir(); const cutoff=Date.now()-days*86400000; let removed=0;
  for(const name of fs.readdirSync(dir)){
    if(!/\.(?:log|png)$/i.test(name)) continue;
    const file=path.join(dir,name);
    try { if(fs.statSync(file).mtimeMs<cutoff){fs.unlinkSync(file);removed++;} } catch{/* best-effort fallback */}
  }
  return {removed,retentionDays:days};
}
function logDir(){ const d=path.join(ROOT,'logs'); fs.mkdirSync(d,{recursive:true}); return d; }
function logPath() {
  const d = new Date().toISOString().slice(0,10); return path.join(logDir(), `${d}.log`);
}
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  try{console.log(line)}catch{/* best-effort fallback */}
  // Diagnostics must never change submission behavior. A full/locked log folder
  // is a troubleshooting problem, not permission to fail or retry a Classroom action.
  try{fs.appendFileSync(logPath(), line+'\n')}catch(e){try{console.error(`[CATI diagnostics warning] ${e.message}`)}catch{/* best-effort fallback */}}
}
function screenshotPath(label='run') {
  return path.join(logDir(), `${new Date().toISOString().replace(/[:.]/g,'-')}-${label}.png`);
}
function startOfDay(d){ return new Date(d.getFullYear(),d.getMonth(),d.getDate()); }
function addDays(d,n){ const x=startOfDay(d); x.setDate(x.getDate()+n); return x; }
const MONTH_INDEX={jan:0,january:0,feb:1,february:1,mar:2,march:2,apr:3,april:3,may:4,jun:5,june:5,jul:6,july:6,aug:7,august:7,sep:8,sept:8,september:8,oct:9,october:9,nov:10,november:10,dec:11,december:11};
const MONTH_PATTERN='Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
const WEEKDAY_PATTERN='Sun(?:day)?|Mon(?:day)?|Tue(?:s|sday)?|Wed(?:nesday)?|Thu(?:r|rs|rsday)?|Fri(?:day)?|Sat(?:urday)?';
const MONTH_DAY_RE=new RegExp(`\\bDue\\s+(?:(?:${WEEKDAY_PATTERN})\\.?,?\\s+)?(${MONTH_PATTERN})\\.?\\s+(\\d{1,2})\\b(?:,\\s*(\\d{4})\\b)?`,'i');
const WEEKDAY_ONLY_RE=new RegExp(`\\bDue\\s+(${WEEKDAY_PATTERN})\\b(?!\\.?,?\\s+(?:(?:${MONTH_PATTERN})\\b|\\d{1,2}[/.-]\\d{1,2}))`,'i');
function parseClassroomDueDate(text, now=new Date()){
  const s=String(text||'').replace(/\s+/g,' ').trim();
  if(!s) return null;
  if(/\bDue\s+Today\b/i.test(s)) return startOfDay(now);
  if(/\bDue\s+Yesterday\b/i.test(s)) return addDays(now,-1);
  if(/\bDue\s+Tomorrow\b/i.test(s)) return addDays(now,1);
  const m=s.match(MONTH_DAY_RE);
  if(m){
    const month=MONTH_INDEX[m[1].toLowerCase()]; const day=Number(m[2]);
    const validDate=y=>{const d=new Date(y,month,day);return d.getFullYear()===y&&d.getMonth()===month&&d.getDate()===day?d:null;};
    if(Number.isFinite(Number(m[3]))){
      const d=validDate(Number(m[3])); return d?startOfDay(d):null;
    }
    const today=startOfDay(now);
    const years=[today.getFullYear()-1,today.getFullYear(),today.getFullYear()+1];
    const candidates=years.map(validDate).filter(Boolean);
    if(!candidates.length) return null;
    candidates.sort((a,b)=>Math.abs(a-today)-Math.abs(b-today));
    return startOfDay(candidates[0]);
  }
  // A weekday without a date ("Due Friday") means the next such day within
  // the coming week; Classroom uses Today/Tomorrow for the nearest days.
  const w=s.match(WEEKDAY_ONLY_RE);
  if(w){
    const target=['sun','mon','tue','wed','thu','fri','sat'].indexOf(w[1].slice(0,3).toLowerCase());
    if(target<0) return null;
    const ahead=((target-startOfDay(now).getDay())+7)%7||7;
    return addDays(now,ahead);
  }
  return null;
}
const DAY_CODES=['SUN','MON','TUE','WED','THU','FRI','SAT'];
function localDateKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
// True when no scheduled check day falls after today and on or before the due
// date, so today's check is the last one that can turn the plan in on time.
function lastScheduledCheckBeforeDue(due, today, cfg){
  const days=Array.isArray(cfg?.schedule?.days)?cfg.schedule.days.map(x=>String(x).toUpperCase()):[];
  if(!days.length) return false;
  const gap=Math.round((due.getTime()-today.getTime())/86400000);
  if(gap<1||gap>6) return false;
  for(let i=1;i<=gap;i++){ if(days.includes(DAY_CODES[addDays(today,i).getDay()])) return false; }
  return true;
}
function assignmentEligibility(assignment, plan, cfg, now=new Date()){
  const today=startOfDay(now);
  const overdue=cfg.submitOverdue!==false;
  // Teacher Edition uses the authoritative due date shown by Classroom. If it
  // cannot be read, the caller must block rather than infer "nothing is due."
  const text=assignment?.cardText||assignment?.dueText||'';
  const due=parseClassroomDueDate(text,now);
  // Classroom's own "No due date" label is a known state, not an unreadable
  // date: the assignment is never due, so it is never turned in automatically.
  if(!due&&/\bNo due date\b/i.test(text)&&!/\bDue\s+\S/i.test(text.replace(/\bNo due date\b/ig,''))) return {eligible:false,early:false,unknown:false,reason:'no due date in Classroom',date:null,time:null};
  if(!due) return {eligible:false,unknown:true,reason:'Classroom due date could not be determined',date:null,time:null};
  const same=due.getTime()===today.getTime();
  const past=due.getTime()<today.getTime();
  const early=!same&&!past&&lastScheduledCheckBeforeDue(due,today,cfg);
  const eligible=same||early||(past&&overdue);
  const reason=same?'due today':early?'due on a day with no scheduled check':past?(overdue?'overdue':'past due; overdue catch-up is off'):'future due date';
  return {eligible,early,unknown:false,reason,date:localDateKey(due),time:due.getTime()};
}

module.exports={ROOT,readJsonWithBackup,defaultConfig,loadConfig,saveConfig,loadPlans,savePlans,loadState,saveState,atomicWriteJson,acquireRunLock,releaseRunLock,getRunLockInfo,cleanupDiagnostics,log,logPath,logDir,screenshotPath,parseClassroomDueDate,assignmentEligibility};
