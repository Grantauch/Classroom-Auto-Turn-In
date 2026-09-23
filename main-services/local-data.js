const fs=require('fs');
const path=require('path');
const {computeSafetyFingerprint,assertUniquePlans,preserveTrustedDriveProvenance,normalizeState}=require('../engine/safety');
const {validateConfig,validatePlanList}=require('../engine/validation');
const {defaultProfileDirForDataRoot,defaultConfig:buildDefaultConfig,migrateConfig}=require('../engine/app-config');
const {atomicWriteJson,readJsonWithBackup}=require('../engine/json-store');

function createLocalData(getUserDataDir){
  const issues=new Map();
  function dataDir(){return path.join(getUserDataDir(),'data')}
  function ensureData(){fs.mkdirSync(dataDir(),{recursive:true})}
  function jsonPath(name){ensureData();return path.join(dataDir(),name)}
  function appLog(msg){
    const line=`[${new Date().toISOString()}] ${String(msg)}`;
    try{console.log(line)}catch{/* best-effort fallback */}
    try{const dir=path.join(dataDir(),'logs');fs.mkdirSync(dir,{recursive:true});fs.appendFileSync(path.join(dir,`${new Date().toISOString().slice(0,10)}.log`),line+'\n')}catch(e){try{console.error(`[CATI diagnostics warning] ${e.message}`)}catch{/* best-effort fallback */}}
  }
  function defaultConfig(){return buildDefaultConfig({profileDir:defaultProfileDirForDataRoot(dataDir())})}
  function readJson(name,fallback){
    const file=jsonPath(name);
    try{
      const value=readJsonWithBackup(file,{fallback,label:name,logger:appLog});issues.delete(name);return value;
    }catch(e){issues.set(name,`${name} and its backup could not be read safely.`);appLog(`${name} could not be read. Safe defaults will be used until setup is repaired.`);return fallback}
  }
  function readJsonStrict(name,fallback){
    const value=readJsonWithBackup(jsonPath(name),{fallback,label:name,logger:appLog,throwOnCorrupt:true});
    issues.delete(name);
    return value;
  }
  function writeJson(name,value){atomicWriteJson(jsonPath(name),value,{backup:true});issues.delete(name);return value}
  function loadConfig(){
    const raw=readJson('config.json',{});
    return validateConfig(migrateConfig(raw,{profileDir:defaultProfileDirForDataRoot(dataDir())}));
  }
  function saveConfig(input){
    let cfg=validateConfig(migrateConfig(input,{profileDir:defaultProfileDirForDataRoot(dataDir())}));
    const previous=loadConfig(),plans=loadPlans();
    if(computeSafetyFingerprint(previous,plans)!==computeSafetyFingerprint(cfg,plans)) cfg={...cfg,dryRun:true,lastDryRunOkAt:null,safetyCertification:null};
    return writeJson('config.json',cfg);
  }
  function normalizePlan(x){return {week:Number(x.week),weekOf:String(x.weekOf||''),title:String(x.title||''),url:String(x.url||''),source:String(x.source||'manual')}}
  function loadPlans(){return readJson('plans.json',[]).map(normalizePlan).filter(x=>x.week&&x.title&&x.url).sort((a,b)=>a.week-b.week)}
  function savePlans(incoming,{trustedDriveSync=false}={}){
    const oldPlans=loadPlans();let plans=[...incoming].map(normalizePlan).filter(x=>x.week&&x.title&&x.url).sort((a,b)=>a.week-b.week);
    if(!trustedDriveSync) plans=preserveTrustedDriveProvenance(plans,oldPlans).map(normalizePlan);
    assertUniquePlans(plans);validatePlanList(plans);
    const cfg=loadConfig(),before=computeSafetyFingerprint(cfg,oldPlans),after=computeSafetyFingerprint(cfg,plans);
    writeJson('plans.json',plans);
    if(before!==after) writeJson('config.json',{...cfg,dryRun:true,lastDryRunOkAt:null,safetyCertification:null});
    return plans;
  }
  function loadState(){
    const primary=jsonPath('state.json'),backup=`${primary}.bak`;
    if(!fs.existsSync(primary)&&!fs.existsSync(backup))return normalizeState({});
    if(fs.existsSync(primary)){try{return normalizeState(JSON.parse(fs.readFileSync(primary,'utf8')))}catch{/* best-effort fallback */}}
    if(fs.existsSync(backup)){
      try{const recovered=normalizeState(JSON.parse(fs.readFileSync(backup,'utf8')));recovered.recoveredFromBackupAt=new Date().toISOString();try{fs.copyFileSync(backup,primary)}catch{/* best-effort fallback */};return recovered}catch{/* best-effort fallback */}
    }
    const state=normalizeState({});state.dataCorrupt=true;state.currentBlockers=[...(state.currentBlockers||[]),{type:'DATA_CORRUPT',message:'Saved submission history could not be read safely. Automatic turn-in is blocked until the local data is repaired.'}];return state;
  }
  return {dataDir,ensureData,jsonPath,readJson,readJsonStrict,writeJson,defaultConfig,loadConfig,saveConfig,normalizePlan,loadPlans,savePlans,loadState,appLog,issues};
}
module.exports={createLocalData};
