const PREFIX='CATI_EVENT:';
const VERSION=1;
function encode(type,payload){return `${PREFIX}${JSON.stringify({v:VERSION,type:String(type),payload})}`}
function emit(type,payload,stream=process.stdout){stream.write(`${encode(type,payload)}\n`)}
function emitError(err,stream=process.stderr){emit('error',{message:String(err?.message||err||'Unknown error'),code:String(err?.code||'')||null,retryable:err?.retryable===true},stream)}
function parseLine(line){
  const s=String(line||'').trim();if(!s.startsWith(PREFIX))return null;
  try{const e=JSON.parse(s.slice(PREFIX.length));if(e?.v!==VERSION||!e?.type)return null;return e}catch{return null}
}
function events(output,type=''){return String(output||'').split(/\r?\n/).map(parseLine).filter(Boolean).filter(e=>!type||e.type===type)}
function lastPayload(output,type){const a=events(output,type);return a.length?a[a.length-1].payload:null}
function lastError(output){return lastPayload(output,'error')}
module.exports={PREFIX,VERSION,encode,emit,emitError,parseLine,events,lastPayload,lastError};
