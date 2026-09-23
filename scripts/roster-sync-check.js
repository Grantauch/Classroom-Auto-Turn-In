const assert=require('assert');
const fs=require('fs'),path=require('path');
const {normalizeRosterSnapshot,diffRosterSnapshots,normalizeMappings,mappingConflicts,classRosterIsAuthoritative,buildOperationsRosterCandidate,planOperationsRosterSync,collectClassroomPeopleDom}=require('../engine/classroom-roster');
const {collectAssignmentDueEvidenceDom}=require('../engine/classroom-discovery');
const {resolveAppsScriptBridgeFrame}=require('../engine/apps-script-frame');

const before=normalizeRosterSnapshot({discoveredAt:'2026-09-21T00:00:00Z',classes:[{courseId:'COURSE1',courseDisplayName:'History',studentsHeadingFound:true,students:[{name:'Ada Student',email:'ada@school.org',studentId:'S1'}],discoveredStudentRows:1}]});
const after=normalizeRosterSnapshot({discoveredAt:'2026-09-22T00:00:00Z',classes:[{courseId:'COURSE1',courseDisplayName:'History',studentsHeadingFound:true,students:[{name:'Ada Student',email:'ADA@school.org',studentId:'S1'},{name:'Ben Student',email:'ben@school.org',studentId:'S2'},{name:'No Email',studentId:'S3'}],discoveredStudentRows:3}]});
assert.equal(after.classes[0].students.length,2);
assert.equal(after.classes[0].unresolved.length,1);
assert.equal(after.classes[0].students[0].email,'ada@school.org');
assert.equal(after.classes[0].studentsHeadingFound,true);
assert.equal(classRosterIsAuthoritative(after.classes[0]),false,'Roster with unresolved identities must not authorize removals.');
const diff=diffRosterSnapshots(before,after);
assert.equal(diff.counts.added,1);assert.equal(diff.counts.removed,0);assert.ok(diff.counts.unresolved>=1);
const mappings=normalizeMappings({classMappings:{COURSE1:{classPeriod:'Period 3 Beyond the Scoreboard'},BAD:{classPeriod:'Lunch'}}});
assert.deepEqual(Object.keys(mappings.classMappings),['COURSE1']);
const preview=buildOperationsRosterCandidate(after,mappings);
assert.equal(preview.counts.ready,2);assert.ok(preview.blocked.some(x=>x.reason==='STUDENT_EMAIL_REQUIRED'));assert.equal(preview.classSummaries[0].removalSafe,false);
const noMap=buildOperationsRosterCandidate(after,{classMappings:{}});assert.equal(noMap.counts.ready,0);assert.ok(noMap.blocked.some(x=>x.reason==='CLASS_MAPPING_REQUIRED'));
const conflictMappings=normalizeMappings({classMappings:{COURSE1:{classPeriod:'Period 3'},COURSE2:{classPeriod:'Period 3'}}});assert.equal(mappingConflicts(conflictMappings).length,1);
const conflictSnapshot=normalizeRosterSnapshot({classes:[{courseId:'COURSE1',courseDisplayName:'History A',studentsHeadingFound:true,students:[{name:'Ada Student',email:'ada@school.org'}],discoveredStudentRows:1},{courseId:'COURSE2',courseDisplayName:'History B',studentsHeadingFound:true,students:[{name:'Ben Student',email:'ben@school.org'}],discoveredStudentRows:1}]});
const conflictPreview=buildOperationsRosterCandidate(conflictSnapshot,conflictMappings);assert.equal(conflictPreview.counts.ready,0);assert.equal(conflictPreview.mappingConflicts.length,1);assert.ok(conflictPreview.blocked.every(x=>x.reason==='DUPLICATE_PERIOD_MAPPING'));
const complete=normalizeRosterSnapshot({classes:[{courseId:'COURSE1',courseDisplayName:'History',studentsHeadingFound:true,scrollComplete:true,students:[{name:'Ada Student',email:'ada@school.org'},{name:'Ben Student',email:'ben@school.org'}],discoveredStudentRows:2}]});
const completePreview=buildOperationsRosterCandidate(complete,mappings);assert.equal(completePreview.classSummaries[0].removalSafe,true);
let plan=planOperationsRosterSync(completePreview,[{studentEmail:'ada@school.org',studentName:'Ada Old Name',classPeriod:'Period 3 Beyond the Scoreboard',active:true},{studentEmail:'gone@school.org',studentName:'Gone Student',classPeriod:'Period 3 Beyond the Scoreboard',active:true}]);
assert.equal(plan.counts.add,1);assert.equal(plan.counts.updateName,1);assert.equal(plan.counts.deactivate,1);assert.equal(plan.counts.held,0);
plan=planOperationsRosterSync(preview,[{studentEmail:'gone@school.org',studentName:'Gone Student',classPeriod:'Period 3 Beyond the Scoreboard',active:true}]);assert.equal(plan.counts.deactivate,0);assert.equal(plan.counts.held,1,'Incomplete Classroom evidence must hold a future removal.');
const genericMappings=normalizeMappings({classMappings:{COURSE1:{classPeriod:'Period 3'}}});
const genericPreview=buildOperationsRosterCandidate(complete,genericMappings);
const genericPlan=planOperationsRosterSync(genericPreview,[
  {studentEmail:'ada@school.org',studentName:'Ada Student',classPeriod:'Period 3 Beyond the Scoreboard',active:true},
  {studentEmail:'ben@school.org',studentName:'Ben Student',classPeriod:'Period 3 Beyond the Scoreboard',active:true}
]);
assert.equal(genericPlan.counts.add,0,'A generic period label must never propose a duplicate membership beside an existing descriptive period label.');
assert.equal(genericPlan.counts.deactivate,0,'A generic/descriptive period collision must not create an automatic removal candidate.');
assert.ok(genericPlan.held.some(row=>row.reason==='CLASS_PERIOD_LABEL_MISMATCH'),'Generic/descriptive period collisions must stop for explicit class-label resolution.');
const discoverySource=fs.readFileSync(path.join(__dirname,'../engine/discover-classroom-rosters.js'),'utf8');
assert.ok(discoverySource.includes('if(atEnd){await capture();scrollComplete=true;break;}'),'Roster discovery must collect the final viewport before declaring traversal complete.');
const dueCollectorSource=String(collectAssignmentDueEvidenceDom);
assert.ok(!dueCollectorSource.includes("div,span,p"),'Assignment due-date fallback must not scan ordinary assignment body text.');
assert.equal(typeof collectClassroomPeopleDom,'function');const domSource=String(collectClassroomPeopleDom);assert.ok(/mailto:/.test(domSource));assert.ok(/Students\|Classmates/.test(domSource));assert.ok(!/firstName|lastName|guess/i.test(domSource),'Roster discovery must not guess student email addresses.');

