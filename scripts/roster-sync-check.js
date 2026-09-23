const assert=require('assert');
const {normalizeRosterSnapshot,diffRosterSnapshots,normalizeMappings,mappingConflicts,classRosterIsAuthoritative,buildOperationsRosterCandidate,planOperationsRosterSync,collectClassroomPeopleDom}=require('../engine/classroom-roster');

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
const complete=normalizeRosterSnapshot({classes:[{courseId:'COURSE1',courseDisplayName:'History',studentsHeadingFound:true,students:[{name:'Ada Student',email:'ada@school.org'},{name:'Ben Student',email:'ben@school.org'}],discoveredStudentRows:2}]});
const completePreview=buildOperationsRosterCandidate(complete,mappings);assert.equal(completePreview.classSummaries[0].removalSafe,true);
let plan=planOperationsRosterSync(completePreview,[{studentEmail:'ada@school.org',studentName:'Ada Old Name',classPeriod:'Period 3 Beyond the Scoreboard',active:true},{studentEmail:'gone@school.org',studentName:'Gone Student',classPeriod:'Period 3 Beyond the Scoreboard',active:true}]);
assert.equal(plan.counts.add,1);assert.equal(plan.counts.updateName,1);assert.equal(plan.counts.deactivate,1);assert.equal(plan.counts.held,0);
plan=planOperationsRosterSync(preview,[{studentEmail:'gone@school.org',studentName:'Gone Student',classPeriod:'Period 3 Beyond the Scoreboard',active:true}]);assert.equal(plan.counts.deactivate,0);assert.equal(plan.counts.held,1,'Incomplete Classroom evidence must hold a future removal.');
assert.equal(typeof collectClassroomPeopleDom,'function');const domSource=String(collectClassroomPeopleDom);assert.ok(/mailto:/.test(domSource));assert.ok(/Students\|Classmates/.test(domSource));assert.ok(!/firstName|lastName|guess/i.test(domSource),'Roster discovery must not guess student email addresses.');

const {validateBridge,teacherUrl,validateOperationsPayload,validateWriteRequest,validateWriteResult,decodeBridgeArg}=require('../engine/operations-roster-bridge');
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
const writeResult=validateWriteResult({ok:true,requestId:writeRequest.requestId,writeContract:bridge.writeContract,previousRevision:REVISION_A,revision:REVISION_B,appliedAt:'2026-09-22T19:05:00Z',counts:{added:1,reactivated:0,nameRowsUpdated:1,requestedNameUpdates:1,createdPins:1,createdPinCards:1}},{requestId:writeRequest.requestId,baseRevision:REVISION_A,writeContract:bridge.writeContract,addCount:1,updateNameCount:1});
assert.equal(writeResult.counts.added,1);assert.equal(writeResult.counts.nameRowsUpdated,1);
assert.throws(()=>validateWriteResult({ok:true,requestId:writeRequest.requestId,writeContract:bridge.writeContract,previousRevision:REVISION_A,revision:REVISION_B,counts:{added:0,reactivated:0,nameRowsUpdated:1,requestedNameUpdates:1,createdPins:0,createdPinCards:0}},{requestId:writeRequest.requestId,baseRevision:REVISION_A,writeContract:bridge.writeContract,addCount:1,updateNameCount:1}),/every approved addition/i,'A partial or mismatched server result must not clear the pending request.');

console.log('GoClassroom roster contract checks passed: verified identities, unique mappings, revision-bound safe writes, and no automatic removals.');

