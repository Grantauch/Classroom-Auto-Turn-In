const assert=require('assert');
const {normalizeRosterSnapshot,normalizeMappings}=require('../engine/classroom-roster');
const {encode}=require('../engine/protocol');
const {createRosterService,DEFAULT_OPERATIONS_BRIDGE}=require('../main-services/roster-service');
const {createRosterApplyHandler}=require('../main-services/roster-confirmation');
const {decodeBridgeArg,validateWriteRequest,selectRecoverySafeWriteBatch,estimatePendingRecoveryBytes,ROSTER_RECOVERY_TARGET_BYTES}=require('../engine/operations-roster-bridge');

const REVISION_A='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const REVISION_B='BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const REVISION_C='CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
const PERIOD='Period 3 — Beyond the Scoreboard';

function evidenceAdds(){
  return Array.from({length:29},(_,index)=>{
    const n=String(index+1).padStart(2,'0');
    return {studentEmail:`student.${n}@students.mtmorrisschools.org`,studentName:`Student ${n}${index<19?' AB':' A'}`,classPeriod:PERIOD};
  });
}

function makeService({failFirstApply=false,rejectSecondApply=false}={}){
  const plain=new Map(),secure=new Map(),calls=[],additions=evidenceAdds(),now=new Date().toISOString();
  const snapshot=normalizeRosterSnapshot({discoveredAt:now,classes:[{courseId:'COURSE1',courseDisplayName:'History',studentsHeadingFound:true,scrollComplete:true,discoveredStudentRows:additions.length,students:additions.map((row,index)=>({name:row.studentName,email:row.studentEmail,sourceStudentId:`S${index+1}`}))}]});
  secure.set('roster-sync.secure.json',{schemaVersion:1,lastDiscoveryAt:now,snapshot,lastDiff:{counts:{}},issues:[]});
  secure.set('operations-roster.secure.json',{schemaVersion:1,lastReadAt:now,serverNow:now,bridgeContract:DEFAULT_OPERATIONS_BRIDGE.contract,writeContract:DEFAULT_OPERATIONS_BRIDGE.writeContract,revision:REVISION_A,roster:[]});
  plain.set('roster-mappings.json',normalizeMappings({classMappings:{COURSE1:{classPeriod:PERIOD}}}));
  plain.set('roster-bridge.json',{...DEFAULT_OPERATIONS_BRIDGE,studentEmailDomain:'students.mtmorrisschools.org'});
  const localData={readJson:(name,fallback)=>plain.has(name)?JSON.parse(JSON.stringify(plain.get(name))):fallback,writeJson:(name,value)=>{plain.set(name,JSON.parse(JSON.stringify(value)));return value},appLog:()=>{}};
  const secureData={read:(name,fallback)=>secure.has(name)?JSON.parse(JSON.stringify(secure.get(name))):fallback,write:(name,value)=>{secure.set(name,JSON.parse(JSON.stringify(value)));return value}};
  let liveRows=[],applyAttempts=0,readbacks=0,lastRequest=null;
  const service=createRosterService({localData,secureData,ensureAutomationIdle:()=>{},compactError:error=>String(error?.message||error),runExclusiveBrowser:async(_label,fn)=>fn(),runNodeScript:async(file,args)=>{
    calls.push(file);
    if(file==='apply-operations-roster.js'){
      applyAttempts++;
      const packed=decodeBridgeArg(args[0]),request=validateWriteRequest(packed.request,{studentEmailDomain:'students.mtmorrisschools.org'});lastRequest=request;
      if(failFirstApply&&applyAttempts===1)throw new Error('simulated uncertain first batch failure');
      if(rejectSecondApply&&applyAttempts===2){const error=new Error('The roster changed before anything was applied. Compare rosters again.');error.code='ROSTER_REJECTED_NO_EFFECTS';throw error;}
      for(const row of request.add)if(!liveRows.some(existing=>existing.studentEmail===row.studentEmail&&existing.classPeriod===row.classPeriod))liveRows.push({...row,active:true});
      for(const row of request.updateName){const existing=liveRows.find(item=>item.studentEmail===row.studentEmail&&item.classPeriod===row.classPeriod);if(existing)existing.studentName=row.studentName;}
      const revision=applyAttempts===1?REVISION_B:REVISION_C;
      return encode('operations-roster-applied',{ok:true,schemaVersion:1,requestId:request.requestId,appliedAt:new Date().toISOString(),writeContract:DEFAULT_OPERATIONS_BRIDGE.writeContract,previousRevision:request.baseRevision,revision,counts:{added:request.add.length,reactivated:0,nameRowsUpdated:request.updateName.length,requestedNameUpdates:request.updateName.length,createdPins:request.add.length,createdPinCards:request.add.length,verifiedCredentialMemberships:request.add.length}});
    }
    if(file==='read-operations-roster.js'){
      readbacks++;
      const revision=applyAttempts<=1?REVISION_B:REVISION_C;
      return encode('operations-roster',{schemaVersion:1,bridgeContract:DEFAULT_OPERATIONS_BRIDGE.contract,writeContract:DEFAULT_OPERATIONS_BRIDGE.writeContract,revision,serverNow:new Date().toISOString(),roster:liveRows});
    }
    throw new Error(`Unexpected child ${file}`);
  }});
  return {service,secure,calls,get applyAttempts(){return applyAttempts},get readbacks(){return readbacks},get lastRequest(){return lastRequest},get liveRows(){return liveRows}};
}