const {validateBridge,teacherUrl,validateOperationsPayload,validateWriteRequest,validateWriteResult,decodeBridgeArg,estimatePendingRecoveryBytes,ROSTER_RECOVERY_TARGET_BYTES}=require('../engine/operations-roster-bridge');
const REVISION_A='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const REVISION_B='BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const bridge=validateBridge({url:'https://script.google.com/a/macros/example.org/s/DEPLOYMENT/exec',contract:'2026-09-22-roster-sync-v1',writeContract:'2026-09-22-roster-write-v1',studentEmailDomain:'school.org'});
assert.equal(bridge.contract,'2026-09-22-roster-sync-v1');assert.equal(bridge.writeContract,'2026-09-22-roster-write-v1');assert.equal(bridge.studentEmailDomain,'school.org');assert.equal(new URL(teacherUrl(bridge.url)).searchParams.get('mode'),'teacher');
assert.throws(()=>validateBridge({url:'http://script.google.com/macros/s/x/exec',contract:bridge.contract}),/not valid/i);assert.throws(()=>validateBridge({url:'https://example.com/macros/s/x/exec',contract:bridge.contract}),/not valid/i);
const bridgePayload=validateOperationsPayload({ok:true,bridgeContract:bridge.contract,writeContract:bridge.writeContract,revision:REVISION_A,serverNow:'2026-09-22T19:00:00Z',roster:[{studentEmail:'ada@school.org',studentName:'Ada Student',classPeriod:'Period 3',active:true}]},bridge.contract);
assert.equal(bridgePayload.roster.length,1);assert.equal(bridgePayload.revision,REVISION_A);assert.equal(bridgePayload.writeContract,bridge.writeContract);
assert.throws(()=>validateOperationsPayload({ok:true,bridgeContract:'wrong',writeContract:bridge.writeContract,revision:REVISION_A,roster:[]},bridge.contract),/unexpected response/i);
assert.throws(()=>validateOperationsPayload({ok:true,bridgeContract:bridge.contract,writeContract:bridge.writeContract,revision:REVISION_A,roster:[{studentEmail:'not-an-email',studentName:'Broken',classPeriod:'Period 3'}]},bridge.contract),/invalid membership row/i);
assert.throws(()=>validateOperationsPayload({ok:true,bridgeContract:bridge.contract,writeContract:bridge.writeContract,revision:REVISION_A,roster:[{studentEmail:'ada@school.org',studentName:'Ada Student',classPeriod:'Period 3'},{studentEmail:'ADA@school.org',studentName:'Ada Student',classPeriod:'Period 3'}]},bridge.contract),/duplicate active membership/i,'A corrupt duplicate active membership must not be collapsed into a seemingly safe plan.');
assert.throws(()=>validateOperationsPayload({ok:true,bridgeContract:bridge.contract,roster:[]},bridge.contract),/safe write revision/i);
const writeRequest=validateWriteRequest({confirmation:'APPLY SAFE ROSTER CHANGES',requestId:'gcr-test-request-123',baseRevision:REVISION_A,add:[{studentEmail:'ben@school.org',studentName:'Ben Student',classPeriod:'Period 3'}],updateName:[{studentEmail:'ada@school.org',studentName:'Ada Student',beforeName:'Ada Old Name',classPeriod:'Period 3'}]},{studentEmailDomain:bridge.studentEmailDomain});
assert.equal(writeRequest.add.length,1);assert.equal(writeRequest.updateName.length,1);assert.equal(writeRequest.deactivate,undefined);
assert.throws(()=>validateWriteRequest({...writeRequest,deactivate:[{studentEmail:'gone@school.org'}]}),/does not apply roster removals/i);
assert.throws(()=>validateWriteRequest({...writeRequest,add:[{studentEmail:'long@school.org',studentName:'X'.repeat(121),classPeriod:'Period 3'}],updateName:[]},{studentEmailDomain:'school.org'}),/student name.*too long/i,'Write requests must reject overlong identity data instead of truncating it.');
assert.throws(()=>validateWriteRequest({...writeRequest,add:[{studentEmail:'ben@other.org',studentName:'Ben Student',classPeriod:'Period 3'}],updateName:[]},{studentEmailDomain:'school.org'}),/outside @school\.org/i,'Write requests must reject student addresses outside the configured school student domain before a pending batch is persisted.');
assert.throws(()=>validateWriteRequest({...writeRequest,add:[{studentEmail:'ben@school.org',studentName:'=Ben Student',classPeriod:'Period 3'}],updateName:[]},{studentEmailDomain:'school.org'}),/cannot be written safely/i,'Write requests must mirror the server formula-injection guard before persistence.');
assert.throws(()=>validateWriteRequest({...writeRequest,add:[{studentEmail:'ada@school.org',studentName:'Ada Student',classPeriod:'Period 3'},{studentEmail:'ada@school.org',studentName:'Ada Different',classPeriod:'Period 4'}],updateName:[]},{studentEmailDomain:'school.org'}),/conflicting names/i,'Write requests must reject conflicting desired names for one student before persistence.');
assert.throws(()=>validateWriteRequest({...writeRequest,add:[{studentEmail:'ben@school.org',studentName:'Ben Student',classPeriod:'Period 3'},{studentEmail:'BEN@school.org',studentName:'Ben Student',classPeriod:'Period 3'}],updateName:[]},{studentEmailDomain:'school.org'}),/duplicate additions/i,'Write requests must mirror the server duplicate-membership guard before persistence.');
const oversizedAdd=Array.from({length:200},(_,index)=>({studentEmail:`bulk.student.${String(index).padStart(3,'0')}@school.org`,studentName:`Bulk Student ${String(index).padStart(3,'0')}`,classPeriod:`Period ${(index%6)+1}`}));
assert.ok(estimatePendingRecoveryBytes(oversizedAdd,[])>ROSTER_RECOVERY_TARGET_BYTES,'The synthetic 200-row batch must exceed the conservative recovery envelope.');
assert.throws(()=>validateWriteRequest({confirmation:'APPLY SAFE ROSTER CHANGES',requestId:'gcr-oversized-client-001',baseRevision:REVISION_A,add:oversizedAdd,updateName:[]},{studentEmailDomain:'school.org'}),/too large to preserve safely/i,'An unrecoverable oversized batch must be rejected before the teacher confirmation dialog.');

