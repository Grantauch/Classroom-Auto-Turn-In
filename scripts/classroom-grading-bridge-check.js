const fs=require('fs'),path=require('path'),os=require('os');
const {createGradingService}=require('../main-services/grading-service');
const {createLocalData}=require('../main-services/local-data');
const {encode}=require('../engine/protocol');
const {decodePayload,assignmentUrls,parseStudentSubmissionUrl,googleAttachmentInfo,extractMaxPoints,sameNumber,clampBatch}=require('../engine/classroom-grading');

function assert(condition,message){if(!condition)throw new Error(message)}
function response(data,{status=200}={}){return {ok:status>=200&&status<300,status,text:async()=>JSON.stringify(data),json:async()=>data}}

const urls=assignmentUrls('course_1','assignment_1');
assert(urls.detailUrl==='https://classroom.google.com/c/course_1/a/assignment_1/details','Assignment detail URL contract changed');
assert(urls.studentWorkUrl.includes('/submissions/'),'Student-work URL contract changed');
const parsed=parseStudentSubmissionUrl('https://classroom.google.com/c/course_1/a/assignment_1/submissions/by-status/and-sort-last-name/done/student/student_1');
assert(parsed.courseId==='course_1'&&parsed.assignmentId==='assignment_1'&&parsed.studentId==='student_1','Student submission URL parser failed');
assert(googleAttachmentInfo('https://docs.google.com/document/d/doc123/edit')?.supported===true,'Google Docs attachments must remain readable');
assert(googleAttachmentInfo('https://docs.google.com/spreadsheets/d/sheet123/edit')?.supported===false,'Sheets must fail closed until explicitly supported');
assert(extractMaxPoints('Due tomorrow\n10 points')===10,'Classroom point-total parser failed');
assert(extractMaxPoints('Total points: 10. Criterion A: 4 points. Criterion B: 6 points.')===10,'Explicit rubric total did not take priority over criterion points');
assert(extractMaxPoints('Criterion A: 4 points. Criterion B: 6 points.')===null,'Ambiguous criterion points were mistaken for an assignment total');
assert(!sameNumber('',0)&&!sameNumber(null,0)&&sameNumber('0',0),'Blank Classroom grade values must never verify as a saved zero');
assert(clampBatch(999)===60&&clampBatch(0)===5&&clampBatch(19)===19,'Classroom grading batch bounds changed unexpectedly');

const writerSource=fs.readFileSync(path.join(__dirname,'..','engine','grading-classroom-write.js'),'utf8');
assert(!writerSource.includes('.click('),'Draft-grade writer must not click Classroom actions such as Return');
assert(writerSource.includes("status:'SAVED_DRAFT'")&&writerSource.includes('work was not returned to the student'),'Draft writer lost its draft-only verification contract');

const good={
  score:10,max_score:10,
  rubric_breakdown:[
    {criterion:'Factory jobs',earned:4,possible:4,evidence:'Factories created jobs'},
    {criterion:'Migration',earned:3,possible:3,evidence:'people moved to cities'},
    {criterion:'Connection',earned:3,possible:3,evidence:'for work'}
  ],
  feedback:'Clear and complete.',needs_teacher_review:false,review_reason:null
};

