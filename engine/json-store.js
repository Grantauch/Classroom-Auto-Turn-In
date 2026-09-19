const fs=require('fs');
const path=require('path');

function atomicWriteJson(file,value,{backup=false}={}){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temp=`${file}.${process.pid}.${Date.now()}.tmp`;
  const fd=fs.openSync(temp,'w');
  try{fs.writeFileSync(fd,JSON.stringify(value,null,2),'utf8');fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
  try{fs.renameSync(temp,file)}catch(e){if(fs.existsSync(file))fs.unlinkSync(file);fs.renameSync(temp,file)}
  if(backup){try{fs.copyFileSync(file,`${file}.bak`)}catch{/* best-effort fallback */}}
}

function readJsonWithBackup(file,{fallback,label='Saved data',logger=()=>{},throwOnCorrupt=true,onCorrupt=null}={}){
  const backup=`${file}.bak`;
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
  if(primaryExists){try{fs.renameSync(file,`${file}.corrupt-${Date.now()}`)}catch{/* best-effort fallback */}}
  const err=new Error(`${label} could not be read safely.`);err.code='DATA_CORRUPT';err.retryable=false;
  if(typeof onCorrupt==='function')try{onCorrupt(err)}catch{/* best-effort fallback */}
  if(throwOnCorrupt)throw err;
  return fallback;
}

module.exports={atomicWriteJson,readJsonWithBackup};