const writeResult=validateWriteResult({ok:true,requestId:writeRequest.requestId,writeContract:bridge.writeContract,previousRevision:REVISION_A,revision:REVISION_B,appliedAt:'2026-09-22T19:05:00Z',counts:{added:1,reactivated:0,nameRowsUpdated:1,requestedNameUpdates:1,createdPins:1,createdPinCards:1}},{requestId:writeRequest.requestId,baseRevision:REVISION_A,writeContract:bridge.writeContract,addCount:1,updateNameCount:1});
assert.equal(writeResult.counts.added,1);assert.equal(writeResult.counts.nameRowsUpdated,1);
assert.throws(()=>validateWriteResult({ok:true,requestId:writeRequest.requestId,writeContract:bridge.writeContract,previousRevision:REVISION_A,revision:REVISION_B,counts:{added:0,reactivated:0,nameRowsUpdated:1,requestedNameUpdates:1,createdPins:0,createdPinCards:0}},{requestId:writeRequest.requestId,baseRevision:REVISION_A,writeContract:bridge.writeContract,addCount:1,updateNameCount:1}),/every approved addition/i,'A partial or mismatched server result must not clear the pending request.');

console.log('GoClassroom roster contract checks passed: verified identities, unique mappings, revision-bound safe writes, and no automatic removals.');

