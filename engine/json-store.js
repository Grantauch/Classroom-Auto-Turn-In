const fs=require('fs');
const path=require('path');

function corruptionMarker(file){return `${file}.corrupt-blocked`;}
function dataCorruptError(label){const err=new Error(`${label} could not be read safely.`);err.code='DATA_CORRUPT';err.retryable=false;return err;}

function atomicWriteJson(file,value,{backup=false,requireBackup=false}={}){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temp=`${file}.${process.pid}.${Date.now()}.tmp`;
  const fd=fs.openSync(temp,'w');
  try{fs.writeFileSync(fd,JSON.stringify(value,null,2),'utf8');fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
  try{fs.renameSync(temp,file)}catch(e){if(fs.existsSync(file))fs.unlinkSync(file);fs.renameSync(temp,file)}
  let backupOk=!backup;
  if(backup){
    try{fs.copyFileSync(file,`${file}.bak`);backupOk=true}
    catch(error){if(requireBackup){error.code=error.code||'DATA_BACKUP_FAILED';throw error}}
  }
  if(backupOk){try{fs.unlinkSync(corruptionMarker(file))}catch(error){if(error&&error.code!=='ENOENT')throw error}}
}

function readJsonWithBackup(file,{fallback,label='Saved data',logger=()=>{},throwOnCorrupt=true,onCorrupt=null}={}){
  const backup=`${file}.bak`,marker=corruptionMarker(file);
  if(fs.existsSync(marker)){
    const err=dataCorruptError(label);
    if(typeof onCorrupt==='function')try{onCorrupt(err)}catch{/* best-effort fallback */}
    if(throwOnCorrupt)throw err;
    return fallback;
  }
  const primaryExists=fs.existsSync(file),backupExists=fs.existsSync(backup);
  if(!primaryExists&&!backupExists)return fallback;
  if(primaryExists){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{/* best-effort fallback */}}
  if(backupExists){
    try{
      const recovered=JSON.parse(fs.readFileSync(backup,'utf8'));
      try{fs.copyFileSync(backup,file)}catch{/* best-effort fallback */}
      logger(`${label} recovered from the last known-good backup.`);
      return recovered;
    }catch{/* best-effort fallback */}
  }
  const err=dataCorruptError(label);
  let markerWritten=false;
  try{fs.writeFileSync(marker,JSON.stringify({blockedAt:new Date().toISOString(),reason:'unreadable-json'}),'utf8');markerWritten=true}catch{/* keep the corrupt primary in place so later reads still fail closed */}
  if(primaryExists&&markerWritten){try{fs.renameSync(file,`${file}.corrupt-${Date.now()}`)}catch{/* best-effort fallback */}}
  if(typeof onCorrupt==='function')try{onCorrupt(err)}catch{/* best-effort fallback */}
  if(throwOnCorrupt)throw err;
  return fallback;
}

module.exports={atomicWriteJson,readJsonWithBackup};
