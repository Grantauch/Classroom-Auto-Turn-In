const {launchTeacherContext}=require('./browser');
const {loadConfig,log}=require('./lib');
const {assertGoogleSession}=require('./classroom-actions');
const {clean,decodePayload}=require('./classroom-grading');
const {readCourseAssignments}=require('./classwork-assignments');
const {emit,emitError}=require('./protocol');

(async()=>{
  const cfg=loadConfig(),input=decodePayload(process.argv[2]);
  const courseId=clean(input.courseId,300),courseDisplayName=clean(input.courseDisplayName,500);
  if(!courseId)throw new Error('Choose a grading Classroom before finding assignments.');
  const context=await launchTeacherContext(cfg,{headless:false});
  try{
    const page=context.pages()[0]||await context.newPage();
    const url=`https://classroom.google.com/w/${courseId}/t/all`;
    emit('status',{message:'Opening the selected Classroom to find assignments for draft grading.'});
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
    await assertGoogleSession(page,'Classroom grading');
    await page.locator('main,[role="main"]').first().waitFor({state:'visible',timeout:20000});
    await page.waitForTimeout(1000);
    const assignments=await readCourseAssignments(page,courseId,{log});
    if(!assignments.length)throw new Error('This class has no assignments GoClassroom can read yet. Post an assignment in Classwork, then try again.');
    log(`Classroom grading discovery found ${assignments.length} assignment(s) in saved grading course ${courseId}.`);
    emit('grading-assignments',{courseId,courseDisplayName,assignments});
  }finally{await context.close().catch(()=>{})}
})().catch(error=>{emitError(error);process.exit(1)});
