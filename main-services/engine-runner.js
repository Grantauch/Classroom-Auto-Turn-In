const path=require('path');
const {spawn}=require('child_process');
const {lastPayload,lastError,parseLine}=require('../engine/protocol');

function createEngineRunner({engineDir,execPath,envProvider,onLog=()=>{},onProtocolEvent=()=>{},platform=process.platform}){
  const timeoutTable={
    'submit-weekly.js':13*60*1000,
    'scan-drive-folder.js':4*60*1000,
    'upload-draft-plan.js':4*60*1000,
    'discover-topics.js':3*60*1000,
    'preflight.js':60*1000,
    'select-course.js':10*60*1000,
    'select-drive-folder.js':10*60*1000,
    'discover-classroom-rosters.js':12*60*1000,
    'read-operations-roster.js':4*60*1000
  };
  const childTimeoutFor=file=>timeoutTable[file]||3*60*1000;
  function terminateChildTree(child){
    if(!child?.pid)return;
    try{if(platform==='win32')spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill('SIGKILL')}catch{try{child.kill()}catch{/* best-effort fallback */}}
  }
  function run(file,args=[],{broadcast=true,timeoutMs=childTimeoutFor(file)}={}){
    return new Promise((resolve,reject)=>{
      const child=spawn(execPath,[path.join(engineDir,file),...args],{env:envProvider(),windowsHide:true});
      let output='',settled=false;
      const finish=(err,value)=>{if(settled)return;settled=true;clearTimeout(timer);err?reject(err):resolve(value)};
      const timer=setTimeout(()=>{terminateChildTree(child);const err=new Error(`${file} took too long to finish and was stopped safely.`);err.code='CHILD_TIMEOUT';err.output=output;finish(err)},Math.max(5000,Number(timeoutMs)||childTimeoutFor(file)));
      const handle=buf=>{
        const text=buf.toString();output=(output+text).slice(-5_000_000);
        for(const line of text.split(/\r?\n/).filter(Boolean)){
          const event=parseLine(line);
          if(event)onProtocolEvent(event,{file,broadcast});
          else if(broadcast)onLog(line,{file});
        }
      };
      child.stdout.on('data',handle);child.stderr.on('data',handle);
      child.on('error',err=>finish(err));
      child.on('exit',code=>{
        if(settled)return;
        if(code===0)return finish(null,output);
        const runResult=lastPayload(output,'run-result'),protocolError=lastError(output);
        const err=new Error(runResult?.message||protocolError?.message||`${file} stopped before it finished`);
        err.code=protocolError?.code||'';err.retryable=protocolError?.retryable===true;err.output=output;err.exitCode=code;err.runResult=runResult;finish(err);
      });
    });
  }
  return {run,childTimeoutFor,terminateChildTree,payload:(output,type)=>lastPayload(output,type)};
}
module.exports={createEngineRunner};
