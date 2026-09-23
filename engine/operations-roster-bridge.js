const {normalizeOperationsRoster}=require('./classroom-roster');

function clean(value,max=500){return String(value??'').replace(/\s+/g,' ').trim().slice(0,max)}
function decodeBridgeArg(value){
  try{return JSON.parse(Buffer.from(String(value||''),'base64url').toString('utf8'))}
  catch{throw new Error('The GoClassroom roster bridge settings are invalid. Nothing was synchronized.')}
}
function validateBridge(value={}){
  const url=String(value.url||'').trim(),contract=String(value.contract||'').trim(),writeContract=String(value.writeContract||'').trim();
  let parsed=null;try{parsed=new URL(url)}catch{parsed=null}
  if(!parsed||parsed.protocol!=='https:'||parsed.hostname!=='script.google.com'||!/\/macros\//i.test(parsed.pathname))throw new Error('The Hall Pass / Check-In roster bridge URL is not valid. Nothing was synchronized.');
  if(!/^[A-Za-z0-9._:-]{8,120}$/.test(contract))throw new Error('The Hall Pass / Check-In roster bridge contract is not valid. Nothing was synchronized.');
  if(writeContract&&!/^[A-Za-z0-9._:-]{8,120}$/.test(writeContract))throw new Error('The Hall Pass / Check-In roster write contract is not valid. Nothing was synchronized.');
  return {url:parsed.toString(),contract,writeContract};
}
function teacherUrl(base){const u=new URL(base);u.searchParams.set('mode','teacher');return u.toString()}
function validRevision(value){return /^[A-Za-z0-9_-]{20,80}$/.test(String(value||''))}
function validateOperationsPayload(result,contract){
  if(!result||result.ok!==true||String(result.bridgeContract||'')!==String(contract||'')||!Array.isArray(result.roster))throw new Error('The Hall Pass / Check-In roster bridge returned an unexpected response. Nothing was synchronized.');
  const roster=normalizeOperationsRoster(result.roster);
  if(roster.length!==result.roster.length)throw new Error('The Hall Pass / Check-In roster contained an invalid membership row. Nothing was synchronized.');
  const revision=String(result.revision||''),writeContract=String(result.writeContract||'');
  if(!validRevision(revision)||!/^[A-Za-z0-9._:-]{8,120}$/.test(writeContract))throw new Error('The Hall Pass / Check-In roster bridge did not provide a safe write revision. Nothing was synchronized.');
  return {schemaVersion:1,bridgeContract:String(contract||''),writeContract,revision,serverNow:String(result.serverNow||''),roster};
}
function normalizeAddRows(rows=[]){
  return (Array.isArray(rows)?rows:[]).map(row=>({studentEmail:clean(row?.studentEmail,320).toLowerCase(),studentName:clean(row?.studentName,120),classPeriod:clean(row?.classPeriod,120)}));
}
function normalizeNameRows(rows=[]){
  return (Array.isArray(rows)?rows:[]).map(row=>({studentEmail:clean(row?.studentEmail,320).toLowerCase(),studentName:clean(row?.studentName,120),beforeName:clean(row?.beforeName,120),classPeriod:clean(row?.classPeriod,120)}));
}
function validateWriteRequest(request={}){
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
  return {confirmation:'APPLY SAFE ROSTER CHANGES',requestId,baseRevision,add,updateName};
}
function validateWriteResult(result,expected={}){
  if(!result||result.ok!==true||String(result.requestId||'')!==String(expected.requestId||'')||String(result.writeContract||'')!==String(expected.writeContract||''))throw new Error('The Hall Pass / Check-In roster write returned an unexpected response. Reopen GoClassroom and retry the same approved batch.');
  if(!validRevision(result.revision)||String(result.previousRevision||'')!==String(expected.baseRevision||''))throw new Error('The Hall Pass / Check-In roster write did not verify its before/after revision. Reopen GoClassroom and retry the same approved batch.');
  const counts=result.counts&&typeof result.counts==='object'?result.counts:{};
  return {ok:true,schemaVersion:1,requestId:String(result.requestId),appliedAt:String(result.appliedAt||''),writeContract:String(result.writeContract),previousRevision:String(result.previousRevision),revision:String(result.revision),counts:{added:Number(counts.added||0),reactivated:Number(counts.reactivated||0),nameRowsUpdated:Number(counts.nameRowsUpdated||0),requestedNameUpdates:Number(counts.requestedNameUpdates||0),createdPins:Number(counts.createdPins||0),createdPinCards:Number(counts.createdPinCards||0)}};
}
module.exports={decodeBridgeArg,validateBridge,teacherUrl,validRevision,validateOperationsPayload,validateWriteRequest,validateWriteResult};
