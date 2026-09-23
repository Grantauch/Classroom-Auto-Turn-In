const assert=require('assert');
const fs=require('fs'),path=require('path'),os=require('os');
const root=path.join(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cati-deep-'));process.env.CATI_DATA_DIR=temp;
const lib=require(path.join(root,'engine/lib.js'));
const safety=require(path.join(root,'engine/safety.js'));
const sched=require(path.join(root,'engine/scheduler.js'));
function ymd(d){return d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`:null}
const now=new Date(2026,8,15,8,0,0);
// Calendar parsing: valid dates stay exact; impossible dates fail closed.
for(const [text,want] of [['Due Jan 1, 2027, 8:00 AM','2027-01-01'],['Due Feb 28, 2026, 8:00 AM','2026-02-28'],['Due Sep 30, 2026, 11:59 PM','2026-09-30'],['Due Dec 31, 2026, 8:00 AM','2026-12-31']]) assert.equal(ymd(lib.parseClassroomDueDate(text,now)),want,text);
for(const [text,want] of [['Due 9/21','2026-09-21'],['Due Mon 9/21','2026-09-21'],['Due 09/21/2026','2026-09-21'],['Due 9/21/26','2026-09-21']]) assert.equal(ymd(lib.parseClassroomDueDate(text,now)),want,text);
for(const text of ['Due Feb 29, 2026','Due Feb 30, 2026','Due Apr 31, 2026','Due Sep 31, 2026']) assert.equal(lib.parseClassroomDueDate(text,now),null,text);
for(const text of ['Due 13/21/2026','Due 9/31/2026','Due 2/29/2026']) assert.equal(lib.parseClassroomDueDate(text,now),null,text);
assert.equal(ymd(lib.parseClassroomDueDate('Due Jan 4, 8:00 AM',new Date(2026,11,20))),'2027-01-04');
assert.equal(ymd(lib.parseClassroomDueDate('Due Feb 29, 8:00 AM',new Date(2024,1,1))),'2024-02-29');
// No due-date inference from unrelated assignment text.
{const noDue=lib.assignmentEligibility({dueText:'No due date',dueSource:'verified assignment detail page',cardText:'Meeting date 09/14/2026'},{},{submitOverdue:true},now);
assert.equal(noDue.eligible,false);assert.equal(noDue.date,null);assert.equal(noDue.reason,'no due date in Classroom');}
assert.equal(lib.assignmentEligibility({cardText:'Posted Sep 1',text:'Meeting date 09/14/2026'},{},{submitOverdue:true},now).unknown,true);
{const detail=lib.assignmentEligibility({cardText:'Week 8 - Lesson Plans',dueText:'Due 9/15/2026',dueSource:'verified assignment detail page'},{},{submitOverdue:true},now);
assert.equal(detail.unknown,false);assert.equal(detail.eligible,true);assert.equal(detail.dueSource,'verified assignment detail page');}
// URL trust boundaries.
for(const u of ['https://docs.google.com/document/d/ABC/edit','https://docs.google.com/spreadsheets/d/ABC/edit','https://docs.google.com/presentation/d/ABC/edit','https://drive.google.com/file/d/ABC/view','https://drive.google.com/open?id=ABC']) assert.equal(safety.isGooglePlanFileUrl(u),true,u);
for(const u of ['https://drive.google.com/drive/folders/ABC','https://classroom.google.com/c/ABC','https://example.com/file/d/ABC','https://docs.google.com/forms/d/ABC/edit']) assert.equal(safety.isGooglePlanFileUrl(u),false,u);
// The installed weekly schedule has one daily trigger; retry timing is computed only after a transient failure.
let pts=sched.schedulePoints({schedule:{time:'23:50',days:['MON']},retryMinutes:[15,30]});
assert.deepEqual(pts.map(x=>[x.time,x.dayCodes]),[['23:50',['MON']]]);
let retry=sched.retryTargetsFrom(new Date(2026,8,14,23,50,0),{retryMinutes:[15,30]});
assert.deepEqual(retry.map(x=>[x.offset,ymd(x.at),x.at.getHours(),x.at.getMinutes()]),[[15,'2026-09-15',0,5],[30,'2026-09-15',0,20]]);
assert.deepEqual(sched.retryOffsets({retryMinutes:[30,15,15,-2]}),[15,30]);
assert.equal(sched.hhmmAdd('00:05',-10),'23:55');
// Fingerprint: schedule/diagnostic changes do not disable trust; protected setup changes do.
const base={courseUrl:'https://classroom.google.com/c/C1',topicName:'Plans',driveFolderUrl:'https://drive.google.com/drive/folders/F1',assignmentTitleRegex:'Week (\\d+)',planTitleRegex:'Week (\\d+)',eligibilityMode:'classroomDueDate',submitOverdue:true,earliestWeek:1,latestWeek:52,schedule:{time:'06:30',days:['MON']}};
const plan={week:1,title:'Week 1',url:'https://docs.google.com/document/d/F1/edit',source:'drive-folder'};
const fp=safety.computeSafetyFingerprint(base,[plan]);
assert.equal(safety.computeSafetyFingerprint({...base,schedule:{time:'07:00',days:['TUE']}},[plan]),fp);
assert.notEqual(safety.computeSafetyFingerprint({...base,topicName:'Other'},[plan]),fp);
assert.equal(safety.computeSafetyFingerprint(base,[plan,{week:2,title:'Week 2',url:'https://docs.google.com/document/d/F2/edit',source:'drive-folder'}]),fp);
// User-edited/imported rows cannot retain trusted Drive-scanner provenance.
const trustedRow={week:8,title:'Week 08 - Lesson Plans',url:'https://docs.google.com/document/d/TRUSTED/edit',source:'drive-folder'};
let prov=safety.preserveTrustedDriveProvenance([{...trustedRow}], [trustedRow]);assert.equal(prov[0].source,'drive-folder');
prov=safety.preserveTrustedDriveProvenance([{...trustedRow,url:'https://docs.google.com/document/d/CHANGED/edit'}],[trustedRow]);assert.equal(prov[0].source,'manual');
prov=safety.preserveTrustedDriveProvenance([{week:9,title:'Week 09 - Lesson Plans',url:'https://docs.google.com/document/d/FAKE/edit',source:'drive-folder'}],[trustedRow]);assert.equal(prov[0].source,'manual');

// Validated backup recovery: a damaged primary recovers; two damaged copies block.
const configFile=path.join(temp,'recovery-config.json');
lib.atomicWriteJson(configFile,{ok:1},{backup:true});
lib.atomicWriteJson(configFile,{ok:2},{backup:true});
fs.writeFileSync(configFile,'{bad json');
assert.deepEqual(lib.readJsonWithBackup(configFile,{fallback:{},label:'Test config'}),{ok:2});
fs.writeFileSync(configFile,'{bad again');fs.writeFileSync(configFile+'.bak','{also bad');
assert.throws(()=>lib.readJsonWithBackup(configFile,{fallback:{},label:'Test config'}),e=>e.code==='DATA_CORRUPT');
// A surviving backup also recovers when the primary file vanished entirely.
fs.writeFileSync(configFile+'.bak',JSON.stringify({ok:3}));fs.rmSync(configFile,{force:true});
assert.deepEqual(lib.readJsonWithBackup(configFile,{fallback:{},label:'Test config'}),{ok:3});

// Lock owner semantics and state backup remain intact under repeated writes.
const lock=lib.acquireRunLock();assert.throws(()=>lib.acquireRunLock(),e=>e.code==='RUN_LOCKED');assert.equal(lib.releaseRunLock({token:'wrong'}),false);assert.equal(lib.releaseRunLock(lock),true);
for(let i=0;i<25;i++)lib.saveState({schemaVersion:3,submissions:{['x'+i]:{confirmed:true}},runHistory:[]});assert.ok(fs.existsSync(path.join(temp,'state.json.bak')));
// State history is safety-relevant: if both copies are corrupt, fail closed rather than reset to empty.
fs.writeFileSync(path.join(temp,'state.json'),'{bad');fs.writeFileSync(path.join(temp,'state.json.bak'),'{bad too');
assert.throws(()=>lib.loadState(),e=>e.code==='DATA_CORRUPT');
fs.rmSync(temp,{recursive:true,force:true});
console.log('Offline adversarial logic checks passed.');
