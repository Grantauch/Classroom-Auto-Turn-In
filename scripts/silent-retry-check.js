const assert=require('assert');
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const browser=require('../engine/browser-mode');
const scheduler=require('../engine/scheduler');
const {nextRetryPlan,isRetryChainFresh}=require('../engine/retry-policy');
const {defaultConfig}=require('../engine/lib');
const {validateConfig}=require('../engine/validation');

assert.equal(defaultConfig().submitOverdue,false,'new installs should not catch up overdue assignments by default');
assert.equal(browser.shouldRunHeadless({CATI_BACKGROUND_MODE:'1'}),true,'background browser is not headless');
assert.equal(browser.shouldRunHeadless({CATI_BACKGROUND_MODE:'0'}),false,'interactive browser incorrectly becomes headless');
assert.equal(browser.shouldRunHeadless({CATI_BACKGROUND_MODE:'1',CATI_FORCE_VISIBLE:'1'}),false,'explicit visible override is ignored');

const cfg={schedule:{time:'06:30',days:['MON','TUE','WED','THU','FRI']},retryMinutes:[15,30]};
const primary=scheduler.schedulePoints(cfg);
assert.equal(primary.length,1,'normal schedule still has unconditional backup triggers');
assert.equal(primary[0].time,'06:30');
assert.deepEqual(scheduler.retryOffsets(cfg),[15,30]);
assert.throws(()=>validateConfig({...defaultConfig(),retryMinutes:[5,10,15]}),/retry timing/i,'more than two retries were accepted');

const start=new Date('2026-09-16T06:30:00-04:00');
let plan=nextRetryPlan({result:{status:'FAILED',retryable:true},currentAttempt:0,chainStartedAt:start,cfg,now:new Date('2026-09-16T06:32:00-04:00')});
assert.equal(plan.attempt,1);assert.equal(plan.offsetMinutes,15);assert.equal(plan.runAt.getTime(),new Date('2026-09-16T06:45:00-04:00').getTime());
plan=nextRetryPlan({result:{status:'FAILED',retryable:true},currentAttempt:1,chainStartedAt:start,cfg,now:new Date('2026-09-16T06:47:00-04:00')});
assert.equal(plan.attempt,2);assert.equal(plan.offsetMinutes,30);assert.equal(plan.runAt.getTime(),new Date('2026-09-16T07:00:00-04:00').getTime());
assert.equal(nextRetryPlan({result:{status:'FAILED',retryable:true},currentAttempt:2,chainStartedAt:start,cfg,now:new Date('2026-09-16T07:01:00-04:00')}),null,'third retry was incorrectly allowed');
assert.equal(nextRetryPlan({result:{status:'BLOCKED',retryable:false},currentAttempt:0,chainStartedAt:start,cfg}),null,'nonretryable blocker scheduled a retry');
assert.equal(nextRetryPlan({result:{status:'SUCCESS',retryable:false},currentAttempt:0,chainStartedAt:start,cfg}),null,'success scheduled a retry');
assert.equal(nextRetryPlan({result:{status:'NO_ACTION',retryable:false},currentAttempt:0,chainStartedAt:start,cfg}),null,'no-action scheduled a retry');
assert.equal(isRetryChainFresh(start,new Date('2026-09-16T09:00:00-04:00')),true);
assert.equal(isRetryChainFresh(start,new Date('2026-09-16T11:00:01-04:00')),false,'stale retry chain did not expire');
// If a long attempt finishes after its intended retry time, the retry is moved at least one minute into the future.
plan=nextRetryPlan({result:{status:'FAILED',retryable:true},currentAttempt:0,chainStartedAt:start,cfg,now:new Date('2026-09-16T06:50:00-04:00')});
assert.equal(plan.runAt.getTime(),new Date('2026-09-16T06:51:00-04:00').getTime());

const main=fs.readFileSync(path.join(root,'main.js'),'utf8');
const scheduleService=fs.readFileSync(path.join(root,'main-services/scheduler-service.js'),'utf8');
const ui=fs.readFileSync(path.join(root,'renderer/app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'renderer/index.html'),'utf8');
assert(main.includes("CATI_BACKGROUND_MODE:backgroundMode?'1':'0'"),'background mode is not passed to browser child processes');
assert(scheduleService.includes('New-ScheduledTaskTrigger -Once'),'one-time retry task creation is missing');
assert(scheduleService.includes('getRetryTaskHealth'),'pending retry tasks are not verified against Windows');
assert(scheduleService.includes("retrySupportCode='AT-SCH-106'"),'missing retry task is not surfaced precisely');
assert(main.includes("result.status==='FAILED'&&result.retryable"),'retry gate does not require an explicitly retryable failure');
assert(fs.readFileSync(path.join(root,'engine/submit-weekly.js'),'utf8').includes("return {status:'FAILED',retryable:false,type:'UNEXPECTED'}"),'unexpected failures are incorrectly classified as temporary/retryable');
assert(main.includes("retryable:transient,errorType:transient?'TRANSIENT':'UNEXPECTED'"),'unstructured unexpected failures are incorrectly retried');
assert(main.includes('Stale retry attempt'),'stale one-time retry protection is missing');
assert(main.includes('No teacher notification is needed yet'),'transient first failure is not being held quietly while retry is pending');
assert(!html.includes('backup checks'),'teacher UI still describes unconditional backup checks');
assert(!ui.includes('backup checks'),'renderer still describes unconditional backup checks');
assert(html.includes('How automatic retries work'),'teacher UI does not explain true retry behavior');
assert(html.includes('v0.9.31')&&ui.includes('v0.9.31'),'v0.9.31 UI version labels are missing');
console.log('v0.9.31 silent-operation and conditional-retry checks passed.');
