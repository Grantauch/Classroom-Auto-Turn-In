const {normalizeOperationsRoster}=require('./classroom-roster');

function clean(value,max=500){return String(value??'').replace(/\s+/g,' ').trim().slice(0,max)}
function decodeBridgeArg(value){
  try{return JSON.parse(Buffer.from(String(value||''),'base64url').toString('utf8'))}
  catch{throw new Error('The GoClassroom roster bridge settings are invalid. Nothing was synchronized.')}
}
function validateBridge(value={}){
  const url=String(value.url||'').trim(),contract=String(value.contract||'').trim(),writeContract=String(value.writeContract||'').trim(),studentEmailDomain=String(value.studentEmailDomain||'').trim().toLowerCase();
  let parsed=null;try{parsed=new URL(url)}catch{parsed=null}
  if(!parsed||parsed.protocol!=='https:'||parsed.hostname!=='script.google.com'||!/\/macros\//i.test(parsed.pathname))throw new Error('The Hall Pass / Check-In roster bridge URL is not valid. Nothing was synchronized.');
  if(!/^[A-Za-z0-9._:-]{8,120}$/.test(contract))throw new Error('The Hall Pass / Check-In roster bridge contract is not valid. Nothing was synchronized.');
  if(writeContract&&!/^[A-Za-z0-9._:-]{8,120}$/.test(writeContract))throw new Error('The Hall Pass / Check-In roster write contract is not valid. Nothing was synchronized.');
  if(studentEmailDomain&&!/^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(studentEmailDomain))throw new Error('The configured student email domain is not valid. Nothing was synchronized.');
  return {url:parsed.toString(),contract,writeContract,studentEmailDomain};
}
function teacherUrl(base){const u=new URL(base);u.searchParams.set('mode','teacher');return u.toString()}
function validRevision(value){return /^[A-Za-z0-9_-]{20,80}$/.test(String(value||''))}
function validateOperationsPayload(result,contract){
  if(!result||result.ok!==true||String(result.bridgeContract||'')!==String(contract||'')||!Array.isArray(result.roster))throw new Error('The Hall Pass / Check-In roster bridge returned an unexpected response. Nothing was synchronized.');
  const roster=normalizeOperationsRoster(result.roster);
  if(roster.length!==result.roster.length)throw new Error('The Hall Pass / Check-In roster contained an invalid membership row. Nothing was synchronized.');
  const rosterKeys=new Set();for(const row of roster){const key=`${row.studentEmail}::${row.classPeriod.toLowerCase()}`;if(rosterKeys.has(key))throw new Error('The Hall Pass / Check-In roster contains a duplicate active membership. Fix the roster before synchronizing.');rosterKeys.add(key)}
  const revision=String(result.revision||''),writeContract=String(result.writeContract||'');
  if(!validRevision(revision)||!/^[A-Za-z0-9._:-]{8,120}$/.test(writeContract))throw new Error('The Hall Pass / Check-In roster bridge did not provide a safe write revision. Nothing was synchronized.');
  return {schemaVersion:1,bridgeContract:String(contract||''),writeContract,revision,serverNow:String(result.serverNow||''),roster};
}
function cleanWriteText(value,label,max){
  const text=String(value??'').replace(/\s+/g,' ').trim();
  if(text.length>max)throw new Error(`The approved roster batch contains a ${label} that is too long. Compare rosters again.`);
  return text;
}
function normalizeAddRows(rows=[]){
  return (Array.isArray(rows)?rows:[]).map(row=>({studentEmail:cleanWriteText(row?.studentEmail,'student email',320).toLowerCase(),studentName:cleanWriteText(row?.studentName,'student name',120),classPeriod:cleanWriteText(row?.classPeriod,'class period',120)}));
}
function normalizeNameRows(rows=[]){
  return (Array.isArray(rows)?rows:[]).map(row=>({studentEmail:cleanWriteText(row?.studentEmail,'student email',320).toLowerCase(),studentName:cleanWriteText(row?.studentName,'student name',120),beforeName:cleanWriteText(row?.beforeName,'previous student name',120),classPeriod:cleanWriteText(row?.classPeriod,'class period',120)}));
}
const ROSTER_RECOVERY_TARGET_BYTES=8*1024;
const ROSTER_RECOVERY_CONFIRMATION='REAPPLY REVIEWED PREWRITE CHANGES';
function estimatePendingRecoveryBytes(add,updateName){
  const keyOf=row=>`${row.studentEmail}::${row.classPeriod}`;
  const plan={
    v:2,
    addActions:add.map(row=>({key:keyOf(row),action:'reactivated',beforeName:row.studentName,stage:'PLANNED'})),
    nameActions:updateName.map(row=>({key:keyOf(row),stage:'PLANNED'})),
    missingPinEmails:[...new Set(add.map(row=>row.studentEmail))],
    missingPinCardKeys:add.map(keyOf)
  };
  const record={v:3,status:'PENDING',at:'2026-09-22T00:00:00.000Z',updatedAt:'2026-09-22T00:00:00.000Z',payloadDigest:'x'.repeat(43),plan};
  return Buffer.byteLength(JSON.stringify(record),'utf8');
}
function validateWriteRequest(request={},expected={}){
  if(!request||typeof request!=='object'||Array.isArray(request))throw new Error('The approved roster write request is invalid. Compare rosters again.');
  const requestId=String(request.requestId||'').trim(),baseRevision=String(request.baseRevision||'').trim();
  if(!/^[A-Za-z0-9._:-]{8,120}$/.test(requestId)||!validRevision(baseRevision))throw new Error('The approved roster write request is missing its safe comparison identity. Compare rosters again.');
  if(String(request.confirmation||'')!=='APPLY SAFE ROSTER CHANGES')throw new Error('The approved roster write request is missing teacher confirmation. Nothing was synchronized.');
  if((Array.isArray(request.deactivate)&&request.deactivate.length)||(Array.isArray(request.remove)&&request.remove.length)||(Array.isArray(request.delete)&&request.delete.length))throw new Error('GoClassroom does not apply roster removals automatically.');
  const add=normalizeAddRows(request.add),updateName=normalizeNameRows(request.updateName);
  if(!add.length&&!updateName.length)throw new Error('There are no safe roster additions or name updates to apply.');
  if(add.length+updateName.length>200)throw new Error('The approved roster batch is too large. Compare rosters again.');
  const membershipOk=row=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.studentEmail)&&row.studentName&&/^Period\s+[1-6](?:\b|\s|$)/i.test(row.classPeriod);
  if(!add.every(membershipOk)||!updateName.every(row=>membershipOk(row)&&row.beforeName))throw new Error('The approved roster batch contains an invalid membership. Compare rosters again.');
  const addKeys=new Set(),updateKeys=new Set();
  for(const row of add){const key=`${row.studentEmail}::${row.classPeriod.toLowerCase()}`;if(addKeys.has(key))throw new Error(`The approved roster batch contains duplicate additions for ${row.studentEmail} / ${row.classPeriod}. Compare rosters again.`);addKeys.add(key)}
  for(const row of updateName){const key=`${row.studentEmail}::${row.classPeriod.toLowerCase()}`;if(updateKeys.has(key))throw new Error(`The approved roster batch contains duplicate name updates for ${row.studentEmail} / ${row.classPeriod}. Compare rosters again.`);if(addKeys.has(key))throw new Error(`The approved roster batch tries to both add and rename ${row.studentEmail} / ${row.classPeriod}. Compare rosters again.`);updateKeys.add(key)}
  const all=[...add,...updateName],studentEmailDomain=String(expected.studentEmailDomain||'').trim().toLowerCase();
  if(studentEmailDomain&&all.some(row=>row.studentEmail.split('@').pop()!==studentEmailDomain))throw new Error(`The approved roster batch contains a student email outside @${studentEmailDomain}. Compare rosters again.`);
  if(all.some(row=>/^[=+\-@]/.test(row.studentName))||updateName.some(row=>/^[=+\-@]/.test(row.beforeName)))throw new Error('The approved roster batch contains a student name that cannot be written safely. Compare rosters again.');
  const desiredByEmail=new Map();
  for(const row of all){const prior=desiredByEmail.get(row.studentEmail);if(prior&&prior!==row.studentName)throw new Error(`The approved roster batch contains conflicting names for ${row.studentEmail}. Compare rosters again.`);desiredByEmail.set(row.studentEmail,row.studentName)}
  if(estimatePendingRecoveryBytes(add,updateName)>ROSTER_RECOVERY_TARGET_BYTES)throw new Error('This roster batch is too large to preserve safely for crash recovery. Sync a smaller batch before continuing.');
  return {confirmation:'APPLY SAFE ROSTER CHANGES',requestId,baseRevision,add,updateName};
}
function validateRecoveryDecision(value){
  if(value===undefined||value===null)return null;
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('The roster recovery decision is invalid. Review the pending batch again.');
  if(String(value.confirmation||'')!==ROSTER_RECOVERY_CONFIRMATION)throw new Error('The roster recovery decision is missing explicit teacher confirmation. Nothing uncertain was written.');
  const token=String(value.token||'').trim();
  if(!validRevision(token))throw new Error('The roster recovery review token is invalid. Review the pending batch again.');
  return {confirmation:ROSTER_RECOVERY_CONFIRMATION,token};
}
function validateRecoveryReview(result,expected={}){
  if(!result||result.ok!==false||String(result.status||'')!=='RECOVERY_REVIEW_REQUIRED'||String(result.requestId||'')!==String(expected.requestId||'')||String(result.writeContract||'')!==String(expected.writeContract||''))throw new Error('The Hall Pass / Check-In roster recovery review returned an unexpected response. The pending batch was not changed.');
  const recoveryToken=String(result.recoveryToken||'').trim();
  if(!validRevision(recoveryToken))throw new Error('The Hall Pass / Check-In roster recovery review did not provide a safe review token. The pending batch was not changed.');
  const raw=result.reviewCounts&&typeof result.reviewCounts==='object'?result.reviewCounts:{};
  const reviewCounts={additions:Number(raw.additions||0),reactivations:Number(raw.reactivations||0),nameUpdates:Number(raw.nameUpdates||0)};
  if(Object.values(reviewCounts).some(value=>!Number.isInteger(value)||value<0)||Object.values(reviewCounts).reduce((a,b)=>a+b,0)<1)throw new Error('The Hall Pass / Check-In roster recovery review returned invalid change counts. The pending batch was not changed.');
  return {ok:false,schemaVersion:1,status:'RECOVERY_REVIEW_REQUIRED',requestId:String(result.requestId),writeContract:String(result.writeContract),recoveryToken,reviewCounts,message:clean(result.message||'The earlier roster attempt needs explicit teacher review.',500)};
}
function validateWriteResult(result,expected={}){
  if(!result||result.ok!==true||String(result.requestId||'')!==String(expected.requestId||'')||String(result.writeContract||'')!==String(expected.writeContract||''))throw new Error('The Hall Pass / Check-In roster write returned an unexpected response. Reopen GoClassroom and retry the same approved batch.');
  if(!validRevision(result.revision)||String(result.previousRevision||'')!==String(expected.baseRevision||''))throw new Error('The Hall Pass / Check-In roster write did not verify its before/after revision. Reopen GoClassroom and retry the same approved batch.');
  const rawCounts=result.counts&&typeof result.counts==='object'?result.counts:{};
  const counts={added:Number(rawCounts.added||0),reactivated:Number(rawCounts.reactivated||0),nameRowsUpdated:Number(rawCounts.nameRowsUpdated||0),requestedNameUpdates:Number(rawCounts.requestedNameUpdates||0),createdPins:Number(rawCounts.createdPins||0),createdPinCards:Number(rawCounts.createdPinCards||0),verifiedCredentialMemberships:Number(rawCounts.verifiedCredentialMemberships||0)};
  if(Object.values(counts).some(value=>!Number.isInteger(value)||value<0))throw new Error('The Hall Pass / Check-In roster write returned invalid result counts. Reopen GoClassroom and retry the same approved batch.');
  if(expected.addCount!==undefined&&counts.added+counts.reactivated!==Number(expected.addCount))throw new Error('The Hall Pass / Check-In roster write did not verify every approved addition. Reopen GoClassroom and retry the same approved batch.');
  if(expected.addCount!==undefined&&counts.verifiedCredentialMemberships!==Number(expected.addCount))throw new Error('The Hall Pass / Check-In roster write did not verify usable PIN credentials for every approved addition. Retry the same approved batch.');
  if(expected.updateNameCount!==undefined&&(counts.requestedNameUpdates!==Number(expected.updateNameCount)||counts.nameRowsUpdated!==Number(expected.updateNameCount)))throw new Error('The Hall Pass / Check-In roster write did not verify every approved name update. Reopen GoClassroom and retry the same approved batch.');
  return {ok:true,schemaVersion:1,requestId:String(result.requestId),appliedAt:String(result.appliedAt||''),writeContract:String(result.writeContract),previousRevision:String(result.previousRevision),revision:String(result.revision),counts};
}
module.exports={decodeBridgeArg,validateBridge,teacherUrl,validRevision,validateOperationsPayload,validateWriteRequest,validateWriteResult,validateRecoveryDecision,validateRecoveryReview,estimatePendingRecoveryBytes,ROSTER_RECOVERY_TARGET_BYTES,ROSTER_RECOVERY_CONFIRMATION};
