const fs=require('fs');
const path=require('path');

function dataCorruptError(label){
  const err=new Error(`${label} could not be read safely.`);err.code='DATA_CORRUPT';err.retryable=false;return err;
}
function backupWriteError(){
  const err=new Error('Required recovery backup could not be written safely.');err.code='BACKUP_WRITE_FAILED';err.retryable=false;return err;
}
function atomicWriteJson(file,value,{backup=false,requireBackup=false}={}){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temp=`${file}.${process.pid}.${Date.now()}.tmp`;
  const fd=fs.openSync(temp,'w');
  try{fs.writeFileSync(fd,JSON.stringify(value,null,2),'utf8');fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
  try{fs.renameSync(temp,file)}catch(e){if(fs.existsSync(file))fs.unlinkSync(file);fs.renameSync(temp,file)}
  if(backup){
    try{fs.copyFileSync(file,`${file}.bak`)}
    catch{if(requireBackup)throw backupWriteError()}
  }
}

function readJsonWithBackup(file,{fallback,label='Saved data',logger=()=>{},throwOnCorrupt=true,onCorrupt=null,persistCorruption=false,requireBackup=false}={}){
  const backup=`${file}.bak`,marker=`${file}.corrupt-marker`;
  function corrupt(){
    if(persistCorruption&&!fs.existsSync(marker))try{fs.writeFileSync(marker,'DATA_CORRUPT\n','utf8')}catch{/* best-effort marker */}
    const err=dataCorruptError(label);
    if(typeof onCorrupt==='function')try{onCorrupt(err)}catch{/* best-effort fallback */}
    if(throwOnCorrupt)throw err;
    return fallback;
  }
  const legacyCorruptExists=persistCorruption&&fs.existsSync(path.dirname(file))&&fs.readdirSync(path.dirname(file)).some(name=>name.startsWith(`${path.basename(file)}.corrupt-`));
  if(persistCorruption&&(fs.existsSync(marker)||legacyCorruptExists))return corrupt();
  const primaryExists=fs.existsSync(file),backupExists=fs.existsSync(backup);
  if(!primaryExists&&!backupExists)return fallback;
  if(primaryExists){
    try{
      const primaryText=fs.readFileSync(file,'utf8'),value=JSON.parse(primaryText);
      if(requireBackup){
        let backupText=null;
        try{backupText=fs.readFileSync(backup,'utf8')}catch{/* repair below */}
        if(backupText!==primaryText){
          try{fs.copyFileSync(file,backup)}catch{throw backupWriteError()}
          try{if(fs.readFileSync(backup,'utf8')!==primaryText)throw backupWriteError()}catch(error){if(error?.code==='BACKUP_WRITE_FAILED')throw error;throw backupWriteError()}
        }
      }
      return value;
    }catch(error){if(error?.code==='BACKUP_WRITE_FAILED')throw error}
  }
  if(backupExists){
    try{
      const recovered=JSON.parse(fs.readFileSync(backup,'utf8'));
      try{fs.copyFileSync(backup,file)}catch{/* best-effort fallback */}
      logger(`${label} recovered from the last known-good backup.`);
      return recovered;
    }catch{/* best-effort fallback */}
  }
  return corrupt();
}

module.exports={atomicWriteJson,readJsonWithBackup};
