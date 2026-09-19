const crypto=require('crypto');
const {DEFAULT_OLLAMA_URL,DEFAULT_GRADING_MODEL,GRADING_SCHEMA_VERSION,cleanModel,boundedRequiredText,getOllamaStatus,createOllamaGrade}=require('../engine/grading');
const {clean,clampBatch,encodePayload,assignmentUrls,extractMaxPoints}=require('../engine/classroom-grading');
const {parseClassroomIds}=require('../engine/safety');
const {lastPayload}=require('../engine/protocol');

const WRITE_AUTHORIZATION_TTL_MS=5*60*1000;
const CLASSROOM_BATCH_DEADLINE_MS=12*60*1000;

function createGradingService({localData,ensureAutomationIdle,compactError,runNodeScript=null,runExclusiveBrowser=null}){
  const {readJson,writeJson,loadConfig,appLog}=localData;
  const exclusive=runExclusiveBrowser||((_label,fn)=>fn());
  const writeAuthorizations=new Map();
  let classroomBatchActive=false;

  function optionalBoundedText(value,label,max){
    const text=String(value??'').replace(/\u0000/g,'').trim();
    if(text.length>max)throw new Error(`The ${label} is too long to use without truncating evidence. Shorten it, then try again.`);
    return text;
  }

  function validateAssignmentScope(assignment={}){
    const courseId=clean(assignment.courseId,300),assignmentId=clean(assignment.assignmentId,300),title=clean(assignment.title,1000);
    if(!courseId||!assignmentId)throw new Error('Choose a Classroom assignment before grading student work.');
    const configuredCourseId=parseClassroomIds(loadConfig().courseUrl).courseId;
    if(!configuredCourseId||courseId!==configuredCourseId)throw new Error('The selected grading assignment does not belong to the Classroom configured in Setup.');
    return {courseId,assignmentId,title};
  }

  function pruneWriteAuthorizations(){const now=Date.now();for(const [token,item] of writeAuthorizations)if(!item||item.expiresAt<=now)writeAuthorizations.delete(token)}
  function authorizeWriteBatch(assignment={}){
    ensureAutomationIdle();
    const settings=loadSettings();
    if(!settings.enabled||!settings.classroomDraftWriteEnabled)throw new Error('Classroom draft writing is not enabled.');
    const scope=validateAssignmentScope(assignment);pruneWriteAuthorizations();
    const token=crypto.randomUUID();
    writeAuthorizations.set(token,{...scope,expiresAt:Date.now()+WRITE_AUTHORIZATION_TTL_MS});
    return token;
  }
  function consumeWriteAuthorization(token,scope){
    pruneWriteAuthorizations();const key=String(token||''),authorization=writeAuthorizations.get(key);writeAuthorizations.delete(key);
    if(!authorization||authorization.courseId!==scope.courseId||authorization.assignmentId!==scope.assignmentId)throw new Error('This write-enabled batch does not have a current one-time teacher confirmation. Preview mode remains available.');
  }

  function teacherSafeFailure(reason){
    const s=String(reason||'').toLowerCase();
    if(/could not reach ollama|ollama returned http|timed out|local ollama grading failed/.test(s))return 'CATI could not use Ollama on this computer. Make sure Ollama is running and the selected local model is installed. Nothing was returned to students.';
    if(/grading data that could not be read safely|grading result failed cati validation|returned no grading response/.test(s))return 'The local model returned a grading result CATI could not validate, so CATI rejected it. Nothing was written to Classroom.';
    if(/too long for this grading lab/.test(s))return String(reason).replace(/^.*?(The )/,'$1');
    if(/add the assignment question or directions|add the rubric|add the student submission/.test(s))return String(reason);
    if(/classroom|student work|assignment/.test(s))return `${String(reason||'Classroom grading stopped safely.')} No student work was returned and no uncertain grade was written.`;
    return 'The local grading engine stopped safely. Nothing was returned to students. Try once more, then check Ollama if the problem continues.';
  }

  function defaultSettings(){return {enabled:false,model:DEFAULT_GRADING_MODEL,classroomDraftWriteEnabled:false,batchSize:5}}

  function loadSettings(){
    const raw=readJson('grading-settings.json',{}),saved={...defaultSettings(),...(raw&&typeof raw==='object'?raw:{})};
    return {
      enabled:!!saved.enabled,
      model:cleanModel(saved.model),
      classroomDraftWriteEnabled:!!saved.classroomDraftWriteEnabled,
      batchSize:clampBatch(saved.batchSize),
      baseUrl:DEFAULT_OLLAMA_URL,
      gradingSchema:GRADING_SCHEMA_VERSION
    };
  }

  function saveSettings(input={}){
    ensureAutomationIdle();
    const current=loadSettings(),next={...current,...input};
    const saved={enabled:!!next.enabled,model:cleanModel(next.model),classroomDraftWriteEnabled:!!next.classroomDraftWriteEnabled,batchSize:clampBatch(next.batchSize)};
    writeJson('grading-settings.json',saved);
    return {...saved,baseUrl:DEFAULT_OLLAMA_URL,gradingSchema:GRADING_SCHEMA_VERSION};
  }

  async function state(){
    const settings=loadSettings();
    try{
      const ollama=await getOllamaStatus({baseUrl:settings.baseUrl,timeoutMs:5000});
      return {settings,ollama:{...ollama,error:null,selectedModelAvailable:ollama.models.some(m=>m.name===settings.model||m.model===settings.model)}};
    }catch(error){
      return {settings,ollama:{available:false,baseUrl:settings.baseUrl,models:[],selectedModelAvailable:false,error:compactError(error)}};
    }
  }

  async function grade(input={}){
    ensureAutomationIdle();
    const settings=loadSettings(),model=cleanModel(input.model||settings.model);
    if(!settings.enabled)throw new Error('Local grading is off. Turn it on before creating a draft grade.');
    const started=Date.now();
    try{
      const result=await createOllamaGrade({
        model,
        baseUrl:settings.baseUrl,
        question:input.question,
        rubric:input.rubric,
        studentWork:input.studentWork,
        timeoutMs:120000
      });
      appLog(`Local grading completed with ${model}: ${result.status} (${Date.now()-started} ms). Nothing was returned to students.`);
      return result;
    }catch(error){
      const reason=compactError(error);
      appLog(`Local grading failed safely with ${model}: ${reason}. Nothing was returned to students.`);
      return {status:'TEACHER_REVIEW',reason:teacherSafeFailure(reason),grade:null,validation:null,model,schemaVersion:GRADING_SCHEMA_VERSION};
    }
  }

  function requireBrowserRunner(){if(typeof runNodeScript!=='function')throw new Error('The Classroom grading browser bridge is not available in this build.');}

  async function discoverAssignments(){
    ensureAutomationIdle();requireBrowserRunner();
    const out=await exclusive('Classroom grading assignment discovery',()=>runNodeScript('grading-classroom-discover.js',[],false,{timeoutMs:4*60*1000}));
    const payload=lastPayload(out,'grading-assignments');
    if(!payload||!Array.isArray(payload.assignments))throw new Error('CATI could not read the Classroom assignment list safely.');
    const configuredCourseId=parseClassroomIds(loadConfig().courseUrl).courseId;
    if(!configuredCourseId||payload.courseId!==configuredCourseId||payload.assignments.some(item=>item?.courseId!==configuredCourseId))throw new Error('CATI rejected an assignment list that did not match the Classroom configured in Setup.');
    return payload;
  }

  function reviewResult(packet,reason){
    return {studentId:packet.studentId,studentName:packet.studentName,status:'TEACHER_REVIEW',reason,grade:null,validation:null,writeStatus:'NOT_WRITTEN',writeMessage:'No Classroom grade was changed.'};
  }

  async function processClassroomAssignmentUnlocked(input={}){
    ensureAutomationIdle();requireBrowserRunner();
    const settings=loadSettings(),model=cleanModel(input.model||settings.model),writeDrafts=!!input.writeDrafts,batchSize=clampBatch(input.batchSize||settings.batchSize);
    if(!settings.enabled)throw new Error('Local grading is off. Turn it on before grading Classroom submissions.');
    if(writeDrafts&&!settings.classroomDraftWriteEnabled)throw new Error('Classroom draft writing is off. Turn on the separate draft-write safety setting before saving scores to Classroom.');
    const assignment=input.assignment&&typeof input.assignment==='object'?input.assignment:{};
    const {courseId,assignmentId,title}=validateAssignmentScope(assignment);
    if(writeDrafts)consumeWriteAuthorization(input.writeAuthorization,{courseId,assignmentId});
    const rubric=boundedRequiredText(input.rubric,'rubric',30000),questionOverride=optionalBoundedText(input.questionOverride,'assignment directions override',20000);
    const canonicalUrls=assignmentUrls(courseId,assignmentId);

    const extractArgs=encodePayload({
      courseId,assignmentId,title,detailUrl:canonicalUrls.detailUrl,studentWorkUrl:canonicalUrls.studentWorkUrl,
      batchSize,questionOverride
    });
    const scanOut=await exclusive('Classroom grading submission scan',()=>runNodeScript('grading-classroom-extract.js',[extractArgs],false,{timeoutMs:10*60*1000}));
    const scan=lastPayload(scanOut,'grading-submissions');
    if(!scan||!scan.assignment||!Array.isArray(scan.packets)||scan.assignment.courseId!==courseId||scan.assignment.assignmentId!==assignmentId)throw new Error('CATI could not read a matching Classroom student-work queue safely.');
    const question=questionOverride||optionalBoundedText(scan.assignment.question,'Classroom assignment directions',20000),questionComplete=!!questionOverride||scan.assignment.questionComplete===true;
    const classroomMax=Number(scan.assignment.maxPoints),maxKnown=Number.isFinite(classroomMax)&&classroomMax>0&&classroomMax<=100000,rubricMax=extractMaxPoints(rubric);
    const results=[],writeCandidates=[],seenStudents=new Set(),deadline=Date.now()+CLASSROOM_BATCH_DEADLINE_MS;

    for(const packet of scan.packets){
      const packetId=clean(packet?.studentId,300);
      if(!packetId||seenStudents.has(packetId)){results.push(reviewResult(packet||{},'CATI found a missing or duplicate student identity and stopped that item safely.'));continue}
      seenStudents.add(packetId);
      if(packet.existingGrade){results.push({...reviewResult(packet,'A draft or existing grade is already present. CATI will not overwrite it.'),writeStatus:'SKIPPED_EXISTING'});continue}
      if(!packet.extractionComplete){results.push(reviewResult(packet,packet.extractionReason||'CATI could not read the complete student submission safely.'));continue}
      if(!question||!questionComplete){results.push(reviewResult(packet,scan.assignment.questionReason||'CATI could not read the complete assignment directions safely. Add an assignment-directions override and try again.'));continue}
      if(!maxKnown){results.push(reviewResult(packet,scan.assignment.maxPointsReason||'CATI could not verify one positive Classroom assignment point total.'));continue}
      if(rubricMax===null){results.push(reviewResult(packet,'The rubric needs one explicit total-points value before CATI can independently verify a draft score.'));continue}
      if(Math.abs(rubricMax-classroomMax)>0.001){results.push(reviewResult(packet,`The rubric explicitly totals ${rubricMax} points, but Classroom shows ${classroomMax} points. CATI will not scale or guess.`));continue}
      const remaining=deadline-Date.now();
      if(remaining<15000){results.push(reviewResult(packet,'The bounded Classroom grading window ended before this student could be graded. Run another preview batch to continue.'));continue}
      let graded;
      try{
        graded=await createOllamaGrade({model,baseUrl:settings.baseUrl,question,rubric,studentWork:packet.studentWork,timeoutMs:Math.min(120000,Math.max(15000,remaining-5000))});
      }catch(error){graded={status:'TEACHER_REVIEW',reason:teacherSafeFailure(compactError(error)),grade:null,validation:null,model,schemaVersion:GRADING_SCHEMA_VERSION};}
      let status=graded.status,reason=graded.reason||null;
      if(status==='SAFE_DRAFT'&&Math.abs(Number(graded.grade?.max_score)-classroomMax)>0.001){
        status='TEACHER_REVIEW';reason=`The rubric totals ${graded.grade?.max_score} points, but Classroom shows ${classroomMax} points. CATI will not scale or guess.`;
      }
      const row={studentId:packet.studentId,studentName:packet.studentName,status,reason,grade:graded.grade||null,validation:graded.validation||null,writeStatus:'NOT_WRITTEN',writeMessage:'No Classroom grade was changed.'};
      results.push(row);
      if(status==='SAFE_DRAFT'&&graded.grade?.score!==null&&graded.grade?.score!==undefined){
        writeCandidates.push({studentId:packet.studentId,studentName:packet.studentName,studentUrl:packet.studentUrl,score:graded.grade.score,maxScore:graded.grade.max_score,classification:'SAFE_DRAFT',row});
      }
    }

    if(writeDrafts&&writeCandidates.length){
      if(!maxKnown){
        for(const item of writeCandidates){item.row.writeStatus='BLOCKED';item.row.writeMessage='CATI could not verify the Classroom assignment point total, so it did not write the draft grade.';}
      }else{
        const safeWrites=writeCandidates.filter(item=>Math.abs(Number(item.maxScore)-classroomMax)<=0.001);
        if(safeWrites.length){
          const writeArgs=encodePayload({courseId,assignmentId,writes:safeWrites.map(({studentId,studentName,studentUrl,score,maxScore,classification})=>({studentId,studentName,studentUrl,score,maxScore,classification}))});
          const writeOut=await exclusive('Classroom draft grade write',()=>runNodeScript('grading-classroom-write.js',[writeArgs],false,{timeoutMs:8*60*1000}));
          const writePayload=lastPayload(writeOut,'grading-write-result');
          if(!writePayload||writePayload.courseId!==courseId||writePayload.assignmentId!==assignmentId||!Array.isArray(writePayload.results))throw new Error('CATI rejected an unmatched Classroom draft-write verification result.');
          const byStudent=new Map();for(const item of writePayload.results){if(item?.studentId&&byStudent.has(item.studentId))throw new Error('CATI rejected duplicate student results from the Classroom draft writer.');if(item?.studentId)byStudent.set(item.studentId,item)}
          for(const item of safeWrites){
            const wr=byStudent.get(item.studentId);
            if(!wr){item.row.writeStatus='WRITE_FAILED';item.row.writeMessage='Classroom did not return a verification result for this draft grade.';continue}
            if(!['SAVED_DRAFT','ALREADY_SAVED','WRITE_FAILED'].includes(wr.status)||Number(wr.score)!==Number(item.score)||Number(wr.maxScore)!==Number(item.maxScore)){item.row.writeStatus='WRITE_FAILED';item.row.writeMessage='CATI rejected a mismatched Classroom write-verification result.';continue}
            item.row.writeStatus=wr.status;item.row.writeMessage=clean(wr.message,1000)||'';
          }
        }
      }
    }

    const summary={
      scanned:scan.packets.length,
      safeDrafts:results.filter(x=>x.status==='SAFE_DRAFT').length,
      teacherReview:results.filter(x=>x.status==='TEACHER_REVIEW').length,
      draftsSaved:results.filter(x=>x.writeStatus==='SAVED_DRAFT'||x.writeStatus==='ALREADY_SAVED').length,
      writeFailures:results.filter(x=>x.writeStatus==='WRITE_FAILED'||x.writeStatus==='BLOCKED').length,
      alreadyGraded:Number(scan.alreadyGraded)||0,
      classroomMaxPoints:maxKnown?classroomMax:null
    };
    appLog(`Classroom local grading processed ${summary.scanned} submission(s): ${summary.safeDrafts} safe draft(s), ${summary.teacherReview} teacher-review item(s), ${summary.draftsSaved} Classroom draft score(s) verified.`);
    return {assignment:{...scan.assignment,question},summary,results,writeDraftsRequested:writeDrafts,classroomDraftWriteEnabled:settings.classroomDraftWriteEnabled,model};
  }

  async function processClassroomAssignment(input={}){
    ensureAutomationIdle();
    if(classroomBatchActive)throw new Error('Another Classroom grading batch is already running. Wait for it to finish before starting another batch.');
    classroomBatchActive=true;
    try{return await processClassroomAssignmentUnlocked(input)}
    finally{classroomBatchActive=false}
  }

  return {loadSettings,saveSettings,state,grade,discoverAssignments,authorizeWriteBatch,processClassroomAssignment};
}

module.exports={createGradingService};
