const {launchTeacherContext}=require('./browser');
const {loadConfig,log}=require('./lib');
const {assertGoogleSession}=require('./classroom-actions');
const {parseClassroomIds}=require('./safety');
const {clean,decodePayload}=require('./classroom-grading');
const {readCourseAssignments}=require('./classwork-assignments');
const {extractAssignmentTextDom}=require('./classroom-grading');
const {emit,emitError}=require('./protocol');
const {readReadyAssignmentDom,assignmentChecks,buildReadySnapshot,stableKey}=require('./ready-snapshot');
const pkg=require('../package.json');

const MAX_ASSIGNMENTS_PER_COURSE=8;
const MAX_COURSES=20;

function safeCourse(value={}){
  const courseId=clean(value.courseId,300),courseName=clean(value.courseDisplayName||value.courseName||value.name,200);
  if(!courseId||!/^[A-Za-z0-9_-]+$/.test(courseId))return null;
  return {courseId,courseName:courseName||'Selected Classroom'};
}

async function openCourse(page,course){
  const url=`https://classroom.google.com/w/${course.courseId}/t/all`;
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
  await assertGoogleSession(page,'Ready classroom preflight');
  await page.locator('main,[role="main"]').first().waitFor({state:'visible',timeout:30000});
  await page.waitForTimeout(700);
  const ids=parseClassroomIds(page.url());
  if(ids.courseId!==course.courseId)throw new Error('Ready opened a different Classroom than expected.');
}

async function inspectAssignment(page,course,item){
  const title=clean(item.title,300)||'Assignment';
  const detailUrl=`https://classroom.google.com/c/${course.courseId}/a/${clean(item.assignmentId,300)}/details`;
  try{
    await page.goto(detailUrl,{waitUntil:'domcontentloaded',timeout:45000});
    await assertGoogleSession(page,'Ready assignment preflight');
    await page.locator('main,[role="main"]').first().waitFor({state:'visible',timeout:30000});
    await page.waitForTimeout(650);
    const ids=parseClassroomIds(page.url());
    if(ids.courseId!==course.courseId||ids.assignmentId!==item.assignmentId)throw new Error('Classroom opened a different assignment than Ready expected.');
    const [assignmentText,evidence]=await Promise.all([
      page.evaluate(extractAssignmentTextDom,title).catch(()=>({text:'',truncated:true})),
      page.evaluate(readReadyAssignmentDom).catch(()=>({due:{state:'unknown',display:'',candidates:[]},links:[]}))
    ]);
    return [
      {id:`${stableKey(course.courseName,title)}-access`,label:'Assignment opens',status:'pass',detail:'GoClassroom opened and verified this assignment detail page without changing it.',assignmentTitle:title},
      ...assignmentChecks({courseName:course.courseName,assignmentTitle:title,assignmentText:assignmentText?.text||'',assignmentTextTruncated:assignmentText?.truncated===true,evidence})
    ];
  }catch(error){
    return [{
      id:`${stableKey(course.courseName,title)}-access`,
      label:'Assignment could not be verified',
      status:'block',
      detail:'GoClassroom could not open and verify this assignment detail page safely.',
      assignmentTitle:title,
      suggestedAction:'Open the assignment in Classroom and confirm it loads correctly.'
    }];
  }
}

(async()=>{
  const input=decodePayload(process.argv[2]),cfg=loadConfig();
  const supplied=Array.isArray(input.courses)?input.courses:[];
  const courses=supplied.map(safeCourse).filter(Boolean).slice(0,MAX_COURSES);
  if(!courses.length)throw new Error('Ready needs at least one saved Classroom to scan.');
  const requested=Math.floor(Number(input.maxAssignmentsPerCourse)||MAX_ASSIGNMENTS_PER_COURSE);
  const maxAssignmentsPerCourse=Math.max(1,Math.min(MAX_ASSIGNMENTS_PER_COURSE,requested));
  const context=await launchTeacherContext(cfg,{headless:false});
  try{
    const page=context.pages()[0]||await context.newPage();
    const readyCourses=[];
    for(const course of courses){
      const checks=[];
      emit('status',{message:`Ready is checking ${course.courseName}.`});
      try{
        await openCourse(page,course);
        checks.push({id:`${stableKey(course.courseName)}-classroom-access`,label:'Classroom opens',status:'pass',detail:'GoClassroom opened the selected Classwork page and verified the course identity.'});
        const assignments=await readCourseAssignments(page,course.courseId,{log,preserveOrder:true});
        if(!assignments.length){
          checks.push({id:`${stableKey(course.courseName)}-assignment-coverage`,label:'Upcoming work needs a look',status:'warning',detail:'Ready did not find assignment cards it could verify in this Classwork page.',suggestedAction:'Open Classwork and confirm the assignments you expect are posted.'});
        }else{
          const selected=assignments.slice(0,maxAssignmentsPerCourse);
          const coverageStatus=assignments.length>selected.length?'warning':'pass';
          checks.push({
            id:`${stableKey(course.courseName)}-assignment-coverage`,
            label:coverageStatus==='pass'?'Classwork was discovered':'Bounded scan reached its V1 limit',
            status:coverageStatus,
            detail:coverageStatus==='pass'
              ?`Ready found ${assignments.length} assignment${assignments.length===1?'':'s'} and included them in this preflight.`
              :`Ready found ${assignments.length} assignments and checked the first ${selected.length} shown by Classroom. This V1 scan is intentionally bounded.`,
            suggestedAction:coverageStatus==='warning'?'Review older Classwork items manually if they still matter for the next class.':undefined
          });
          for(const item of selected){
            emit('status',{message:`Ready is checking ${course.courseName}: ${clean(item.title,120)||'assignment'}.`});
            checks.push(...await inspectAssignment(page,course,item));
          }
        }
      }catch(error){
        checks.push({id:`${stableKey(course.courseName)}-classroom-access`,label:'Classroom could not be verified',status:'block',detail:'GoClassroom could not open and verify this Classroom safely.',suggestedAction:'Open the class in Google Classroom and make sure the correct work account is signed in.'});
      }
      readyCourses.push({courseName:course.courseName,windowLabel:'current Classwork',checks});
    }
    const snapshot=buildReadySnapshot({source:'GoClassroom',sourceVersion:`v${pkg.version}`,courses:readyCourses});
    emit('ready-snapshot',snapshot);
  }finally{await context.close().catch(()=>{})}
})().catch(error=>{emitError(error);process.exit(1)});