function makeHarness({failFirstApply=false,failComparisonClearOnce=false}={}){
  const {createRosterService,DEFAULT_OPERATIONS_BRIDGE}=require('../main-services/roster-service');
  const {encode}=require('../engine/protocol');
  const plain=new Map(),secure=new Map(),calls=[];let applyAttempts=0,readCount=0,requestIds=[],comparisonClearFailed=false;
  const localData={readJson:(name,fallback)=>plain.has(name)?JSON.parse(JSON.stringify(plain.get(name))):fallback,writeJson:(name,value)=>{plain.set(name,JSON.parse(JSON.stringify(value)));return value},appLog:()=>{}};
  const secureData={read:(name,fallback)=>secure.has(name)?JSON.parse(JSON.stringify(secure.get(name))):fallback,write:(name,value)=>{if(failComparisonClearOnce&&!comparisonClearFailed&&applyAttempts>0&&name==='operations-roster.secure.json'&&!value.lastReadAt){comparisonClearFailed=true;throw new Error('simulated local comparison clear failure')}secure.set(name,JSON.parse(JSON.stringify(value)));return value}};
  secure.set('roster-sync.secure.json',{schemaVersion:1,lastDiscoveryAt:'2026-09-22T18:00:00Z',snapshot:complete,lastDiff:{counts:{}},issues:[]});plain.set('roster-mappings.json',mappings);plain.set('roster-bridge.json',{...DEFAULT_OPERATIONS_BRIDGE,studentEmailDomain:'school.org'});
  const currentBefore=[{studentEmail:'ada@school.org',studentName:'Ada Old Name',classPeriod:'Period 3 Beyond the Scoreboard',active:true},{studentEmail:'gone@school.org',studentName:'Gone Student',classPeriod:'Period 3 Beyond the Scoreboard',active:true}];
  const currentAfter=[{studentEmail:'ada@school.org',studentName:'Ada Student',classPeriod:'Period 3 Beyond the Scoreboard',active:true},{studentEmail:'ben@school.org',studentName:'Ben Student',classPeriod:'Period 3 Beyond the Scoreboard',active:true},{studentEmail:'gone@school.org',studentName:'Gone Student',classPeriod:'Period 3 Beyond the Scoreboard',active:true}];
  const service=createRosterService({localData,secureData,ensureAutomationIdle:()=>{},compactError:e=>String(e),runExclusiveBrowser:async(_label,fn)=>fn(),runNodeScript:async(file,args)=>{
    calls.push(file);
    if(file==='read-operations-roster.js'){
      readCount++;const rows=readCount===1?currentBefore:currentAfter,revision=readCount===1?REVISION_A:REVISION_B;
      return encode('operations-roster',{schemaVersion:1,bridgeContract:DEFAULT_OPERATIONS_BRIDGE.contract,writeContract:DEFAULT_OPERATIONS_BRIDGE.writeContract,revision,serverNow:'2026-09-22T19:00:00Z',roster:rows});
    }
    if(file==='apply-operations-roster.js'){
      applyAttempts++;const packed=decodeBridgeArg(args[0]),req=validateWriteRequest(packed.request,{studentEmailDomain:packed.bridge.studentEmailDomain});requestIds.push(req.requestId);
      assert.equal(packed.bridge.writeContract,DEFAULT_OPERATIONS_BRIDGE.writeContract);assert.equal(req.baseRevision,REVISION_A);assert.equal(req.add.length,1);assert.equal(req.updateName.length,1);assert.equal(req.deactivate,undefined);
      if(failFirstApply&&applyAttempts===1)throw new Error('simulated browser disconnect after uncertain write');
      return encode('operations-roster-applied',{ok:true,schemaVersion:1,requestId:req.requestId,appliedAt:'2026-09-22T19:05:00Z',writeContract:DEFAULT_OPERATIONS_BRIDGE.writeContract,previousRevision:REVISION_A,revision:REVISION_B,counts:{added:1,reactivated:0,nameRowsUpdated:1,requestedNameUpdates:1,createdPins:1,createdPinCards:1}});
    }
    throw new Error(`Unexpected child ${file}`);
  }});
  return {service,plain,secure,calls,get applyAttempts(){return applyAttempts},get requestIds(){return requestIds}};
}

