const TRANSIENT_CODES=new Set([
  'CHILD_TIMEOUT','ETIMEDOUT','ECONNRESET','ECONNREFUSED','EAI_AGAIN',
  'ENETUNREACH','ENETDOWN','EHOSTUNREACH','EPIPE','ECONNABORTED'
]);

function isTransientFailure(err){
  const code=String(err?.code||'').toUpperCase();
  if(TRANSIENT_CODES.has(code))return true;
  const msg=String(err?.message||err||'');
  // Chromium/network errors are retryable, but generic Node ERR_* programming
  // errors are not. This prevents deterministic code defects from entering a
  // retry chain.
  if(/\bnet::ERR_[A-Z0-9_]+\b/i.test(msg))return true;
  if(/\b(?:ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENETUNREACH|ENETDOWN|EHOSTUNREACH|EPIPE|ECONNABORTED)\b/i.test(msg))return true;
  if(/\b(?:navigation|network|internet|connection)\b[^\n]{0,80}\b(?:timeout|timed out|failed|lost|closed|reset|unavailable)\b/i.test(msg))return true;
  if(/\b(?:timeout|timed out)\b/i.test(msg)&&!/\b(?:invalid|argument|type|reference|syntax|programming|undefined)\b/i.test(msg))return true;
  return false;
}
module.exports={TRANSIENT_CODES,isTransientFailure};
