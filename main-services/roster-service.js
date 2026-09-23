const crypto=require('crypto');
const {lastPayload}=require('../engine/protocol');
const {normalizeRosterSnapshot,diffRosterSnapshots,normalizeMappings,mappingConflicts,buildOperationsRosterCandidate,normalizeOperationsRoster,planOperationsRosterSync}=require('../engine/classroom-roster');
const {validateWriteRequest}=require('../engine/operations-roster-bridge');

const DEFAULT_OPERATIONS_BRIDGE={
  schemaVersion:1,
  url:'https://script.google.com/a/macros/mtmorrisschools.org/s/AKfycby2cAUsc1T0tTQkIWTrGwdOrfD2p5cX3EKBG3obW-QY2Ndd8T-cpjoT8bXU__on-qWa/exec',
  contract:'2026-09-22-roster-sync-v1',
  writeContract:'2026-09-22-roster-write-v1',
  studentEmailDomain:'students.mtmorrisschools.org'
};
const ROSTER_WRITE_CONFIRMATION='APPLY SAFE ROSTER CHANGES';
function emptyState(){return {schemaVersion:1,lastDiscoveryAt:'',snapshot:{schemaVersion:1,source:'google-classroom-ui',discoveredAt:'',classes:[]},lastDiff:{added:[],removed:[],changed:[],counts:{added:0,removed:0,changed:0,unresolved:0}},issues:[]}}
function emptyOperationsState(){return {schemaVersion:1,lastReadAt:'',serverNow:'',bridgeContract:'',writeContract:'',revision:'',roster:[]}}
function emptyPendingWrite(){return {schemaVersion:1,status:'NONE',createdAt:'',request:null}}
function emptyLastWrite(){return {schemaVersion:1,appliedAt:'',result:null}}
function normalizeBridgeSettings(value={}){
  const url=String(value.url||DEFAULT_OPERATIONS_BRIDGE.url).trim(),contract=String(value.contract||DEFAULT_OPERATIONS_BRIDGE.contract).trim(),writeContract=String(value.writeContract||DEFAULT_OPERATIONS_BRIDGE.writeContract).trim(),studentEmailDomain=String(value.studentEmailDomain||DEFAULT_OPERATIONS_BRIDGE.studentEmailDomain||'').trim().toLowerCase();
  return {schemaVersion:1,url,contract,writeContract,studentEmailDomain};
}
function encodeBridgeArg(value){return Buffer.from(JSON.stringify(value),'utf8').toString('base64url')}
function publicPending(value={}){
  if(value?.status!=='PENDING'||!value.request)return {status:'NONE',createdAt:'',count:0};
  return {status:'PENDING',createdAt:String(value.createdAt||''),requestId:String(value.request.requestId||''),count:(value.request.add?.length||0)+(value.request.updateName?.length||0),add:Number(value.request.add?.length||0),updateName:Number(value.request.updateName?.length||0)};
}

