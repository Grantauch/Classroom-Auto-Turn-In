function createSecureJsonStore({safeStorage,localData}){
  if(!safeStorage)throw new Error('Secure storage adapter is required.');
  const available=()=>typeof safeStorage.isEncryptionAvailable==='function'&&safeStorage.isEncryptionAvailable();
  function assertAvailable(){if(!available())throw new Error('Windows secure storage is unavailable. Student roster data was not saved to this computer.');}
  function write(name,value){
    assertAvailable();
    const plaintext=JSON.stringify(value);
    const encrypted=safeStorage.encryptString(plaintext).toString('base64');
    localData.writeJson(name,{secureJsonVersion:1,encrypted},{requireBackup:true});
    return value;
  }
  function read(name,fallback){
    const readEnvelope=typeof localData.readJsonStrict==='function'?localData.readJsonStrict:localData.readJson;
    const envelope=readEnvelope(name,null);
    if(!envelope)return fallback;
    if(Number(envelope.secureJsonVersion)!==1||typeof envelope.encrypted!=='string'||!envelope.encrypted)throw new Error(`${name} is not a valid encrypted GoClassroom record.`);
    assertAvailable();
    try{return JSON.parse(safeStorage.decryptString(Buffer.from(envelope.encrypted,'base64')))}catch{throw new Error(`${name} could not be decrypted on this Windows account. Run roster discovery again.`)}
  }
  return {available,read,write};
}
module.exports={createSecureJsonStore};
