const {launchTeacherContext}=require('./browser');
const {loadConfig,log}=require('./lib');
const {parseClassroomIds}=require('./safety');
const {assertGoogleSession}=require('./classroom-actions');
const {collectClassroomAssignmentsDom}=require('./classroom-grading');
const {emit,emitError}=require('./protocol');

async function collectAssignments(page,courseId){
  const seen=new Map();
  for(let pass=0;pass<8;pass++){
    const rows=await page.evaluate(collectClassroomAssignmentsDom,courseId).catch(()=>[]);
    for(const row of rows||[])if(row?.assignmentId&&!seen.has(row.assignmentId))seen.set(row.assignmentId,row);
    const moved=await page.evaluate(()=>{
      const root=document.scrollingElement||document.documentElement;
      const before=root.scrollTop,max=Math.max(0,root.scrollHeight-root.clientHeight);
      root.scrollTop=Math.min(max,before+Math.max(500,root.clientHeight*0.8));
      return {before,after:root.scrollTop,max};
    }).catch(()=>({before:0,after:0,max:0}));
    if(moved.after>=moved.max-5||moved.after===moved.before)break;
    await page.waitForTimeout(350);
  }
  return [...seen.values()].sort((a,b)=>String(a.title||'').localeCompare(String(b.title||'')));
}

(async()=>{
  const cfg=loadConfig(),courseId=parseClassroomIds(cfg.courseUrl).courseId;
  if(!courseId)throw new Error('Choose a Classroom in Setup before using Classroom grading.');
  const context=await launchTeacherContext(cfg,{headless:false});
  try{
    const page=context.pages()[0]||await context.newPage();
    const url=`https://classroom.google.com/w/${courseId}/t/all`;
    emit('status',{message:'Opening the selected Classroom to find assignments for draft grading.'});
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
    await assertGoogleSession(page,'Classroom grading');
    await page.locator('main,[role="main"]').first().waitFor({state:'visible',timeout:20000});
    await page.waitForTimeout(1000);
    const assignments=await collectAssignments(page,courseId);
    if(!assignments.length)throw new Error('CATI could not find any assignments in the selected Classroom. Open Classwork and confirm assignments are visible, then try again.');
    log(`Classroom grading discovery found ${assignments.length} assignment(s) in configured course ${courseId}.`);
    emit('grading-assignments',{courseId,courseDisplayName:cfg.courseDisplayName||'',assignments});
  }finally{await context.close().catch(()=>{})}
})().catch(error=>{emitError(error);process.exit(1)});
