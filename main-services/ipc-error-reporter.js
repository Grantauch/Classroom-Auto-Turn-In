// Student emails are the only student detail roster errors can carry; they
// never reach the plaintext log or the copied support summary.
const EMAIL_PATTERN=/[^\s@"'<>()]+@[^\s@"'<>()]+\.[^\s@"'<>()]+/g;
function scrubRosterDetail(text){return String(text||'').replace(EMAIL_PATTERN,'[student email]').replace(/\s+/g,' ').trim().slice(0,300)}
function createIpcErrorReporter({publicError,appLog,keep=5}){
  if(typeof publicError!=='function'||typeof appLog!=='function')throw new Error('IPC error reporter requires publicError and appLog.');
  const recent=[];
  function userSafeError(operation,err){
    const info=publicError(err,operation);
    const roster=String(operation||'').startsWith('roster:');
    const technical=roster
      ?`Sensitive roster error detail redacted at IPC boundary. Reason with student details removed: ${scrubRosterDetail(info.technical)}`
      :info.technical;
    appLog(`[${info.code}] ${operation} failed: ${technical}`);
    // Kept so "Copy support summary" can say exactly what went wrong.
    recent.unshift({at:new Date().toISOString(),code:info.code,operation:String(operation||''),reason:roster?scrubRosterDetail(info.technical):String(info.technical||'').slice(0,300)});
    recent.length=Math.min(recent.length,keep);
    return info;
  }
  userSafeError.recentProblems=()=>recent.map(item=>({...item}));
  return userSafeError;
}
module.exports={createIpcErrorReporter,scrubRosterDetail};