function createRosterService({localData,secureData,ensureAutomationIdle,runNodeScript,runExclusiveBrowser,compactError}){
  const {readJson,writeJson,appLog}=localData;
  if(!secureData)throw new Error('Roster service requires encrypted local storage.');
  const describeError=error=>typeof compactError==='function'?compactError(error):String(error?.message||error||'Unknown error');
  const safeRosterLogCode=error=>{const code=String(error?.code||'').trim();return /^[A-Za-z0-9._:-]{1,80}$/.test(code)?` Error code ${code}.`:''};
  function recoverableSecureRead(name,fallback,label){
    try{return secureData.read(name,fallback)}
    catch(error){appLog(`${label} could not be read and will be treated as stale until it is refreshed. ${describeError(error)}`);return fallback}
  }
  function loadState(){const raw=recoverableSecureRead('roster-sync.secure.json',emptyState(),'Cached Classroom roster');return {...emptyState(),...raw,snapshot:normalizeRosterSnapshot(raw?.snapshot||{}),lastDiff:raw?.lastDiff||emptyState().lastDiff,issues:Array.isArray(raw?.issues)?raw.issues:[]}}
  function loadMappings(){return normalizeMappings(readJson('roster-mappings.json',{schemaVersion:1,classMappings:{}}))}
  function loadBridgeSettings(){return normalizeBridgeSettings(readJson('roster-bridge.json',DEFAULT_OPERATIONS_BRIDGE))}
  function loadOperationsState(){const raw=recoverableSecureRead('operations-roster.secure.json',emptyOperationsState(),'Cached Hall Pass roster comparison');return {...emptyOperationsState(),...raw,roster:normalizeOperationsRoster(raw?.roster||[])}}
  // A pending write is the one encrypted record that is never disposable: if it
  // cannot be read, GoClassroom must stop rather than risk creating a second batch.
  function loadPendingWrite(){const raw=secureData.read('roster-write-pending.secure.json',emptyPendingWrite());return raw?.status==='PENDING'&&raw?.request?raw:emptyPendingWrite()}
  function loadLastWrite(){const raw=recoverableSecureRead('roster-write-last.secure.json',emptyLastWrite(),'Last roster write receipt');return {...emptyLastWrite(),...raw}}
  function assertNoPendingWrite(){const pending=loadPendingWrite();if(pending.status==='PENDING')throw new Error('A previously approved roster batch still needs recovery. Retry that same batch before scanning, remapping, or comparing again.');}
  function invalidateOperationsComparison(){secureData.write('operations-roster.secure.json',emptyOperationsState())}
  function saveMappings(value={}){
    ensureAutomationIdle();assertNoPendingWrite();
    const mappings=normalizeMappings(value),conflicts=mappingConflicts(mappings);
    if(conflicts.length)throw new Error(`Each school period can be mapped to only one Classroom. ${conflicts.map(x=>x.classPeriod).join(', ')} ${conflicts.length===1?'is':'are'} mapped more than once.`);
    invalidateOperationsComparison();writeJson('roster-mappings.json',mappings);return publicState();
  }
  function publicState(){
    const state=loadState(),mappings=loadMappings(),preview=buildOperationsRosterCandidate(state.snapshot,mappings),operations=loadOperationsState(),pending=loadPendingWrite(),lastWrite=loadLastWrite();
    const syncPlan=operations.lastReadAt?planOperationsRosterSync(preview,operations.roster):null;
    const classPeriods=[...new Set(operations.roster.map(row=>String(row.classPeriod||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    return {...state,mappings,preview,operations:{lastReadAt:operations.lastReadAt,serverNow:operations.serverNow,count:operations.roster.length,revision:operations.revision,writeReady:Boolean(operations.revision&&operations.writeContract),classPeriods},syncPlan,pendingWrite:publicPending(pending),lastWrite:{appliedAt:lastWrite.appliedAt||'',counts:lastWrite.result?.counts||null}};
  }
  async function discover(){
    ensureAutomationIdle();assertNoPendingWrite();
    if(typeof runNodeScript!=='function')throw new Error('The Classroom roster browser bridge is not available in this build.');
    const execute=()=>runNodeScript('discover-classroom-rosters.js',[],false,{timeoutMs:12*60*1000});
    const out=typeof runExclusiveBrowser==='function'?await runExclusiveBrowser('Classroom roster discovery',execute):await execute();
    const payload=lastPayload(out,'classroom-rosters');
    if(!payload?.snapshot)throw new Error('GoClassroom could not read a safe Classroom roster snapshot. Nothing was synchronized.');
    const before=loadState(),snapshot=normalizeRosterSnapshot(payload.snapshot),diff=diffRosterSnapshots(before.snapshot,snapshot);
    const issues=(Array.isArray(payload.issues)?payload.issues:[]).map(x=>({courseId:String(x?.courseId||''),courseDisplayName:String(x?.courseDisplayName||''),message:compactError(x?.message||'Roster discovery needs review.')})).slice(0,40);
    invalidateOperationsComparison();
    secureData.write('roster-sync.secure.json',{schemaVersion:1,lastDiscoveryAt:new Date().toISOString(),snapshot,lastDiff:diff,issues});
    const classCount=snapshot.classes.length,studentCount=snapshot.classes.reduce((n,c)=>n+c.students.length,0);
    appLog(`Classroom roster discovery cached ${studentCount} verified student email identit${studentCount===1?'y':'ies'} across ${classCount} teaching Classroom${classCount===1?'':'s'}. A fresh operations comparison is required before any approved write.`);
    return publicState();
  }
  async function readOperationsRoster(){
    ensureAutomationIdle();assertNoPendingWrite();
    if(typeof runNodeScript!=='function')throw new Error('The Hall Pass / Check-In roster bridge is not available in this build.');
    const bridge=loadBridgeSettings(),arg=encodeBridgeArg(bridge);
    const execute=()=>runNodeScript('read-operations-roster.js',[arg],false,{timeoutMs:4*60*1000});
    const out=typeof runExclusiveBrowser==='function'?await runExclusiveBrowser('Hall Pass roster comparison',execute):await execute();
    const payload=lastPayload(out,'operations-roster');
    if(!payload||!Array.isArray(payload.roster)||String(payload.bridgeContract||'')!==bridge.contract||String(payload.writeContract||'')!==bridge.writeContract||!payload.revision)throw new Error('GoClassroom could not verify the Hall Pass / Check-In roster response. Nothing was synchronized.');
    const roster=normalizeOperationsRoster(payload.roster);
    if(roster.length!==payload.roster.length)throw new Error('The Hall Pass / Check-In roster contained an invalid membership row. Nothing was synchronized.');
    secureData.write('operations-roster.secure.json',{schemaVersion:1,lastReadAt:new Date().toISOString(),serverNow:String(payload.serverNow||''),bridgeContract:String(payload.bridgeContract||''),writeContract:String(payload.writeContract||''),revision:String(payload.revision||''),roster});
    appLog(`Roster comparison read ${roster.length} active Hall Pass / Check-In membership${roster.length===1?'':'s'} at revision ${String(payload.revision||'').slice(0,10)}…. No operational record was changed.`);
    return publicState();
  }
  function buildNewWriteRequest(requestId,bridge=loadBridgeSettings()){
    const state=loadState(),mappings=loadMappings(),preview=buildOperationsRosterCandidate(state.snapshot,mappings),operations=loadOperationsState();
    if(!operations.lastReadAt||!operations.revision||!operations.writeContract)throw new Error('Compare with Hall Pass / Check-In immediately before applying roster changes.');
    const plan=planOperationsRosterSync(preview,operations.roster),safeCount=plan.add.length+plan.updateName.length;
    if(!safeCount)throw new Error('There are no safe additions or name updates to apply. Removal candidates stay review-only.');
    return validateWriteRequest({
      confirmation:ROSTER_WRITE_CONFIRMATION,
      requestId,
      baseRevision:operations.revision,
      add:plan.add.map(x=>({studentEmail:x.studentEmail,studentName:x.studentName,classPeriod:x.classPeriod})),
      updateName:plan.updateName.map(x=>({studentEmail:x.after.studentEmail,studentName:x.after.studentName,beforeName:x.before.studentName,classPeriod:x.after.classPeriod}))
    },{studentEmailDomain:bridge.studentEmailDomain});
  }
  function validateSafeChanges(){
    const bridge=loadBridgeSettings(),pending=loadPendingWrite();
    return pending.status==='PENDING'?validateWriteRequest(pending.request,{studentEmailDomain:bridge.studentEmailDomain}):buildNewWriteRequest('gcr-preview-validation',bridge);
  }
  function createWriteRequest(){
    const bridge=loadBridgeSettings(),pending=loadPendingWrite();if(pending.status==='PENDING')return validateWriteRequest(pending.request,{studentEmailDomain:bridge.studentEmailDomain});
    const request=buildNewWriteRequest(`gcr-${crypto.randomUUID()}`,bridge);
    secureData.write('roster-write-pending.secure.json',{schemaVersion:1,status:'PENDING',createdAt:new Date().toISOString(),request});
    return request;
  }
  async function applySafeChanges(){
    ensureAutomationIdle();
    if(typeof runNodeScript!=='function')throw new Error('The Hall Pass / Check-In roster write bridge is not available in this build.');
    const bridge=loadBridgeSettings(),request=createWriteRequest(),arg=encodeBridgeArg({bridge,request});
    const execute=()=>runNodeScript('apply-operations-roster.js',[arg],false,{timeoutMs:5*60*1000});
    let payload;
    try{
      const out=typeof runExclusiveBrowser==='function'?await runExclusiveBrowser('Approved Hall Pass roster sync',execute):await execute();
      payload=lastPayload(out,'operations-roster-applied');
      if(!payload||payload.ok!==true||String(payload.requestId||'')!==request.requestId)throw new Error('GoClassroom could not verify the approved roster write response. Retry the same approved batch.');
    }catch(error){
      appLog(`Approved roster batch ${request.requestId} did not return a verified completion. The encrypted pending request was retained for idempotent recovery.${safeRosterLogCode(error)}`);
      throw error;
    }
    secureData.write('roster-write-last.secure.json',{schemaVersion:1,appliedAt:String(payload.appliedAt||new Date().toISOString()),result:payload});
    secureData.write('operations-roster.secure.json',emptyOperationsState());
    secureData.write('roster-write-pending.secure.json',emptyPendingWrite());
    appLog(`Approved roster batch ${request.requestId} completed. Removals were not requested. Verifying the live operations roster now.`);
    try{return {result:payload,state:await readOperationsRoster(),refreshNeeded:false}}
    catch(error){appLog(`Approved roster batch ${request.requestId} completed, but the follow-up roster read needs attention.${safeRosterLogCode(error)}`);return {result:payload,state:publicState(),refreshNeeded:true}}
  }
  return {loadState,loadMappings,loadBridgeSettings,loadOperationsState,loadPendingWrite,saveMappings,publicState,discover,readOperationsRoster,validateSafeChanges,createWriteRequest,applySafeChanges};
}
module.exports={DEFAULT_OPERATIONS_BRIDGE,ROSTER_WRITE_CONFIRMATION,normalizeBridgeSettings,createRosterService};
