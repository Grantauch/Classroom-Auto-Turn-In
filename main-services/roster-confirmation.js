const {ROSTER_RECOVERY_CONFIRMATION}=require('../engine/operations-roster-bridge');
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
    const outcome=await integration.applySafeChanges(validated);
    const review=outcome?.recoveryReview;if(!review)return outcome;
    const c=review.reviewCounts||{},reviewTotal=Number(c.additions||0)+Number(c.reactivations||0)+Number(c.nameUpdates||0);
    const reviewedAgain=await dialog.showMessageBox({
      type:'warning',buttons:['Keep pending','Reapply exact approved batch'],defaultId:0,cancelId:0,
      title:'Review uncertain roster write',
      message:'The earlier attempt stopped at an uncertain write boundary.',
      detail:`The server currently shows ${reviewTotal} approved change${reviewTotal===1?'':'s'} still in exactly the pre-write state (${Number(c.additions||0)} addition${Number(c.additions||0)===1?'':'s'}, ${Number(c.reactivations||0)} reactivation${Number(c.reactivations||0)===1?'':'s'}, ${Number(c.nameUpdates||0)} name update${Number(c.nameUpdates||0)===1?'':'s'}). It cannot prove whether those writes never happened or were later changed back. Reapply only if you still want this exact approved batch. No removals will be made.`
    });
    if(reviewedAgain.response!==1)return {...outcome,cancelled:true,recoveryPending:true};
    const retried=await integration.applySafeChanges(validated,{confirmation:ROSTER_RECOVERY_CONFIRMATION,token:review.recoveryToken});
    if(retried?.recoveryReview)throw new Error('The roster recovery state changed while you reviewed it. Nothing uncertain was written. Retry approved batch to review the current state.');
    return retried;
  };
}
module.exports={createRosterApplyHandler};
