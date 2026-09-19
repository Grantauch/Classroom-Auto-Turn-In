const assert=require('assert');
const path=require('path');
const {migrateConfig,CONFIG_SCHEMA}=require('../engine/app-config');
const {normalizeState}=require('../engine/safety');
const profile=path.join('C:','Users','Teacher','AppData','Roaming','Classroom Auto Turn-In','browser-profile');
const fixtures=[
  {name:'v0.6-style',raw:{configSchema:3,dryRun:false,submitOverdue:true,eligibilityMode:'planWeekOf',schedule:{enabled:true,time:'06:15',days:['MON','WED','FRI']}}},
  {name:'v0.7-style',raw:{configSchema:4,dryRun:true,screenshotOnEveryRun:true,retryMinutes:[15,30],schedule:{enabled:false,time:'07:00',days:['TUE','THU']}}},
  {name:'v0.8-style',raw:{configSchema:5,dryRun:false,submitOverdue:false,courseUrl:'https://classroom.google.com/c/ABC',schedule:{enabled:true,time:'06:30',days:['MON','TUE','WED','THU','FRI']}}}
];
for(const f of fixtures){const c=migrateConfig(f.raw,{profileDir:profile,env:{}});assert.equal(c.configSchema,CONFIG_SCHEMA,`${f.name} schema did not migrate`);assert.equal(c.eligibilityMode,'classroomDueDate');assert(c.profileDir);assert(Array.isArray(c.retryMinutes)&&c.retryMinutes.length===2);assert(c.schedule&&c.schedule.time&&c.schedule.days.length)}
const legacy=normalizeState({submittedWeeks:{5:{confirmed:true}},lastRun:'2026-01-01T00:00:00Z'});assert(legacy.legacySubmittedWeeks['5']);assert(legacy.submissions&&typeof legacy.submissions==='object');assert.equal(legacy.schemaVersion,3);
const current=normalizeState({schemaVersion:3,submissions:{'C:A':{confirmed:true,courseId:'C',assignmentId:'A'}},runHistory:new Array(80).fill({status:'SUCCESS'})});assert(current.submissions['C:A']);assert.equal(current.runHistory.length,50);
console.log(`Migration checks passed for ${fixtures.length} historical configuration shapes plus legacy/current submission state.`);
