const assert=require('assert');
const {collectCourseRoster,scrollRosterPageDom}=require('../engine/discover-classroom-rosters');
const {classRosterIsAuthoritative}=require('../engine/classroom-roster');

function makePage({batchAtMs=Infinity,expandScroll=true,scrollFailureAt=0,captureFailureAt=0,stuckScroll=false}={}){
  let now=0,scrollTop=0,scrollCalls=0,captureCalls=0;
  const page={
    goto:async()=>{},
    url:()=> 'https://classroom.google.com/r/COURSE1/sort-name',
    title:async()=> 'People in History - Classroom',
    locator:()=>({first:()=>({waitFor:async()=>{}})}),
    waitForTimeout:async ms=>{now+=ms;},
    evaluate:async fn=>{
      if(fn===scrollRosterPageDom){
        scrollCalls++;
        if(scrollFailureAt===scrollCalls)throw new Error('simulated scroll evaluation failure');
        const loaded=now>=batchAtMs,max=loaded&&expandScroll?1000:0,before=scrollTop;
        if(!stuckScroll)scrollTop=Math.min(max,before+850);
        return {before,after:scrollTop,max};
      }
      captureCalls++;
      if(captureFailureAt===captureCalls)throw new Error('simulated roster capture failure');
      const loaded=now>=batchAtMs;
      const students=loaded?
        [{name:'Ada Student',email:'ada@school.org'},{name:'Ben Student',email:'ben@school.org'}]:
        [{name:'Ada Student',email:'ada@school.org'}];
      return {studentsHeadingFound:true,discoveredStudentRows:students.length,students};
    }
  };
  return {page,get now(){return now},get scrollCalls(){return scrollCalls},get captureCalls(){return captureCalls}};
}

async function scan(harness){
  return collectCourseRoster(harness.page,{courseId:'COURSE1',courseDisplayName:'History'});
}

async function run(){
  const delayed=makePage({batchAtMs:2000,expandScroll:true});
  const delayedResult=await scan(delayed);
  assert.ok(delayed.now>=2000,'The scanner must remain in the end-stability window long enough to observe the reproduced 2,000 ms lazy batch.');
  assert.deepEqual(delayedResult.students.map(x=>x.email).sort(),['ada@school.org','ben@school.org']);
  assert.equal(delayedResult.discoveredStudentRows,2);
  assert.equal(delayedResult.scrollComplete,true,'A delayed batch may be complete only after the new bottom is stably re-confirmed.');
  assert.equal(classRosterIsAuthoritative({...delayedResult,unresolved:[]}),true);

  const delayedFitsViewport=makePage({batchAtMs:2000,expandScroll:false});
  const fitResult=await scan(delayedFitsViewport);
  assert.ok(delayedFitsViewport.now>=2000,'Stable-end evidence must include roster-row evidence, not only scroll geometry.');
  assert.equal(fitResult.students.length,2,'A lazy batch that does not increase scroll height must still be observed.');
  assert.equal(fitResult.scrollComplete,true);

  const stable=makePage();
  const stableResult=await scan(stable);
  assert.equal(stableResult.students.length,1);
  assert.equal(stableResult.scrollComplete,true,'A genuinely stable end must still complete normally.');

  const scrollFailure=makePage({scrollFailureAt:1});
  const scrollFailureResult=await scan(scrollFailure);
  assert.equal(scrollFailureResult.scrollComplete,false,'A scroll-evaluation error must never be converted into completion.');
  assert.equal(classRosterIsAuthoritative({...scrollFailureResult,unresolved:[]}),false,'Failed scroll evidence must not authorize removals.');

  const captureFailure=makePage({captureFailureAt:2});
  const captureFailureResult=await scan(captureFailure);
  assert.equal(captureFailureResult.scrollComplete,false,'A failed stability capture must fail closed.');

  const stuck=makePage({batchAtMs:0,expandScroll:true,stuckScroll:true});
  const stuckResult=await scan(stuck);
  assert.equal(stuckResult.scrollComplete,false,'No movement before the known scroll maximum is not proof of completion.');
  assert.equal(classRosterIsAuthoritative({...stuckResult,unresolved:[]}),false);

  console.log('Roster discovery completeness checks passed: delayed lazy loads are observed and evaluation/movement failures remain incomplete.');
}

if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1});

module.exports={run};