function makeHarness({failFirstApply=false,applyErrorMessage='simulated browser disconnect after uncertain write',afterRows=null,terminalReject=false}={}){
  const {createRosterService,DEFAULT_OPERATIONS_BRIDGE}=require('../main-services/roster-service');
  const {encode}=require('../engine/protocol');
  const plain=new Map(),secure=new Map(),calls=[],logs=[];let applyAttempts=0,readCount=0,requestIds=[];
  const localData={readJson:(name,fallback)=>plain.has(name)?JSON.parse(JSON.stringify(plain.get(name))):fallback,writeJson:(name,value)=>{plain.set(name,JSON.parse(JSON.stringify(value)));return value},appLog:message=>logs.push(String(message))};
  const secureData={read:(name,fallback)=>secure.has(name)?JSON.parse(JSON.stringify(secure.get(name))):fallback,write:(name,value)=>{secure.set(name,JSON.parse(JSON.stringify(value)));return value}};
  secure.set('roster-sync.secure.json',{schemaVersion:1,lastDiscoveryAt:new Date().toISOString(),snapshot:{...complete,discoveredAt:new Date().toISOString()},lastDiff:{counts:{}},issues:[]});plain.set('roster-mappings.json',mappings);plain.set('roster-bridge.json',{...DEFAULT_OPERATIONS_BRIDGE,studentEmailDomain:'school.org'});
  const currentBefore=[{studentEmail:'ada@school.org',studentName:'Ada Old Name',classPeriod:'Period 3 Beyond the Scoreboard',active:true},{studentEmail:'gone@school.org',studentName:'Gone Student',classPeriod:'Period 3 Beyond the Scoreboard',active:true}];
  const currentAfter=afterRows||[{studentEmail:'ada@school.org',studentName:'Ada Student',classPeriod:'Period 3 Beyond the Scoreboard',active:true},{studentEmail:'ben@school.org',studentName:'Ben Student',classPeriod:'Period 3 Beyond the Scoreboard',active:true},{studentEmail:'gone@school.org',studentName:'Gone Student',classPeriod:'Period 3 Beyond the Scoreboard',active:true}];
  const service=createRosterService({localData,secureData,ensureAutomationIdle:()=>{},compactError:e=>String(e),runExclusiveBrowser:async(_label,fn)=>fn(),runNodeScript:async(file,args)=>{
    calls.push(file);
    if(file==='read-operations-roster.js'){
      readCount++;const rows=readCount===1?currentBefore:currentAfter,revision=readCount===1?REVISION_A:REVISION_B;
      return encode('operations-roster',{schemaVersion:1,bridgeContract:DEFAULT_OPERATIONS_BRIDGE.contract,writeContract:DEFAULT_OPERATIONS_BRIDGE.writeContract,revision,serverNow:'2026-09-22T19:00:00Z',roster:rows});
    }
    if(file==='apply-operations-roster.js'){
      applyAttempts++;const packed=decodeBridgeArg(args[0]),req=validateWriteRequest(packed.request,{studentEmailDomain:packed.bridge.studentEmailDomain});requestIds.push(req.requestId);
      assert.equal(packed.bridge.writeContract,DEFAULT_OPERATIONS_BRIDGE.writeContract);assert.equal(req.baseRevision,REVISION_A);assert.equal(req.add.length,1);assert.equal(req.updateName.length,1);assert.equal(req.deactivate,undefined);
      if(terminalReject){const error=new Error('The roster changed before anything was applied. Compare rosters again.');error.code='ROSTER_REJECTED_NO_EFFECTS';throw error;}
      if(failFirstApply&&applyAttempts===1)throw new Error(applyErrorMessage);
      return encode('operations-roster-applied',{ok:true,schemaVersion:1,requestId:req.requestId,appliedAt:'2026-09-22T19:05:00Z',writeContract:DEFAULT_OPERATIONS_BRIDGE.writeContract,previousRevision:REVISION_A,revision:REVISION_B,counts:{added:1,reactivated:0,nameRowsUpdated:1,requestedNameUpdates:1,createdPins:1,createdPinCards:1}});
    }
    throw new Error(`Unexpected child ${file}`);
  }});
  return {service,plain,secure,calls,logs,get applyAttempts(){return applyAttempts},get requestIds(){return requestIds}};
}

