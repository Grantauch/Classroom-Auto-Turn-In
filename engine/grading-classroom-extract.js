const {launchTeacherContext}=require('./browser');
const {loadConfig,log}=require('./lib');
const {assertGoogleSession}=require('./classroom-actions');
const {
  clean,clampBatch,decodePayload,assignmentUrls,parseStudentSubmissionUrl,googleAttachmentInfo,
  collectStudentSubmissionRowsDom,collectStudentEvidenceDom,extractAssignmentTextDom,readAssignmentMaxPointsDom,findGradeInputsDom
}=require('./classroom-grading');
const {emit,emitError}=require('./protocol');

function bestExistingGrade(inputs){
  const rows=Array.isArray(inputs)?inputs:[];
  const labelled=rows.filter(x=>/\bgrade\b/i.test(x.label||'')&&!/rubric|criterion|maximum|max points?/i.test(x.label||''));
  const candidates=labelled.length?labelled:rows.filter(x=>['number',''].includes(String(x.type||'').toLowerCase())||String(x.inputmode||'').toLowerCase()==='decimal');
  if(candidates.length!==1)return {value:'',ambiguous:candidates.length>1};
  const value=clean(candidates[0].value,60);
  return {value:/^-?\d+(?:\.\d+)?$/.test(value)?value:'',ambiguous:false};
}

async function collectStudentRows(page,assignmentId){
  const seen=new Map();
  for(let pass=0;pass<10;pass++){
    const rows=await page.evaluate(collectStudentSubmissionRowsDom,assignmentId).catch(()=>[]);
    for(const row of rows||[])if(row?.studentId&&!seen.has(row.studentId))seen.set(row.studentId,row);
    const moved=await page.evaluate(()=>{
      const scrollables=[...document.querySelectorAll('*')].filter(el=>{const s=getComputedStyle(el);return /auto|scroll/.test(s.overflowY||'')&&el.scrollHeight>el.clientHeight+40});
      const root=scrollables.sort((a,b)=>b.scrollHeight-b.clientHeight-(a.scrollHeight-a.clientHeight))[0]||document.scrollingElement||document.documentElement;
      const before=root.scrollTop,max=Math.max(0,root.scrollHeight-root.clientHeight);root.scrollTop=Math.min(max,before+Math.max(400,root.clientHeight*0.8));
      return {before,after:root.scrollTop,max};
    }).catch(()=>({before:0,after:0,max:0}));
    if(moved.after>=moved.max-5||moved.after===moved.before)break;
    await page.waitForTimeout(300);
  }
  return [...seen.values()];
}

async function exportGoogleDoc(context,info){
  const response=await context.request.get(info.exportUrl,{timeout:20000,failOnStatusCode:false});
  if(!response.ok())throw new Error(`Google Docs export returned HTTP ${response.status()}.`);
  const responseUrl=typeof response.url==='function'?String(response.url()||''):info.exportUrl;
  let host='';try{host=new URL(responseUrl).hostname.toLowerCase()}catch{/* handled below */}
  if(host!=='docs.google.com')throw new Error('Google Docs export left the trusted Google Docs origin.');
  const headers=typeof response.headers==='function'?response.headers():{},contentType=String(headers?.['content-type']||headers?.['Content-Type']||'').toLowerCase();
  if(contentType&&!/^text\/plain\b/.test(contentType))throw new Error('Google Docs export did not return plain text.');
  const raw=String(await response.text()??'').replace(/\u0000/g,'').trim();
  if(raw.length>60000)throw new Error('The Google Docs attachment is too long to grade without truncating evidence.');
  const text=clean(raw,60000);
  if(!text)throw new Error('Google Docs export returned no readable text.');
  return text;
}

async function extractOneStudent({context,page,row,courseId,assignmentId}){
  const ids=parseStudentSubmissionUrl(row.studentUrl);
  if(ids.courseId!==courseId||ids.assignmentId!==assignmentId||ids.studentId!==row.studentId)throw new Error('A student-work link did not match the selected Classroom assignment.');
  await page.goto(row.studentUrl,{waitUntil:'domcontentloaded',timeout:45000});
  await assertGoogleSession(page,'student work for local grading');
  await page.locator('main,[role="main"]').first().waitFor({state:'visible',timeout:15000});
  await page.waitForTimeout(700);
  const actual=parseStudentSubmissionUrl(page.url());
  if(actual.courseId!==courseId||actual.assignmentId!==assignmentId||actual.studentId!==row.studentId)throw new Error('Classroom opened different student work than CATI expected.');

  const gradeInputs=await page.evaluate(findGradeInputsDom).catch(()=>[]),grade=bestExistingGrade(gradeInputs);
  if(grade.ambiguous)return {...row,existingGrade:'',extractionComplete:false,extractionReason:'CATI could not identify one unambiguous total-grade field for this student.',studentWork:'',attachments:[]};
  if(grade.value)return {...row,existingGrade:grade.value,extractionComplete:false,extractionReason:'A draft or existing grade is already present. CATI will not overwrite it.',studentWork:'',attachments:[]};

  const evidence=await page.evaluate(collectStudentEvidenceDom,row.studentName).catch(()=>({directAnswers:[],attachments:[],oversizedEvidence:false,tooManyAttachments:false}));
  const parts=[];
  for(const answer of evidence.directAnswers||[])if(clean(answer,60000))parts.push(`DIRECT RESPONSE:\n${clean(answer,60000)}`);
  const attachmentSummary=[];let unsupported=!!evidence.oversizedEvidence||!!evidence.tooManyAttachments;const seenAttachments=new Set();
  for(const att of evidence.attachments||[]){
    const info=googleAttachmentInfo(att.href);
    if(!info)continue;
    const attachmentKey=`${info.kind}:${info.id}`;if(seenAttachments.has(attachmentKey))continue;seenAttachments.add(attachmentKey);
    if(!info.supported){unsupported=true;attachmentSummary.push({title:clean(att.title,240),kind:info.kind,supported:false});continue}
    try{
      const text=await exportGoogleDoc(context,info);
      parts.push(`GOOGLE DOC ATTACHMENT:\n${text}`);
      attachmentSummary.push({title:clean(att.title,240),kind:info.kind,supported:true});
    }catch(error){unsupported=true;attachmentSummary.push({title:clean(att.title,240),kind:info.kind,supported:false,error:clean(error.message,300)});}
  }
  const combined=parts.join('\n\n---\n\n'),studentWork=clean(combined,60000);
  let extractionComplete=true,extractionReason='';
  if(!studentWork){extractionComplete=false;extractionReason='CATI did not find a readable direct response or supported Google Doc attachment for this student.';}
  else if(combined.length>60000){extractionComplete=false;extractionReason='The combined student submission is too long to grade without truncating evidence.';}
  else if(unsupported){extractionComplete=false;extractionReason='At least one student attachment could not be read safely, so CATI will not grade from incomplete evidence.';}
  return {...row,existingGrade:'',extractionComplete,extractionReason,studentWork,attachments:attachmentSummary};
}

