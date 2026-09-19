const fs=require('fs');
const path=require('path');
const {loadConfig}=require('./lib');
const {detectInstalledBrowser}=require('./browser');

const {emit,emitError}=require('./protocol');
(async()=>{
  const cfg=loadConfig();
  const browser=detectInstalledBrowser();
  let profileWritable=false, profileError='';
  try{
    fs.mkdirSync(cfg.profileDir,{recursive:true});
    const probe=path.join(cfg.profileDir,'.cati-write-test');
    fs.writeFileSync(probe,'ok'); fs.unlinkSync(probe); profileWritable=true;
  }catch(e){profileError=String(e.message||e)}
  const result={
    platform:process.platform,
    supported:process.platform==='win32',
    browser,
    profileWritable,
    profileDir:cfg.profileDir,
    profileError,
    ready:process.platform==='win32'&&!!browser.detected&&profileWritable
  };
  emit('preflight',result);
})().catch(e=>{emitError(e);process.exit(1)});