(async()=>{
  const mainFrame={url:()=> 'https://script.google.com/a/macros/example.org/s/DEPLOYMENT/exec',evaluate:async()=>false};
  const appFrame={url:()=> 'https://abc-script.googleusercontent.com/userCodeAppPanel',evaluate:async()=>true};
  const fakePage={mainFrame:()=>mainFrame,frames:()=>[mainFrame,appFrame],waitForTimeout:async()=>{}};
  assert.equal(await resolveAppsScriptBridgeFrame(fakePage,{timeoutMs:1000,pollMs:1}),appFrame,'Roster bridge must resolve the trusted HtmlService application frame.');

  const staleSource=makeHarness();
  const staleSnapshot=staleSource.secure.get('roster-sync.secure.json');
  staleSource.secure.set('roster-sync.secure.json',{...staleSnapshot,lastDiscoveryAt:new Date(Date.now()-11*60*1000).toISOString(),snapshot:{...staleSnapshot.snapshot,discoveredAt:new Date(Date.now()-11*60*1000).toISOString()}});
  await assert.rejects(()=>staleSource.service.readOperationsRoster(),/too old to approve a roster write/i);
  assert.equal(staleSource.calls.length,0,'A stale Classroom roster must be rejected before opening the Hall Pass bridge.');
  console.log('GoClassroom roster freshness check passed: stale Classroom source evidence cannot reach comparison or approval.');

  const h=makeHarness();const state=await h.service.readOperationsRoster();
  assert.equal(state.operations.count,2);assert.equal(state.operations.writeReady,true);assert.equal(state.syncPlan.counts.add,1);assert.equal(state.syncPlan.counts.updateName,1);assert.equal(state.syncPlan.counts.deactivate,1);assert.equal(h.plain.has('operations-roster.secure.json'),false,'Student operations roster must never be written through plaintext localData.');
  const outcome=await h.service.applySafeChanges();
  assert.equal(outcome.result.counts.added,1);assert.equal(outcome.result.counts.nameRowsUpdated,1);assert.equal(outcome.state.syncPlan.counts.add,0);assert.equal(outcome.state.syncPlan.counts.updateName,0);assert.equal(outcome.state.syncPlan.counts.deactivate,1,'Removal candidate must remain review-only after safe writes.');assert.equal(outcome.state.pendingWrite.status,'NONE');assert.deepEqual(h.calls,['read-operations-roster.js','apply-operations-roster.js','read-operations-roster.js']);
  console.log('GoClassroom approved roster write checks passed: only additions/name corrections are sent, response is revision-verified, and live roster is re-read.');

  const recovery=makeHarness({failFirstApply:true});await recovery.service.readOperationsRoster();
  let failed=false;try{await recovery.service.applySafeChanges()}catch{failed=true}assert.equal(failed,true);const pending=recovery.service.publicState().pendingWrite;assert.equal(pending.status,'PENDING');assert.equal(pending.count,2);
  const recovered=await recovery.service.applySafeChanges();assert.equal(recovered.state.pendingWrite.status,'NONE');assert.equal(recovery.requestIds.length,2);assert.equal(recovery.requestIds[0],recovery.requestIds[1],'Uncertain failures must retry the exact same idempotent request ID.');
  console.log('GoClassroom roster recovery checks passed: uncertain writes stay encrypted and retry the same server request ID.');

  const ipcErrorSource=fs.readFileSync(path.join(__dirname,'../main-services/ipc-error-reporter.js'),'utf8');assert.ok(ipcErrorSource.includes('Sensitive roster error detail redacted at IPC boundary.'),'The final IPC logger must redact roster error details before writing plaintext diagnostics.');
  const privacy=makeHarness({failFirstApply:true,applyErrorMessage:'server rejected ada@school.org during validation'});await privacy.service.readOperationsRoster();
  await assert.rejects(()=>privacy.service.applySafeChanges(),/ada@school\.org/);assert.ok(!privacy.logs.join('\n').includes('ada@school.org'),'Plaintext roster diagnostics must not retain student email addresses from failure messages.');
  console.log('GoClassroom roster diagnostic privacy check passed: teacher-facing errors may be specific, but plaintext logs do not retain student email identities.');

  const missingReadback=makeHarness({afterRows:[{studentEmail:'ada@school.org',studentName:'Ada Student',classPeriod:'Period 3 Beyond the Scoreboard',active:true},{studentEmail:'gone@school.org',studentName:'Gone Student',classPeriod:'Period 3 Beyond the Scoreboard',active:true}]});await missingReadback.service.readOperationsRoster();
  const unverified=await missingReadback.service.applySafeChanges();assert.equal(unverified.verified,false);assert.equal(unverified.state.pendingWrite.status,'PENDING','A server receipt must not clear recovery when the intended live membership is absent.');
  console.log('GoClassroom live readback check passed: a missing intended row remains unverified and recovery-protected.');

  const terminal=makeHarness({terminalReject:true});await terminal.service.readOperationsRoster();
  await assert.rejects(()=>terminal.service.applySafeChanges(),/roster changed/i);
  const terminalState=terminal.service.publicState();assert.equal(terminalState.pendingWrite.status,'NONE','A structured no-effects rejection may resolve the local pending request.');assert.equal(terminalState.operations.lastReadAt,'','A terminal stale rejection must invalidate the stale comparison so a fresh compare can run.');
  console.log('GoClassroom terminal rejection check passed: stale no-effects requests do not trap the teacher in an endless retry loop.');

  const {createRosterApplyHandler}=require('../main-services/roster-confirmation');
  let dialogCalls=0,applyCalls=0;
  const invalidHandler=createRosterApplyHandler({dialog:{showMessageBox:async()=>{dialogCalls++;return {response:1}}},getRosterIntegration:()=>({validateSafeChanges:()=>{throw new Error('invalid before confirmation')},state:()=>({}),applySafeChanges:async()=>{applyCalls++}})});
  await assert.rejects(()=>invalidHandler(),/invalid before confirmation/);assert.equal(dialogCalls,0,'Known-invalid roster batches must be rejected before the teacher confirmation dialog.');assert.equal(applyCalls,0);
  const validHandler=createRosterApplyHandler({dialog:{showMessageBox:async()=>{dialogCalls++;return {response:0}}},getRosterIntegration:()=>({validateSafeChanges:()=>({add:[{}],updateName:[{}]}),state:()=>({pendingWrite:{status:'NONE'}}),applySafeChanges:async()=>{applyCalls++}})});
  const cancelled=await validHandler();assert.equal(cancelled.cancelled,true);assert.equal(applyCalls,0,'Cancel-default confirmation must not apply roster changes.');
  const reviewedPayload={confirmation:'APPLY SAFE ROSTER CHANGES',requestId:'gcr-reviewed-immutable',baseRevision:REVISION_A,add:[{studentEmail:'ben@school.org',studentName:'Ben Student',classPeriod:'Period 3 Beyond the Scoreboard'}],updateName:[]};let submittedPayload=null;
  const boundHandler=createRosterApplyHandler({dialog:{showMessageBox:async()=>({response:1})},getRosterIntegration:()=>({validateSafeChanges:()=>reviewedPayload,state:()=>({pendingWrite:{status:'NONE'}}),applySafeChanges:async payload=>{submittedPayload=payload;return {verified:true,state:{}}}})});
  await boundHandler();assert.deepEqual(submittedPayload,reviewedPayload,'Confirmation must submit the exact immutable request the teacher reviewed.');

  const approvalRace=makeHarness();await approvalRace.service.readOperationsRoster();const reviewed=approvalRace.service.validateSafeChanges();
  approvalRace.plain.set('roster-mappings.json',normalizeMappings({classMappings:{COURSE1:{classPeriod:'Period 4'}}}));
  await assert.rejects(()=>approvalRace.service.applySafeChanges(reviewed),/changed while the confirmation window was open/i);
  assert.equal(approvalRace.applyAttempts,0,'A changed mapping must be rejected before any roster write bridge call.');
  assert.equal(approvalRace.service.publicState().pendingWrite.status,'NONE','A rejected approval race must not create a pending write.');
  console.log('GoClassroom roster confirmation check passed: deterministic validation runs before the Cancel-default native confirmation.');
})().catch(error=>{console.error(error);process.exitCode=1});

