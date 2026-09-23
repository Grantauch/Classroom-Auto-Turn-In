const assert=require('assert');
const fs=require('fs'),os=require('os'),path=require('path');
const {createLocalData}=require('../main-services/local-data');
const {createSecureJsonStore}=require('../main-services/secure-json-store');
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
}finally{fs.rmSync(temp,{recursive:true,force:true})}
assert.throws(()=>createSecureJsonStore({safeStorage:{isEncryptionAvailable:()=>false},localData}).write('x.json',pii),/secure storage is unavailable/i);
const classified=publicError(new Error('Windows secure storage is unavailable. Student roster data was not saved to this computer.'),'roster:discover');
assert.equal(classified.code,'AT-ROS-104');
console.log('Encrypted roster-cache checks passed: student roster PII is not persisted as plaintext and secure-storage failures are classified correctly.');
