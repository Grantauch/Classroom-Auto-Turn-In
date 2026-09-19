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
assert(clampBatch(99)===10&&clampBatch(0)===5,'Classroom grading batch bounds changed unexpectedly');

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
  let writeCalls=0,extractCalls=0,discoverCalls=0;
  const runNodeScript=async(file,args=[])=>{
    if(file==='grading-classroom-discover.js'){
      discoverCalls++;
      return encode('grading-assignments',{courseId:'course_1',courseDisplayName:'US History',assignments:[{courseId:'course_1',assignmentId:'assignment_1',title:'Industrialization',detailUrl:urls.detailUrl,studentWorkUrl:urls.studentWorkUrl}]})+'\n';
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
    localData.saveConfig({...localData.loadConfig(),courseUrl:'https://classroom.google.com/c/course_1'});
    const service=createGradingService({localData,ensureAutomationIdle(){},compactError:e=>String(e?.message||e),runNodeScript,runExclusiveBrowser:(_label,fn)=>fn()});
    service.saveSettings({enabled:true,model:'qwen3.6:latest',classroomDraftWriteEnabled:false,batchSize:3});
    const discovered=await service.discoverAssignments();
    assert(discoverCalls===1&&discovered.assignments.length===1,'Classroom assignment discovery bridge failed');

    let blocked=false;
    const rubric='Total points: 10. Factory jobs: 4 points. Migration: 3 points. Connection: 3 points.';
    try{await service.processClassroomAssignment({assignment:discovered.assignments[0],rubric,writeDrafts:true,batchSize:3})}catch(e){blocked=/draft writing is off/i.test(String(e.message));}
    assert(blocked,'Classroom draft write was not blocked while the separate write setting was off');
    assert(writeCalls===0,'Writer ran while draft writing was disabled');

    service.saveSettings({enabled:true,model:'qwen3.6:latest',classroomDraftWriteEnabled:true,batchSize:3});
    let confirmationBlocked=false;
    try{await service.processClassroomAssignment({assignment:discovered.assignments[0],rubric,writeDrafts:true,batchSize:3})}catch(e){confirmationBlocked=/one-time teacher confirmation/i.test(String(e.message));}
    assert(confirmationBlocked&&writeCalls===0&&extractCalls===0,'Writer was not blocked without a one-time teacher confirmation');
    const preview=await service.processClassroomAssignment({assignment:discovered.assignments[0],rubric,writeDrafts:false,batchSize:3});
    assert(preview.summary.safeDrafts===1&&preview.summary.teacherReview===3,'Preview did not classify SAFE_DRAFT / TEACHER_REVIEW and duplicate identities correctly');
    assert(preview.summary.draftsSaved===0&&writeCalls===0,'Preview mode wrote a Classroom grade');

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
  console.log('Classroom grading bridge checks passed: assignment discovery, bounded extraction, preview-only mode, persistent opt-in plus one-time write authorization, SAFE_DRAFT-only writeback, existing-grade protection, and no Return click.');
})().catch(e=>{console.error(e);process.exit(1)});