(async()=>{
  const h=makeHarness();const state=await h.service.readOperationsRoster();
  assert.equal(state.operations.count,2);assert.equal(state.operations.writeReady,true);assert.equal(state.syncPlan.counts.add,1);assert.equal(state.syncPlan.counts.updateName,1);assert.equal(state.syncPlan.counts.deactivate,1);assert.equal(h.plain.has('operations-roster.secure.json'),false,'Student operations roster must never be written through plaintext localData.');
  const outcome=await h.service.applySafeChanges();
  assert.equal(outcome.result.counts.added,1);assert.equal(outcome.result.counts.nameRowsUpdated,1);assert.equal(outcome.state.syncPlan.counts.add,0);assert.equal(outcome.state.syncPlan.counts.updateName,0);assert.equal(outcome.state.syncPlan.counts.deactivate,1,'Removal candidate must remain review-only after safe writes.');assert.equal(outcome.state.pendingWrite.status,'NONE');assert.deepEqual(h.calls,['read-operations-roster.js','apply-operations-roster.js','read-operations-roster.js']);
  console.log('GoClassroom approved roster write checks passed: only additions/name corrections are sent, response is revision-verified, and live roster is re-read.');

  const recovery=makeHarness({failFirstApply:true});await recovery.service.readOperationsRoster();
  let failed=false;try{await recovery.service.applySafeChanges()}catch{failed=true}assert.equal(failed,true);const pending=recovery.service.publicState().pendingWrite;assert.equal(pending.status,'PENDING');assert.equal(pending.count,2);
  const recovered=await recovery.service.applySafeChanges();assert.equal(recovered.state.pendingWrite.status,'NONE');assert.equal(recovery.requestIds.length,2);assert.equal(recovery.requestIds[0],recovery.requestIds[1],'Uncertain failures must retry the exact same idempotent request ID.');
  console.log('GoClassroom roster recovery checks passed: uncertain writes stay encrypted and retry the same server request ID.');

  const localRecovery=makeHarness({failComparisonClearOnce:true});await localRecovery.service.readOperationsRoster();
  let localFailed=false;try{await localRecovery.service.applySafeChanges()}catch{localFailed=true}assert.equal(localFailed,true);assert.equal(localRecovery.service.publicState().pendingWrite.status,'PENDING','Pending approved write must remain when post-write comparison cleanup fails.');
  const localRecovered=await localRecovery.service.applySafeChanges();assert.equal(localRecovered.state.pendingWrite.status,'NONE');assert.equal(localRecovery.requestIds[0],localRecovery.requestIds[1],'Post-write local recovery must replay the same server request ID.');
  console.log('GoClassroom post-write local recovery check passed: pending approval is cleared only after stale comparison state is removed.');

  const {createRosterApplyHandler}=require('../main-services/roster-confirmation');
  let dialogCalls=0,applyCalls=0;
  const invalidHandler=createRosterApplyHandler({dialog:{showMessageBox:async()=>{dialogCalls++;return {response:1}}},getRosterIntegration:()=>({validateSafeChanges:()=>{throw new Error('invalid before confirmation')},state:()=>({}),applySafeChanges:async()=>{applyCalls++}})});
  await assert.rejects(()=>invalidHandler(),/invalid before confirmation/);assert.equal(dialogCalls,0,'Known-invalid roster batches must be rejected before the teacher confirmation dialog.');assert.equal(applyCalls,0);
  const validHandler=createRosterApplyHandler({dialog:{showMessageBox:async()=>{dialogCalls++;return {response:0}}},getRosterIntegration:()=>({validateSafeChanges:()=>({add:[{}],updateName:[{}]}),state:()=>({pendingWrite:{status:'NONE'}}),applySafeChanges:async()=>{applyCalls++}})});
  const cancelled=await validHandler();assert.equal(cancelled.cancelled,true);assert.equal(applyCalls,0,'Cancel-default confirmation must not apply roster changes.');
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
