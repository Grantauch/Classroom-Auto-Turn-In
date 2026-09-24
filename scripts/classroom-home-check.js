// Checks the Classroom-home opener that Find my rosters and Find my classes use:
// a signed-out browser waits for the teacher to sign in instead of failing.
const assert=require('assert');
const {openClassroomHome,peoplePageShowsTeacher}=require('../engine/classroom-home');

function fakePage(urls,{mainVisible=true,closeAt=-1,teacherControls=0}={}){
  let step=0,url=urls[0];const visits=[];
  return {
    visits,
    async goto(target){visits.push(target);url=urls[Math.min(step,urls.length-1)]},
    url:()=>url,
    isClosed:()=>closeAt>=0&&step>=closeAt,
    locator:()=>({first:()=>({isVisible:async()=>mainVisible}),count:async()=>teacherControls}),
    async waitForTimeout(){step++;url=urls[Math.min(step,urls.length-1)]},
  };
}

(async()=>{
  // Already signed in: returns at once, no sign-in prompt.
  {
    const events=[];const page=fakePage(['https://classroom.google.com/h']);
    await openClassroomHome(page,{emit:(type,data)=>events.push([type,data])});
    assert.equal(events.length,0);
  }
  // Signed out: asks once, waits, then continues when Classroom opens.
  {
    const events=[];
    const page=fakePage(['https://accounts.google.com/ServiceLogin','https://accounts.google.com/ServiceLogin','https://accounts.google.com/signin/challenge','https://classroom.google.com/h']);
    await openClassroomHome(page,{emit:(type,data)=>events.push([type,data]),pollMs:1});
    assert.equal(events.length,1,'the sign-in request is shown once');
    assert.match(events[0][1].message,/Sign in to your school Google account/);
  }
  // Never signs in: stops with a sign-in message, not a vague failure.
  {
    const page=fakePage(['https://accounts.google.com/ServiceLogin']);
    await assert.rejects(openClassroomHome(page,{timeoutMs:1000,pollMs:600}),error=>/sign-in did not finish/i.test(error.message)&&error.code==='AUTH_REQUIRED');
  }
  // Window closed while waiting.
  {
    const page=fakePage(['https://accounts.google.com/ServiceLogin'],{closeAt:2});
    await assert.rejects(openClassroomHome(page,{pollMs:1}),/window was closed before sign-in finished/);
  }
  // Teacher-only People controls decide whether a fallback class is used.
  assert.equal(await peoplePageShowsTeacher(fakePage(['x'],{teacherControls:1})),true);
  assert.equal(await peoplePageShowsTeacher(fakePage(['x'],{teacherControls:0})),false);
  console.log('Classroom home checks passed: signed-in, sign-in wait, sign-in timeout, closed window, and teacher-only fallback.');
})().catch(error=>{console.error(error);process.exit(1)});
