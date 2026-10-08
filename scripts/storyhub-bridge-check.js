const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {sourceScope,parseCsv,submissionsFromCsv,catalog,matchSubmissions,hubEvidence,readTurnIns}=require('../engine/storyhub-submissions');
const {createGradingService}=require('../main-services/grading-service');
const {createLocalData}=require('../main-services/local-data');
const {encode}=require('../engine/protocol');

const headers=['Student Email','Class / Period','Hub','Hub Title','Submission ID','Data'];
const csv=rows=>rows.map(row=>row.map(cell=>'"'+String(cell).replace(/"/g,'""')+'"').join(',')).join('\r\n');
const record=(answer='A quoted "answer"\nwith a second line.')=>JSON.stringify({hub:'ush9-example',turnedIn:true,savedAt:'2026-10-08T12:00:00Z',answers:[{k:'q1',q:'What happened?',a:answer},{k:'q2',q:'Why?',a:''}]});
const row=(email,id,data=record(),period='Period 1')=>[email,period,'ush9-example','Example',id,data];
const scope={kind:'storyhub',spreadsheetUrl:'https://docs.google.com/spreadsheets/d/SYNTHETIC_PRIVATE_SHEET/edit',hub:'ush9-example',classPeriod:'Period 1'};
const roster={studentsHeadingFound:true,scrollComplete:true,students:[{email:'ada@example.org',sourceStudentId:'ada'},{email:'alan@example.org',sourceStudentId:'alan'}]};

(async()=>{
  assert.equal(sourceScope(scope).hub,'ush9-example');
  for(const url of ['https://evil.example/spreadsheets/d/x','https://docs.google.com.evil.example/spreadsheets/d/x','http://docs.google.com/spreadsheets/d/x'])assert.throws(()=>sourceScope({...scope,spreadsheetUrl:url}));
  assert.equal(sourceScope({kind:'classroom'}),null);
  assert.deepEqual(parseCsv('"a,b","c""d"\n"line\nline",""'),[['a,b','c"d'],['line\nline','']]);
  assert.throws(()=>parseCsv('"unfinished'),/ended/);
  assert.throws(()=>parseCsv('"x"oops'),/unreadable/);
  const source=submissionsFromCsv(csv([headers,row('ADA@EXAMPLE.ORG','old',record('old')),row('ada@example.org','new'),row('alan@example.org','other-hour',record(),'Period 2')]));
  assert.equal(catalog(source).length,2);
  const matches=matchSubmissions(source,scope,roster);
  assert.equal(matches.get('ada').submission.submissionId,'new');
  assert.match(hubEvidence(matches.get('ada').submission),/quoted "answer"\nwith a second line/);
  assert.match(hubEvidence(matches.get('ada').submission),/Why\?\n\(blank\)/);
  assert.equal(matches.get('alan').submission,null,'Never match across periods');
  const sorted=submissionsFromCsv(csv([headers,row('ada@example.org','newest',record('new').replace('12:00:00','13:00:00')),row('ada@example.org','oldest',record('old'))]));
  assert.equal(matchSubmissions(sorted,scope,roster).get('ada').submission.submissionId,'newest','Sorting the sheet must not select older work');
  const corrupt=submissionsFromCsv(csv([headers,row('ada@example.org','old'),row('ada@example.org','new','broken')]));
  assert.throws(()=>hubEvidence(matchSubmissions(corrupt,scope,roster).get('ada').submission),/newest/);
  assert.throws(()=>matchSubmissions(source,scope,{...roster,scrollComplete:false}),/complete/);
  const ambiguous=matchSubmissions(source,scope,{...roster,students:[...roster.students,{email:'ada@example.org',sourceStudentId:'someoneElse'}]});
  assert.equal(ambiguous.has('ada'),false);assert.equal(ambiguous.has('someoneElse'),false);
  assert.equal(ambiguous.unmatched.length,1,'Unmatched work must remain visible for teacher review');
  assert.equal(matchSubmissions(source,scope,{...roster,students:[{email:'other@example.org',name:'Ada',sourceStudentId:'ada'}]}).get('ada').submission,null,'Name is never identity evidence');

  const good={request:{get:async()=>({ok:()=>true,url:()=>scope.spreadsheetUrl,headers:()=>({'content-type':'text/csv'}),text:async()=>csv([headers,row('ada@example.org','x')])})}};
  assert.equal((await readTurnIns(good,scope.spreadsheetUrl)).length,1);
  await assert.rejects(()=>readTurnIns({request:{get:async()=>({ok:()=>true,url:()=> 'https://accounts.google.com/login',headers:()=>({'content-type':'text/html'})})}},scope.spreadsheetUrl),/teacher account/);

  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gc-hub-bridge-'));
  try{
    const localData=createLocalData(()=>root);let received=null;
    const service=createGradingService({localData,ensureAutomationIdle:()=>{},compactError:e=>e.message,runNodeScript:async(file,args)=>{
      if(file==='read-storyhub-submissions.js')return encode('storyhub-catalog',{spreadsheetUrl:scope.spreadsheetUrl,groups:catalog(source)});
      if(file==='grading-classroom-extract.js'){received=JSON.parse(Buffer.from(args[0],'base64url'));return encode('grading-submissions',{assignment:{courseId:'course',assignmentId:'assignment',title:'Example',question:'Explain',questionComplete:false,maxPoints:10},packets:[{studentId:'ada',studentName:'Ada',source:'storyhub',submissionId:'new',studentWork:'Complete hub answer for teacher review',extractionComplete:true}]})}
      throw new Error('Unexpected runner '+file);
    }});
    service.addGradingClassroom({courseId:'course',name:'Synthetic History'});
    service.saveSettings({enabled:true,batchSize:35});
    await service.readStoryHubCatalog({spreadsheetUrl:scope.spreadsheetUrl});
    assert.equal(service.loadSettings().storyHubSheetUrl,scope.spreadsheetUrl);
    assert.equal(service.loadSettings().batchSize,35);
    const result=await service.processClassroomAssignment({assignment:{courseId:'course',assignmentId:'assignment'},submissionSource:scope,writeDrafts:false,batchSize:35});
    assert.equal(received.submissionSource.hub,scope.hub);assert.equal(received.batchSize,35);
    assert.equal(result.summary.teacherReview,1);assert.equal(result.summary.draftsSaved,0);
    assert.equal(result.results[0].studentWork,'Complete hub answer for teacher review','Answers must remain visible when incomplete assignment directions prevent grading');
    await assert.rejects(()=>service.processClassroomAssignment({assignment:{courseId:'course',assignmentId:'assignment'},submissionSource:{...scope,hub:''}}),/choose the hub/);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
  console.log('StoryHub bridge checks passed: private sheet parsing, full evidence, newest-row handling, explicit hub/period scope, verified email identity, ambiguous and missing matches, auth rejection, settings and grading-service integration.');
})().catch(error=>{console.error(error);process.exit(1)});
