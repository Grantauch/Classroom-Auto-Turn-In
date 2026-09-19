const {retryTargetsFrom}=require('./scheduler');
const DEFAULT_CHAIN_MAX_AGE_MS=4*60*60*1000;

function isRetryChainFresh(start,now=new Date(),maxAgeMs=DEFAULT_CHAIN_MAX_AGE_MS){
  const a=new Date(start).getTime(),b=new Date(now).getTime();
  return Number.isFinite(a)&&Number.isFinite(b)&&b>=a&&b-a<=maxAgeMs;
}
function nextRetryPlan({result,currentAttempt=0,chainStartedAt,cfg={},now=new Date()}={}){
  if(!result||String(result.status||'').toUpperCase()!=='FAILED'||result.retryable!==true)return null;
  if(!isRetryChainFresh(chainStartedAt,now))return null;
  const nextAttempt=Number(currentAttempt)+1;
  const target=retryTargetsFrom(chainStartedAt,cfg)[nextAttempt-1];
  if(!target)return null;
  const floor=new Date(now).getTime()+60000;
  const intended=target.at.getTime();
  const runAt=new Date(intended<floor?floor:intended);
  return {attempt:nextAttempt,offsetMinutes:target.offset,runAt};
}
module.exports={DEFAULT_CHAIN_MAX_AGE_MS,isRetryChainFresh,nextRetryPlan};