{
  const {createRosterService}=require('../main-services/roster-service');
  const writes=[];let mappingSaved=false;
  const localData={readJson:(_name,fallback)=>fallback,writeJson:(name,value)=>{if(name==='roster-mappings.json')mappingSaved=true;return value},appLog:()=>{}};
  const secureData={read:(_name,fallback)=>fallback,write:(name,value)=>{writes.push(name);if(name==='operations-roster.secure.json')throw new Error('secure comparison invalidation failed');return value}};
  const service=createRosterService({localData,secureData,ensureAutomationIdle:()=>{},compactError:error=>String(error.message||error)});
  assert.throws(()=>service.saveMappings({classMappings:{COURSE1:{classPeriod:'Period 3'}}}),/secure comparison invalidation failed/);
  assert.equal(mappingSaved,false,'A mapping change must not be committed if the stale operations comparison could not be cleared first.');
  assert.equal(writes[0],'operations-roster.secure.json');
  console.log('GoClassroom roster invalidation ordering check passed: stale operations comparisons are cleared before mapping state can change.');
}

{
  const {createRosterService}=require('../main-services/roster-service');
  const logs=[];
  const localData={readJson:(_name,fallback)=>fallback,writeJson:(_name,value)=>value,appLog:message=>logs.push(String(message))};
  const recoverableSecure={
    read:(name,fallback)=>{if(name==='roster-write-pending.secure.json')return fallback;throw new Error(`corrupt ${name}`)},
    write:(_name,value)=>value
  };
  const service=createRosterService({localData,secureData:recoverableSecure,ensureAutomationIdle:()=>{},compactError:error=>String(error.message||error)});
  const state=service.publicState();
  assert.equal(state.snapshot.classes.length,0,'Unreadable read-only roster cache should fall back to an empty refreshable snapshot.');
  assert.equal(state.operations.count,0,'Unreadable operations comparison should fall back to an empty refreshable snapshot.');
  assert.equal(state.pendingWrite.status,'NONE');
  assert.ok(logs.some(line=>/treated as stale/i.test(line)),'Recoverable encrypted-cache damage should be logged for support.');
  const criticalSecure={read:(name,fallback)=>{if(name==='roster-write-pending.secure.json')throw new Error('corrupt pending write');return fallback},write:(_name,value)=>value};
  const critical=createRosterService({localData,secureData:criticalSecure,ensureAutomationIdle:()=>{},compactError:error=>String(error.message||error)});
  assert.throws(()=>critical.publicState(),/corrupt pending write/i,'An unreadable approved pending write must remain fail-closed.');
  console.log('GoClassroom encrypted-cache recovery checks passed: disposable roster snapshots can be refreshed, while pending approved writes remain fail-closed.');
}
