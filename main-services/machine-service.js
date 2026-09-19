const os=require('os');
const crypto=require('crypto');
const fs=require('fs');
const {readJsonWithBackup,atomicWriteJson}=require('../engine/json-store');

const MACHINE_SCHEMA=1;
const ROLES=new Set(['primary','backup','manual']);

function cleanName(value){
  const s=String(value||'').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim().slice(0,60);
  return s||'This PC';
}
function defaultMachine(){
  return {schema:MACHINE_SCHEMA,id:crypto.randomUUID(),displayName:cleanName(os.hostname()),role:'primary',backupDelayMinutes:60,createdAt:new Date().toISOString()};
}
function normalizeMachine(raw,{fallbackId}={}){
  const base=defaultMachine();
  const input=raw&&typeof raw==='object'?raw:{};
  const role=ROLES.has(String(input.role||''))?String(input.role):'primary';
  const delay=Number(input.backupDelayMinutes);
  return {
    schema:MACHINE_SCHEMA,
    id:String(input.id||fallbackId||base.id),
    displayName:cleanName(input.displayName||base.displayName),
    role,
    backupDelayMinutes:Number.isFinite(delay)&&delay>=45&&delay<=240?Math.round(delay):60,
    createdAt:String(input.createdAt||base.createdAt),
    updatedAt:String(input.updatedAt||'')
  };
}
function createMachineService({dataDir,logger=()=>{}}){
  const file=()=>require('path').join(dataDir(),'machine.json');
  function load(){
    const p=file(),bak=`${p}.bak`;
    if(!fs.existsSync(p)&&!fs.existsSync(bak)){
      const fresh=defaultMachine();
      atomicWriteJson(p,fresh,{backup:true});
      return fresh;
    }
    try{
      const raw=readJsonWithBackup(p,{label:'machine.json',logger});
      if(Number(raw?.schema)!==MACHINE_SCHEMA||!ROLES.has(String(raw?.role||''))){
        logger('machine.json contained an unsupported or unsafe computer-role record.');
        return {...normalizeMachine(raw),role:'manual',damaged:true};
      }
      return normalizeMachine(raw);
    }
    catch(err){
      logger(`machine.json could not be read safely: ${String(err?.message||err)}`);
      return {...defaultMachine(),role:'manual',damaged:true};
    }
  }
  function save(patch={}){
    const current=load();
    const next=normalizeMachine({...current,...patch,id:current.id,createdAt:current.createdAt,updatedAt:new Date().toISOString()},{fallbackId:current.id});
    atomicWriteJson(file(),next,{backup:true});
    return next;
  }
  function markImported(){return save({role:'manual'});}
  return {load,save,markImported,file};
}
module.exports={MACHINE_SCHEMA,ROLES,cleanName,defaultMachine,normalizeMachine,createMachineService};
