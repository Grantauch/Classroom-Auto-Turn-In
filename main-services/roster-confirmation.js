function createRosterApplyHandler({dialog,getRosterIntegration}){
  return async function applyApprovedRosterChanges(){
    const integration=getRosterIntegration(),validated=integration.validateSafeChanges(),state=integration.state(),pending=state?.pendingWrite||{};
    const add=Number(validated.add?.length||0);
    const updateName=Number(validated.updateName?.length||0);
    if(add+updateName<1)throw new Error('There are no safe roster additions or name updates to apply. Compare rosters again.');
    const retry=pending.status==='PENDING';
    const answer=await dialog.showMessageBox({
      type:'warning',buttons:['Cancel',retry?'Retry same approved batch':'Apply safe roster changes'],defaultId:0,cancelId:0,
      title:retry?'Recover approved roster sync?':'Apply safe roster changes?',
      message:retry?'GoClassroom will retry the exact same approved roster request.':`GoClassroom will apply ${add} addition${add===1?'':'s'} and ${updateName} name update${updateName===1?'':'s'}.`,
      detail:'No student will be removed automatically. New or reactivated memberships may receive missing PIN material, but GoClassroom will not email PINs. Hall Pass and Check-In history is preserved. The server will reject the batch if the live roster changed after comparison.'
    });
    if(answer.response!==1)return {cancelled:true,state};
    return integration.applySafeChanges();
  };
}
module.exports={createRosterApplyHandler};
