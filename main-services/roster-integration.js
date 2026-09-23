const {createRosterService}=require('./roster-service');
const {createSecureJsonStore}=require('./secure-json-store');

function createRosterIntegration({safeStorage,localData,ensureAutomationIdle,compactError,runNodeScript,runExclusiveBrowser}){
  let service=null;
  const secureData=createSecureJsonStore({safeStorage,localData});
  function getService(){
    if(!service)service=createRosterService({localData,secureData,ensureAutomationIdle,compactError,runNodeScript,runExclusiveBrowser});
    return service;
  }
  return {
    state:()=>getService().publicState(),
    discover:()=>getService().discover(),
    readOperationsRoster:()=>getService().readOperationsRoster(),
    validateSafeChanges:()=>getService().validateSafeChanges(),
    applySafeChanges:(reviewedRequest,recoveryDecision)=>getService().applySafeChanges(reviewedRequest||null,recoveryDecision||null),
    saveMappings:value=>getService().saveMappings(value||{})
  };
}
module.exports={createRosterIntegration};