(async()=>{
  const oldFetch=global.fetch;
  global.fetch=async(url,opts={})=>{
    if(url==='http://127.0.0.1:11434/api/tags')return response({models:[{name:'qwen3.6:latest',model:'qwen3.6:latest',details:{parameter_size:'36.0B'}}]});
    if(url==='http://127.0.0.1:11434/api/chat')return response({model:'qwen3.6:latest',done:true,done_reason:'stop',message:{role:'assistant',content:JSON.stringify(good)}});
    throw new Error(`Unexpected fetch URL: ${url}`);
  };
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cati-classroom-grading-')),localData=createLocalData(()=>root);
  const reviewRoot=path.join(root,'private-review');fs.mkdirSync(reviewRoot);
  let writeCalls=0,extractCalls=0,discoverCalls=0;
  const runNodeScript=async(file,args=[])=>{
    if(file==='grading-classroom-discover.js'){
      discoverCalls++;
      const request=decodePayload(args[0]),courseId=request.courseId,assignmentId=courseId==='course_2'?'assignment_2':'assignment_1';
      return encode('grading-assignments',{courseId,courseDisplayName:request.courseDisplayName,assignments:[{courseId,assignmentId,title:courseId==='course_2'?'Reconstruction':'Industrialization',detailUrl:assignmentUrls(courseId,assignmentId).detailUrl,studentWorkUrl:assignmentUrls(courseId,assignmentId).studentWorkUrl}]})+'\n';
    }
    if(file==='grading-classroom-extract.js'){
      extractCalls++;
      const request=decodePayload(args[0]);
      assert(request.courseId==='course_1'&&request.assignmentId==='assignment_1','Extraction request targeted the wrong assignment');
      assert(request.batchSize===3,'Configured Classroom grading batch size was not honored');
      return encode('grading-submissions',{
        assignment:{courseId:'course_1',assignmentId:'assignment_1',title:'Industrialization',detailUrl:urls.detailUrl,studentWorkUrl:urls.studentWorkUrl,question:'Why did industrialization cause cities to grow?',questionComplete:true,questionReason:'',maxPoints:10,maxPointsReason:''},
        totalStudentRows:4,alreadyGraded:1,
        packets:[
          {studentId:'student_1',studentName:'Alice',studentUrl:'https://classroom.google.com/c/course_1/a/assignment_1/submissions/by-status/and-sort-last-name/done/student/student_1',existingGrade:'',extractionComplete:true,extractionReason:'',studentWork:'Factories created jobs so people moved to cities for work.',attachments:[]},
          {studentId:'student_2',studentName:'Bob',studentUrl:'https://classroom.google.com/c/course_1/a/assignment_1/submissions/by-status/and-sort-last-name/done/student/student_2',existingGrade:'',extractionComplete:false,extractionReason:'A PDF attachment could not be read safely.',studentWork:'',attachments:[{kind:'drive-file',supported:false}]},
          {studentId:'student_3',studentName:'Cara',studentUrl:'https://classroom.google.com/c/course_1/a/assignment_1/submissions/by-status/and-sort-last-name/done/student/student_3',existingGrade:'8',extractionComplete:false,extractionReason:'A draft grade already exists.',studentWork:'',attachments:[]},
          {studentId:'student_1',studentName:'Alice duplicate',studentUrl:'https://classroom.google.com/c/course_1/a/assignment_1/submissions/by-status/and-sort-last-name/done/student/student_1',existingGrade:'',extractionComplete:true,extractionReason:'',studentWork:'Factories created jobs so people moved to cities for work.',attachments:[]}
        ]
      })+'\n';
    }
    if(file==='grading-classroom-write.js'){
      writeCalls++;
      const request=decodePayload(args[0]);
      assert(request.courseId==='course_1'&&request.assignmentId==='assignment_1','Write request targeted the wrong assignment');
      assert(request.writes.length===1,'Writer received anything other than the single validated SAFE_DRAFT');
      assert(request.writes[0].studentId==='student_1'&&request.writes[0].score===10&&request.writes[0].maxScore===10,'Writer received the wrong draft score');
      assert(request.writes[0].classification==='SAFE_DRAFT','Writer did not receive an explicit SAFE_DRAFT classification');
      return encode('grading-write-result',{courseId:'course_1',assignmentId:'assignment_1',results:[{studentId:'student_1',studentName:'Alice',score:10,maxScore:10,status:'SAVED_DRAFT',message:'Draft grade saved and verified. The work was not returned to the student.'}]})+'\n';
    }
    throw new Error(`Unexpected engine script: ${file}`);
  };
  try{
    localData.saveConfig({...localData.loadConfig(),courseUrl:'https://classroom.google.com/c/lesson_plan_course',courseDisplayName:'Staff Lesson Plans'});
    const service=createGradingService({localData,ensureAutomationIdle(){},compactError:e=>String(e?.message||e),runNodeScript,runExclusiveBrowser:(_label,fn)=>fn()});
    service.saveSettings({enabled:true,model:'qwen3.6:latest',classroomDraftWriteEnabled:false,batchSize:3});
    for(let i=1;i<=6;i++)service.addGradingClassroom({courseId:`course_${i}`,courseDisplayName:`Period ${i}`});
    service.addGradingClassroom({courseId:'course_1',courseDisplayName:'US History'});
    let settings=service.loadSettings();
    assert(settings.gradingClassrooms.length===6,'Six separate grading Classrooms were not preserved');
    assert(settings.gradingClassrooms.filter(course=>course.courseId==='course_1').length===1,'Duplicate grading Classroom was not deduplicated');
    assert(localData.loadConfig().courseUrl.endsWith('/lesson_plan_course'),'Adding grading Classrooms changed the lesson-plan Classroom');
    const discovered=await service.discoverAssignments('course_1');
    const switched=await service.discoverAssignments('course_2');
    assert(discoverCalls===2&&discovered.assignments.length===1&&switched.assignments[0].courseId==='course_2','Independent multi-Classroom assignment discovery bridge failed');
    let unknownBlocked=false;
    try{await service.discoverAssignments('not_saved')}catch(error){unknownBlocked=/saved grading Classrooms/i.test(String(error.message))}
    assert(unknownBlocked&&discoverCalls===2,'An unsaved grading Classroom reached the browser bridge');
    service.removeGradingClassroom('course_6');
    assert(service.loadSettings().gradingClassrooms.length===5&&localData.loadConfig().courseUrl.endsWith('/lesson_plan_course'),'Removing a grading Classroom touched lesson-plan setup or the wrong list');

    let blocked=false;
    const rubric='Total points: 10. Factory jobs: 4 points. Migration: 3 points. Connection: 3 points.';
    try{await service.processClassroomAssignment({assignment:discovered.assignments[0],rubric,writeDrafts:true,batchSize:3})}catch(e){blocked=/draft writing is off/i.test(String(e.message));}
    assert(blocked,'Classroom draft write was not blocked while the separate write setting was off');
    assert(writeCalls===0,'Writer ran while draft writing was disabled');

    service.saveSettings({enabled:true,model:'qwen3.6:latest',classroomDraftWriteEnabled:true,batchSize:3,activeGradingCourseId:'course_1',reviewExportEnabled:true,reviewFolderPath:reviewRoot});
    let confirmationBlocked=false;
    try{await service.processClassroomAssignment({assignment:discovered.assignments[0],rubric,writeDrafts:true,batchSize:3})}catch(e){confirmationBlocked=/one-time teacher confirmation/i.test(String(e.message));}
    assert(confirmationBlocked&&writeCalls===0&&extractCalls===0,'Writer was not blocked without a one-time teacher confirmation');
    const preview=await service.processClassroomAssignment({assignment:discovered.assignments[0],rubric,writeDrafts:false,batchSize:3});
    assert(preview.summary.safeDrafts===1&&preview.summary.teacherReview===3,'Preview did not classify SAFE_DRAFT / TEACHER_REVIEW and duplicate identities correctly');
    assert(preview.summary.draftsSaved===0&&writeCalls===0,'Preview mode wrote a Classroom grade');
    assert(preview.reviewExport?.recordCount===4&&fs.existsSync(path.join(preview.reviewExport.folderPath,'assignment-review.json')),'Teacher-enabled grading review packet was not saved');
    const reviewFiles=fs.readdirSync(preview.reviewExport.folderPath);
    assert(reviewFiles.some(name=>/Alice.*\.json$/i.test(name))&&reviewFiles.includes('EXPORT-COMPLETE.txt'),'Grading review packet is incomplete');
    const aliceReview=JSON.parse(fs.readFileSync(path.join(preview.reviewExport.folderPath,reviewFiles.find(name=>/Alice.*\.json$/i.test(name))),'utf8'));
    assert(/Factories created jobs/.test(aliceReview.evidenceAsGraded)&&aliceReview.classification==='SAFE_DRAFT'&&aliceReview.proposedGrade.score===10,'Review packet did not preserve the exact graded evidence and validated score');

    const writeAuthorization=service.authorizeWriteBatch(discovered.assignments[0]);
    const written=await service.processClassroomAssignment({assignment:discovered.assignments[0],rubric,writeDrafts:true,writeAuthorization,batchSize:3});
    assert(extractCalls===2&&writeCalls===1,'Classroom grading bridge did not use the expected extract/write phases');
    let reusedBlocked=false;
    try{await service.processClassroomAssignment({assignment:discovered.assignments[0],rubric,writeDrafts:true,writeAuthorization,batchSize:3})}catch(e){reusedBlocked=/one-time teacher confirmation/i.test(String(e.message));}
    assert(reusedBlocked&&extractCalls===2&&writeCalls===1,'One-time Classroom write authorization was reusable');
    assert(written.summary.safeDrafts===1&&written.summary.teacherReview===3&&written.summary.draftsSaved===1,'Draft-write run summary is incorrect');
    const alice=written.results.find(x=>x.studentId==='student_1'),bob=written.results.find(x=>x.studentId==='student_2'),cara=written.results.find(x=>x.studentId==='student_3');
    assert(alice?.writeStatus==='SAVED_DRAFT','Validated SAFE_DRAFT was not marked saved');
    assert(bob?.status==='TEACHER_REVIEW'&&bob?.writeStatus==='NOT_WRITTEN','Incomplete evidence was not held for teacher review');
    assert(cara?.status==='TEACHER_REVIEW'&&cara?.writeStatus==='SKIPPED_EXISTING','Existing grade was not protected from overwrite');
    assert(written.results.some(x=>x.studentName==='Alice duplicate'&&x.status==='TEACHER_REVIEW'&&/duplicate student identity/i.test(x.reason)),'Duplicate student processing did not fail closed');

    const files=fs.readdirSync(localData.dataDir()).filter(x=>!x.endsWith('.bak'));
    assert(!files.some(x=>/student|submission|result|grade/i.test(x)&&x!=='grading-settings.json'),'Classroom grading bridge persisted student grading content unexpectedly');
    fs.rmSync(root,{recursive:true,force:true});
  }finally{global.fetch=oldFetch}
  console.log('Classroom grading bridge checks passed: six independent grading Classrooms, lesson-plan separation, bounded extraction, private review export, preview-only mode, one-time write authorization, SAFE_DRAFT-only writeback, existing-grade protection, and no Return click.');
})().catch(e=>{console.error(e);process.exit(1)});