async function run(){
  const additions=evidenceAdds();
  assert.equal(estimatePendingRecoveryBytes(additions,[]),8244,'Evidence-pack reproducer must remain exactly 8,244 bytes.');
  assert.equal(ROSTER_RECOVERY_TARGET_BYTES,8192,'The protected recovery bound must remain 8,192 bytes.');
  assert.throws(()=>validateWriteRequest({confirmation:'APPLY SAFE ROSTER CHANGES',requestId:'gcr-issue6-full-29',baseRevision:REVISION_A,add:additions,updateName:[]},{studentEmailDomain:'students.mtmorrisschools.org'}),/too large to preserve safely/i,'The recovery limit itself must not be weakened.');
  const bounded=selectRecoverySafeWriteBatch(additions,[],{studentEmailDomain:'students.mtmorrisschools.org'});
  assert.equal(bounded.totalCount,29);
  assert.equal(bounded.selectedCount,28);
  assert.equal(bounded.remainingCount,1);
  assert.equal(estimatePendingRecoveryBytes(bounded.add,bounded.updateName),7969);
  assert.ok(estimatePendingRecoveryBytes(bounded.add,bounded.updateName)<=ROSTER_RECOVERY_TARGET_BYTES);
  assert.equal(bounded.add[27].studentEmail,additions[27].studentEmail);

  const h=makeService();
  const first=h.service.validateSafeChanges();
  assert.equal(first.add.length,28);
  assert.equal(first.baseRevision,REVISION_A);
  assert.ok(estimatePendingRecoveryBytes(first.add,first.updateName)<=ROSTER_RECOVERY_TARGET_BYTES);
  const firstOutcome=await h.service.applySafeChanges(first);
  assert.equal(firstOutcome.verified,true);
  assert.equal(h.readbacks,1,'A verified first batch must perform a fresh live roster read before another batch can be formed.');
  assert.equal(firstOutcome.state.pendingWrite.status,'NONE');
  const second=h.service.validateSafeChanges();
  assert.equal(second.add.length,1,'Only the remaining change may be offered after the fresh readback.');
  assert.equal(second.baseRevision,REVISION_B,'The next batch must be bound to the fresh post-batch revision.');
  assert.notEqual(second.requestId,first.requestId,'Each separately approved batch must have a new request identity.');
  assert.equal(second.add[0].studentEmail,additions[28].studentEmail);
  const secondOutcome=await h.service.applySafeChanges(second);
  assert.equal(secondOutcome.verified,true);
  assert.equal(h.readbacks,2);
  assert.equal(h.liveRows.length,29);
  assert.throws(()=>h.service.validateSafeChanges(),/no safe additions or name updates/i);

  const recovery=makeService({failFirstApply:true});
  const reviewed=recovery.service.validateSafeChanges();
  await assert.rejects(()=>recovery.service.applySafeChanges(reviewed),/simulated uncertain first batch failure/);
  const pending=recovery.service.publicState().pendingWrite;
  assert.equal(pending.status,'PENDING');
  assert.equal(pending.count,28,'An uncertain first batch must retain exactly that bounded batch.');
  const retry=recovery.service.validateSafeChanges();
  assert.equal(retry.requestId,reviewed.requestId,'Recovery must retry the exact same bounded request ID.');
  assert.deepEqual(retry.add,reviewed.add,'Recovery must not mix the remaining 29th change into the pending batch.');

  const stale=makeService({rejectSecondApply:true});
  const staleFirst=stale.service.validateSafeChanges();
  await stale.service.applySafeChanges(staleFirst);
  const staleSecond=stale.service.validateSafeChanges();
  assert.equal(staleSecond.baseRevision,REVISION_B);
  await assert.rejects(()=>stale.service.applySafeChanges(staleSecond),/roster changed/i);
  assert.equal(stale.service.publicState().pendingWrite.status,'NONE');
  assert.equal(stale.service.publicState().operations.lastReadAt,'');
  assert.throws(()=>stale.service.validateSafeChanges(),/Compare with Hall Pass \/ Check-In immediately/i);

  let dialogCalls=0,submitted=[],round=0;
  const confirmation=createRosterApplyHandler({
    dialog:{showMessageBox:async options=>{
      dialogCalls++;
      if(dialogCalls===1){
        assert.match(options.detail,/one recovery-safe batch of 28 from 29 safe changes/i);
        assert.match(options.detail,/fresh live roster comparison/i);
        assert.match(options.detail,/separate approval/i);
      }
      return {response:1};
    }},
    getRosterIntegration:()=>({
      validateSafeChanges:()=>round++===0?first:second,
      state:()=>({pendingWrite:{status:'NONE'},syncPlan:{counts:round<=1?{add:29,updateName:0}:{add:1,updateName:0}}}),
      applySafeChanges:async payload=>{submitted.push(payload);return {verified:true,state:{pendingWrite:{status:'NONE'}}};}
    })
  });
  await confirmation();
  await confirmation();
  assert.equal(dialogCalls,2,'Two bounded batches must require two separate teacher confirmations.');
  assert.deepEqual(submitted,[first,second],'Each confirmation must submit only the exact batch shown in that confirmation.');

  console.log('GoClassroom bounded roster batch checks passed: the 8,244-byte 29-addition case splits safely, preserves the 8,192-byte limit, refreshes between batches, and keeps approvals/recovery isolated.');
}

if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1});
module.exports={run,evidenceAdds};
