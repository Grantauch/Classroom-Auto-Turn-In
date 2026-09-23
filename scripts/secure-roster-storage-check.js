const assert=require('assert');
const fs=require('fs'),os=require('os'),path=require('path');
const {createLocalData}=require('../main-services/local-data');
const {createSecureJsonStore}=require('../main-services/secure-json-store');
const {createRosterService}=require('../main-services/roster-service');
const {publicError}=require('../engine/user-errors');
const memory=new Map();
const localData={
  writeJson:(name,value)=>{memory.set(name,JSON.parse(JSON.stringify(value)));return value},
  readJson:(name,fallback)=>memory.has(name)?JSON.parse(JSON.stringify(memory.get(name))):fallback
};
const safeStorage={
  isEncryptionAvailable:()=>true,
  encryptString:text=>Buffer.from(`enc:${Buffer.from(text).toString('base64')}`),
  decryptString:buf=>Buffer.from(String(buf).replace(/^enc:/,''),'base64').toString('utf8')
};
const store=createSecureJsonStore({safeStorage,localData});
const pii={studentName:'Ada Student',studentEmail:'ada@school.org',classes:['Period 3']};
store.write('roster-sync.secure.json',pii);
const disk=JSON.stringify(memory.get('roster-sync.secure.json'));
assert(!disk.includes('Ada Student')&&!disk.includes('ada@school.org'),'Encrypted roster envelope leaked student PII in plaintext.');
assert.deepEqual(store.read('roster-sync.secure.json',{}),pii);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'goclassroom-secure-'));
try{
  const realLocal=createLocalData(()=>temp),critical=createSecureJsonStore({safeStorage,localData:realLocal});
  critical.write('roster-write-pending.secure.json',{status:'PENDING',request:{requestId:'gcr-critical'}});
  fs.writeFileSync(realLocal.jsonPath('roster-write-pending.secure.json'),'{corrupt','utf8');
  fs.writeFileSync(realLocal.jsonPath('roster-write-pending.secure.json')+'.bak','{corrupt','utf8');
  assert.throws(()=>critical.read('roster-write-pending.secure.json',null),/could not be read safely/i,'Corrupt primary and backup pending envelopes must never become an empty pending state.');
  assert.ok(fs.existsSync(realLocal.jsonPath('roster-write-pending.secure.json')+'.corrupt-marker'),'Unrecoverable pending corruption must create a persistent marker.');
  assert.throws(()=>critical.read('roster-write-pending.secure.json',null),/could not be read safely/i,'Repeated pending reads must remain fail-closed.');
  const restartedLocal=createLocalData(()=>temp),restarted=createSecureJsonStore({safeStorage,localData:restartedLocal});
  assert.throws(()=>restarted.read('roster-write-pending.secure.json',null),/could not be read safely/i,'Pending corruption must remain blocked across restart.');
}finally{fs.rmSync(temp,{recursive:true,force:true})}

