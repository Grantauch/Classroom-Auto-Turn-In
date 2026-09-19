const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const {createMachineService,normalizeMachine}=require('../main-services/machine-service');
const {buildSetupExport,parseSetupImport}=require('../main-services/setup-transfer');
const {schedulePoints}=require('../engine/scheduler');
const {defaultConfig}=require('../engine/app-config');

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cati-multi-'));
const ms=createMachineService({dataDir:()=>temp,logger:()=>{}});
const m1=ms.load();assert(m1.id&&m1.displayName&&m1.role==='primary','new machine must have a stable primary identity');
const m2=ms.save({displayName:'Home PC',role:'backup'});assert.equal(m2.id,m1.id,'machine ID must not change when renamed');assert.equal(m2.displayName,'Home PC');assert.equal(m2.role,'backup');
const m3=ms.load();assert.equal(m3.id,m1.id);assert.equal(m3.role,'backup');
const manual=ms.markImported();assert.equal(manual.role,'manual','imported setup must fail safe to manual-only role');

// Valid JSON with an invalid/mismatched machine role/schema must fail closed rather than silently becoming Main.
fs.writeFileSync(path.join(temp,'machine.json'),JSON.stringify({schema:999,id:m1.id,displayName:'Tampered PC',role:'mystery'}));
fs.writeFileSync(path.join(temp,'machine.json.bak'),JSON.stringify({schema:999,id:m1.id,displayName:'Tampered PC',role:'mystery'}));
const damaged=ms.load();assert.equal(damaged.role,'manual');assert.equal(damaged.damaged,true,'unsafe machine identity must fail closed');
const repaired=ms.save({displayName:'Home PC',role:'backup'});assert.equal(repaired.role,'backup');assert(!repaired.damaged,'saving a deliberate role must repair the machine identity');

const cfg=defaultConfig({profileDir:path.join(temp,'profile')});
cfg.courseUrl='https://classroom.google.com/c/ABC';cfg.courseDisplayName='Staff Plans';cfg.driveFolderUrl='https://drive.google.com/drive/folders/XYZ';cfg.driveFolderName='Weekly Plans';cfg.dryRun=false;cfg.setupComplete=true;cfg.schedule={enabled:true,time:'23:30',days:['MON','FRI']};cfg.safetyCertification={fingerprint:'secret-ish-local-state',verified:[{week:5}]};
const exported=buildSetupExport(cfg);
assert.equal(exported.format,'classroom-auto-turn-in-setup');assert.equal(exported.version,1);
const text=JSON.stringify(exported);
for(const forbidden of ['profileDir','safetyCertification','lastDryRunOkAt','browserChannel','dryRun','setupComplete'])assert(!text.includes(forbidden),`portable setup leaked ${forbidden}`);
assert.equal(exported.setup.schedule.time,'23:30');assert.deepEqual(exported.setup.schedule.days,['MON','FRI']);assert(!('enabled' in exported.setup.schedule),'portable setup must not copy automatic-on state');
const imported=parseSetupImport(text,defaultConfig({profileDir:path.join(temp,'other-profile')}));
assert.equal(imported.courseDisplayName,'Staff Plans');assert.equal(imported.driveFolderName,'Weekly Plans');assert.equal(imported.dryRun,true);assert.equal(imported.schedule.enabled,false);assert.equal(imported.safetyCertification,null);assert.equal(imported.profileDir,path.join(temp,'other-profile'));

const primary=schedulePoints(cfg,{role:'primary',backupDelayMinutes:60})[0];assert.equal(primary.time,'23:30');assert.deepEqual(primary.dayCodes,['MON','FRI']);
const backup=schedulePoints(cfg,{role:'backup',backupDelayMinutes:60})[0];assert.equal(backup.time,'00:30');assert.deepEqual(backup.dayCodes,['TUE','SAT'],'backup schedule must roll days across midnight safely');
assert.throws(()=>schedulePoints(cfg,{role:'manual'}),/manual only/i);

const main=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8'),preload=fs.readFileSync(path.join(__dirname,'..','preload.js'),'utf8'),html=fs.readFileSync(path.join(__dirname,'..','renderer','index.html'),'utf8');
for(const channel of ['machine:get','machine:save','setup:export-portable','setup:import-portable']){assert(main.includes(`handleIpc('${channel}'`),`missing main handler ${channel}`);assert(preload.includes(`invoke('${channel}'`),`missing preload bridge ${channel}`)}
for(const id of ['machineName','machineRole','saveMachine','exportSetup','importSetup'])assert(html.includes(`id="${id}"`),`missing multi-PC UI control ${id}`);

const submit=fs.readFileSync(path.join(__dirname,'..','engine','submit-weekly.js'),'utf8');
assert(submit.includes('Classroom became completed before the final click'),'multi-PC final pre-submit shared-state recheck is missing');
assert(main.includes("machine.role==='backup'" )&&main.includes('await delay(120000)'),'backup-computer coordination grace is missing');

assert(html.includes('Main computer')&&html.includes('Backup computer')&&html.includes('Manual only'),'teacher-facing PC roles missing');
const renderer=fs.readFileSync(path.join(__dirname,'..','renderer','app.js'),'utf8');
assert(main.includes("const manualOnly=String(machine?.role||'primary')==='manual'"),'dashboard does not recognize intentional Manual-only role');
assert(main.includes("? !scheduler.exists&&!scheduler.retryActive&&!scheduler.retryProblem"),'Manual-only dashboard still treats a deliberately absent schedule as a failure');
assert(renderer.includes("'Manual checks are ready'"),'Home does not present Manual-only as an intentional healthy mode');
assert(renderer.includes("'Manual only · no automatic checks are scheduled on this computer.'"),'Automatic Turn-In page does not explain healthy Manual-only scheduling');
fs.rmSync(temp,{recursive:true,force:true});
console.log('Multi-PC checks passed: stable machine identity, safe setup transfer, manual-only import default, and staggered backup scheduling verified.');
