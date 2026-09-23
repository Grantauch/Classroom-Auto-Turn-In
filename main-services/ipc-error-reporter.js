function createIpcErrorReporter({publicError,appLog}){
  if(typeof publicError!=='function'||typeof appLog!=='function')throw new Error('IPC error reporter requires publicError and appLog.');
  return function userSafeError(operation,err){
    const info=publicError(err,operation);
    const technical=String(operation||'').startsWith('roster:')
      ?'Sensitive roster error detail redacted at IPC boundary.'
      :info.technical;
    appLog(`[${info.code}] ${operation} failed: ${technical}`);
    return info;
  };
}
module.exports={createIpcErrorReporter};