const backupFailureTemp=fs.mkdtempSync(path.join(os.tmpdir(),'goclassroom-pending-backup-'));
try{
  const realLocal=createLocalData(()=>backupFailureTemp),critical=createSecureJsonStore({safeStorage,localData:realLocal});
  const primary=realLocal.jsonPath('roster-write-pending.secure.json'),backup=primary+'.bak';
  const originalCopyFileSync=fs.copyFileSync;
  try{
    fs.copyFileSync=(source,destination)=>{
      if(String(destination)===backup)throw new Error('simulated pending backup creation failure');
      return originalCopyFileSync(source,destination);
    };
    assert.throws(
      ()=>critical.write('roster-write-pending.secure.json',{status:'PENDING',request:{requestId:'gcr-issue4'}}),
      /backup/i,
      'Exact Issue 4 reproducer: a pending save must fail if its recovery backup cannot be created.'
    );
  }finally{fs.copyFileSync=originalCopyFileSync}
  assert.ok(fs.existsSync(primary),'Issue 4 reproducer requires the committed primary to remain after backup failure.');
  assert.equal(fs.existsSync(backup),false,'Issue 4 reproducer requires the backup creation to have failed.');

  const repaired=critical.read('roster-write-pending.secure.json',null);
  assert.equal(repaired.request.requestId,'gcr-issue4','A valid primary must be recoverable only after the missing backup is repaired.');
  assert.ok(fs.existsSync(backup),'Reading a valid critical pending primary must repair its missing backup before returning it.');

  fs.rmSync(backup,{force:true});
  fs.writeFileSync(primary,'{truncated','utf8');
  assert.throws(()=>critical.read('roster-write-pending.secure.json',null),/could not be read safely/i,'The first read of the only corrupt pending record must fail closed.');
  assert.ok(fs.existsSync(primary+'.corrupt-marker'),'The exact Issue 4 corruption path must persist a marker.');
  fs.rmSync(primary,{force:true});

  const restartedLocal=createLocalData(()=>backupFailureTemp),restarted=createSecureJsonStore({safeStorage,localData:restartedLocal});
  assert.throws(()=>restarted.read('roster-write-pending.secure.json',null),/could not be read safely/i,'The next read must remain blocked instead of silently becoming NONE.');
  const service=createRosterService({localData:restartedLocal,secureData:restarted,ensureAutomationIdle:()=>{},compactError:error=>String(error?.message||error)});
  assert.throws(()=>service.publicState(),/could not be read safely/i,'Roster service must not collapse a marked corrupt pending record to status NONE.');
}finally{fs.rmSync(backupFailureTemp,{recursive:true,force:true})}

const recoveryTemp=fs.mkdtempSync(path.join(os.tmpdir(),'goclassroom-pending-recovery-'));
try{
  const realLocal=createLocalData(()=>recoveryTemp),critical=createSecureJsonStore({safeStorage,localData:realLocal});
  const primary=realLocal.jsonPath('roster-write-pending.secure.json');
  critical.write('roster-write-pending.secure.json',{status:'PENDING',request:{requestId:'gcr-backup-good'}});
  fs.writeFileSync(primary,'{truncated','utf8');
  const recovered=critical.read('roster-write-pending.secure.json',null);
  assert.equal(recovered.request.requestId,'gcr-backup-good','A valid backup must still recover the exact pending request.');
  assert.equal(fs.existsSync(primary+'.corrupt-marker'),false,'Recoverable primary damage must not create a permanent corruption marker.');

  fs.rmSync(primary,{force:true});fs.rmSync(primary+'.bak',{force:true});
  assert.equal(critical.read('roster-write-pending.secure.json',null),null,'A truly absent pending record must still mean no pending write.');
}finally{fs.rmSync(recoveryTemp,{recursive:true,force:true})}

const legacyTemp=fs.mkdtempSync(path.join(os.tmpdir(),'goclassroom-pending-legacy-corrupt-'));
try{
  const realLocal=createLocalData(()=>legacyTemp),critical=createSecureJsonStore({safeStorage,localData:realLocal});
  const primary=realLocal.jsonPath('roster-write-pending.secure.json');
  fs.writeFileSync(primary+'.corrupt-1790188753901','{truncated','utf8');
  assert.throws(()=>critical.read('roster-write-pending.secure.json',null),/could not be read safely/i,'A legacy quarantined pending primary from the old Issue 4 path must remain fail-closed after upgrade.');
  assert.ok(fs.existsSync(primary+'.corrupt-marker'),'Legacy pending corruption must be converted into the persistent corruption marker.');
}finally{fs.rmSync(legacyTemp,{recursive:true,force:true})}
assert.throws(()=>createSecureJsonStore({safeStorage:{isEncryptionAvailable:()=>false},localData}).write('x.json',pii),/secure storage is unavailable/i);
const classified=publicError(new Error('Windows secure storage is unavailable. Student roster data was not saved to this computer.'),'roster:discover');
assert.equal(classified.code,'AT-ROS-104');
console.log('Encrypted roster-cache checks passed: student roster PII is not persisted as plaintext and secure-storage failures are classified correctly.');