(async()=>{
  const input=decodePayload(process.argv[2]),cfg=loadConfig();
  const courseId=clean(input.courseId,300),assignmentId=clean(input.assignmentId,300),title=clean(input.title,1000),batchSize=clampBatch(input.batchSize);
  if(!courseId||!assignmentId)throw new Error('Choose a Classroom assignment before scanning student work.');
  const urls=assignmentUrls(courseId,assignmentId),detailUrl=clean(input.detailUrl,1000)||urls.detailUrl;
  const preferredStudentWorkUrl=clean(input.studentWorkUrl,1500)||urls.studentWorkUrl;
  const context=await launchTeacherContext(cfg,{headless:false});
  try{
    const page=context.pages()[0]||await context.newPage();
    emit('status',{message:`Reading assignment directions for ${title||'the selected assignment'}.`});
    await page.goto(detailUrl,{waitUntil:'domcontentloaded',timeout:45000});
    await assertGoogleSession(page,'assignment directions for local grading');
    await page.locator('main,[role="main"]').first().waitFor({state:'visible',timeout:15000});
    await page.waitForTimeout(700);
    const assignmentText=await page.evaluate(extractAssignmentTextDom,title).catch(()=>({text:'',mainText:'',truncated:true}));
    const points=await page.evaluate(readAssignmentMaxPointsDom).catch(()=>({ok:false,value:null,reason:'CATI could not read the Classroom assignment point total safely.'}));
    const maxPoints=points?.ok?Number(points.value):null;

    let studentPageUrl=preferredStudentWorkUrl;
    emit('status',{message:`Looking for turned-in student work for ${title||'the selected assignment'}.`});
    await page.goto(studentPageUrl,{waitUntil:'domcontentloaded',timeout:45000});
    await assertGoogleSession(page,'Classroom student work');
    await page.locator('main,[role="main"]').first().waitFor({state:'visible',timeout:15000});
    await page.waitForTimeout(900);
    let rows=await collectStudentRows(page,assignmentId);
    if(!rows.length&&studentPageUrl!==urls.studentWorkAllUrl){
      studentPageUrl=urls.studentWorkAllUrl;
      await page.goto(studentPageUrl,{waitUntil:'domcontentloaded',timeout:45000});
      await assertGoogleSession(page,'Classroom student work');
      await page.locator('main,[role="main"]').first().waitFor({state:'visible',timeout:15000});
      await page.waitForTimeout(900);
      rows=await collectStudentRows(page,assignmentId);
    }
    const eligible=rows.filter(row=>!row.existingGrade&&!/\b(?:Graded|Returned|Assigned|Missing)\b/i.test(row.status||'')).slice(0,batchSize);
    const alreadyGraded=rows.filter(row=>!!row.existingGrade||/\b(?:Graded|Returned)\b/i.test(row.status||'')).length;
    const packets=[];
    for(let i=0;i<eligible.length;i++){
      emit('status',{message:`Reading student work ${i+1} of ${eligible.length}.`});
      try{packets.push(await extractOneStudent({context,page,row:eligible[i],courseId,assignmentId}));}
      catch(error){packets.push({...eligible[i],existingGrade:'',extractionComplete:false,extractionReason:clean(error.message,1000),studentWork:'',attachments:[]});}
    }
    log(`Classroom grading extraction read ${packets.length} ungraded submission(s) for assignment ${assignmentId}; ${alreadyGraded} existing/returned grade(s) were not touched.`);
    emit('grading-submissions',{
      assignment:{courseId,assignmentId,title:title||assignmentText.title||`Assignment ${assignmentId}`,detailUrl,studentWorkUrl:studentPageUrl,question:clean(input.questionOverride,20000)||clean(assignmentText.text,20000),questionComplete:!!clean(input.questionOverride,20000)||(!assignmentText.truncated&&!!clean(assignmentText.text,20000)),questionReason:assignmentText.truncated?'The Classroom directions exceeded CATI\'s safe evidence limit. Add a complete directions override before grading.':'',maxPoints,maxPointsReason:points?.ok?'':clean(points?.reason||'CATI could not verify one Classroom assignment point total.',500)},
      totalStudentRows:rows.length,alreadyGraded,packets
    });
  }finally{await context.close().catch(()=>{})}
})().catch(error=>{emitError(error);process.exit(1)});
