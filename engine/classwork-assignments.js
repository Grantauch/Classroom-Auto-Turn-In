const {collectClassroomAssignmentsDom,collectTeacherAssignmentsDom}=require('./classroom-grading');

const SCROLL_PASSES=8;

function scrollStepDom(){
  const root=document.scrollingElement||document.documentElement;
  const before=root.scrollTop,max=Math.max(0,root.scrollHeight-root.clientHeight);
  root.scrollTop=Math.min(max,before+Math.max(500,root.clientHeight*0.8));
  return {before,after:root.scrollTop,max};
}

function anchorForAssignmentDom(assignmentId){
  const wanted=String(assignmentId||'');
  return [...document.querySelectorAll('a[href]')].some(a=>{
    try{return new URL(a.href,location.href).pathname.includes(`/a/${wanted}/`)}catch{return false}
  });
}

// Expands one Classwork card. Teacher cards are collapsed by default and carry no
// assignment links until opened, so nothing can be read from them as they are.
async function expandCard(page,numericId){
  const card=page.locator(`li[data-stream-item-id="${numericId}"]`).first();
  for(const target of [card, card.locator('[role="button"]').first(), card.locator('div').first()]){
    try{await target.click({timeout:4000});await page.waitForTimeout(1200);return true}
    catch{/* try the next handle on this card */}
  }
  return false;
}

function mergeRows(anchorRows,teacherRows){
  const byId=new Map();
  for(const row of anchorRows||[])if(row?.assignmentId)byId.set(row.assignmentId,row);
  for(const row of teacherRows||[]){
    if(!row?.assignmentId)continue;
    const known=byId.get(row.assignmentId);
    if(!known){byId.set(row.assignmentId,row);continue}
    // Classroom's own URLs come from the link. The card's title is the better name: text
    // scraped from an expanded card picks up things like "19 Turned in" instead.
    byId.set(row.assignmentId,{...known,title:/^Assignment\s/.test(row.title||'')?known.title:row.title});
  }
  return [...byId.values()].sort((a,b)=>String(a.title||'').localeCompare(String(b.title||'')));
}

// Reads every assignment on a Classwork page, as a student sees it or as its teacher does.
async function readCourseAssignments(page,courseId,{log=()=>{}}={}){
  const anchorSeen=new Map(),teacherSeen=new Map();
  for(let pass=0;pass<SCROLL_PASSES;pass++){
    for(const row of (await page.evaluate(collectClassroomAssignmentsDom,courseId).catch(()=>[]))||[]){
      if(row?.assignmentId&&!anchorSeen.has(row.assignmentId))anchorSeen.set(row.assignmentId,row);
    }
    for(const row of (await page.evaluate(collectTeacherAssignmentsDom,courseId).catch(()=>[]))||[]){
      if(row?.assignmentId&&!teacherSeen.has(row.assignmentId))teacherSeen.set(row.assignmentId,row);
    }
    const moved=await page.evaluate(scrollStepDom).catch(()=>({before:0,after:0,max:0}));
    if(moved.after>=moved.max-5||moved.after===moved.before)break;
    await page.waitForTimeout(350);
  }
  const teacherRows=[...teacherSeen.values()];
  if(!teacherRows.length)return mergeRows([...anchorSeen.values()],[]);

  // One card is opened and checked against Classroom's own link before the rest are trusted.
  const sample=teacherRows[0];
  let verified=await page.evaluate(anchorForAssignmentDom,sample.assignmentId).catch(()=>false);
  if(!verified&&await expandCard(page,sample.numericId)){
    verified=await page.evaluate(anchorForAssignmentDom,sample.assignmentId).catch(()=>false);
    for(const row of (await page.evaluate(collectClassroomAssignmentsDom,courseId).catch(()=>[]))||[]){
      if(row?.assignmentId&&!anchorSeen.has(row.assignmentId))anchorSeen.set(row.assignmentId,row);
    }
  }
  if(verified){
    log(`Classwork card identity verified against Classroom for ${teacherRows.length} assignment(s).`);
    return mergeRows([...anchorSeen.values()],teacherRows);
  }

  // The shortcut did not hold on this page, so every card is opened and read directly.
  log('Classwork card identity could not be verified, so every card is being opened and read.');
  for(const row of teacherRows){
    if(!await expandCard(page,row.numericId))continue;
    for(const found of (await page.evaluate(collectClassroomAssignmentsDom,courseId).catch(()=>[]))||[]){
      if(found?.assignmentId&&!anchorSeen.has(found.assignmentId))anchorSeen.set(found.assignmentId,found);
    }
  }
  return mergeRows([...anchorSeen.values()],[]);
}

module.exports={readCourseAssignments};
