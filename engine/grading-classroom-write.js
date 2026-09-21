const {launchTeacherContext}=require('./browser');
const {loadConfig,log}=require('./lib');
const {assertGoogleSession}=require('./classroom-actions');
const {clean,strictNumber,sameNumber,decodePayload,parseStudentSubmissionUrl,markTotalGradeInputDom}=require('./classroom-grading');
const {emit,emitError}=require('./protocol');

async function openStudentPage(page,studentUrl,courseId,assignmentId,studentId){
  const waitForStudentView=async()=>{
    await page.locator('main,[role="main"],[role="table"],[role="grid"],a[href*="/g/tg/"],a[href*="/submissions/"]').first().waitFor({state:'visible',timeout:15000}).catch(()=>{});
    await page.waitForTimeout(650);
  };
  await page.goto(studentUrl,{waitUntil:'domcontentloaded',timeout:45000});
  await assertGoogleSession(page,'Classroom draft grade');
  await waitForStudentView();
  // #u= is a fragment selector; force a reload so a hash-only move cannot
  // leave the prior student's grade field in the DOM.
  await page.reload({waitUntil:'domcontentloaded',timeout:45000});
  await assertGoogleSession(page,'Classroom draft grade after student selection');
  await waitForStudentView();
  const actual=parseStudentSubmissionUrl(page.url());
  if(actual.courseId!==courseId||actual.assignmentId!==assignmentId||actual.studentId!==studentId)throw new Error('Classroom opened different student work than CATI expected.');
}

async function prepareGradeField(page,expectedMax){
  const found=await page.evaluate(markTotalGradeInputDom).catch(()=>({ok:false,count:0}));
  if(!found?.ok)throw new Error(found?.reason||(found?.count>1?'CATI found more than one possible total-grade field and stopped instead of guessing.':'CATI could not identify the total-grade field for this student.'));
  if(!sameNumber(found.maxPoints,expectedMax))throw new Error(`Classroom shows ${found.maxPoints??'an unknown number of'} possible points beside the grade field, but the validated rubric uses ${expectedMax}. CATI will not scale or guess.`);
  const field=page.locator('[data-cati-grade-target="1"]').first();
  await field.waitFor({state:'visible',timeout:8000});
  return {field,current:clean(await field.inputValue().catch(()=>found.value||''),80),maxPoints:Number(found.maxPoints)};
}

(async()=>{
  const input=decodePayload(process.argv[2]),cfg=loadConfig();
  const courseId=clean(input.courseId,300),assignmentId=clean(input.assignmentId,300),writes=Array.isArray(input.writes)?input.writes.slice(0,60):[];
  if(!courseId||!assignmentId||!writes.length)throw new Error('No validated Classroom draft grades were supplied to the write step.');
  const studentIds=writes.map(item=>clean(item?.studentId,300));
  if(studentIds.some(id=>!id)||new Set(studentIds).size!==studentIds.length)throw new Error('The validated Classroom draft-grade batch contains a missing or duplicate student identity.');
  const context=await launchTeacherContext(cfg,{headless:false});
  const page=context.pages()[0]||await context.newPage(),results=[];
  try{
    for(let i=0;i<writes.length;i++){
      const item=writes[i],score=strictNumber(item.score),maxScore=strictNumber(item.maxScore),studentUrl=clean(item.studentUrl,1500);
      const ids=parseStudentSubmissionUrl(studentUrl);
      const base={studentId:clean(item.studentId,300),studentName:clean(item.studentName,500),score,maxScore};
      try{
        if(ids.courseId!==courseId||ids.assignmentId!==assignmentId||ids.studentId!==base.studentId)throw new Error('The student-work link no longer matches the selected assignment.');
        if(item.classification!=='SAFE_DRAFT')throw new Error('The writer received a grade that was not classified SAFE_DRAFT.');
        if(score===null||maxScore===null||score<0||maxScore<=0||maxScore>100000||score>maxScore)throw new Error('The validated draft score is outside the assignment point range.');
        emit('status',{message:`Saving validated draft grade ${i+1} of ${writes.length}.`});
        await openStudentPage(page,studentUrl,courseId,assignmentId,base.studentId);
        let target=await prepareGradeField(page,maxScore);
        if(target.current){
          if(sameNumber(target.current,score)){results.push({...base,status:'ALREADY_SAVED',message:'The same draft grade was already present, so CATI made no change.'});continue}
          throw new Error('A draft or existing grade appeared before CATI wrote this score. CATI will not overwrite it.');
        }
        await target.field.fill(String(score));
        if(!sameNumber(await target.field.inputValue(),score))throw new Error('The Classroom grade field did not retain the validated score before CATI attempted to save it.');
        await target.field.press('Enter');
        await page.waitForTimeout(1200);
        await page.reload({waitUntil:'domcontentloaded',timeout:45000});
        await assertGoogleSession(page,'Classroom draft-grade verification');
        await page.waitForTimeout(650);
        await page.locator('main,[role="main"]').first().waitFor({state:'visible',timeout:15000});
        target=await prepareGradeField(page,maxScore);
        if(!sameNumber(target.current,score))throw new Error('Classroom did not show the expected draft grade after CATI saved it.');
        results.push({...base,status:'SAVED_DRAFT',message:'Draft grade saved and verified. The work was not returned to the student.'});
      }catch(error){results.push({...base,status:'WRITE_FAILED',message:clean(error.message,1000)});}
    }
    const saved=results.filter(x=>x.status==='SAVED_DRAFT'||x.status==='ALREADY_SAVED').length;
    log(`Classroom draft-grade writer verified ${saved}/${results.length} requested draft score(s).`);
    emit('grading-write-result',{courseId,assignmentId,results});
  }finally{await context.close().catch(()=>{})}
})().catch(error=>{emitError(error);process.exit(1)});
