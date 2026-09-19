const assert=require('assert');
const {getSubmissionAction}=require('../engine/classroom-actions');

function actionLocator(visible){
  return {
    count:async()=>visible?1:0,
    nth:()=>({isVisible:async()=>!!visible}),
    filter(){return this;}
  };
}
function scopeWith(label){
  return {
    getByRole(role,{name}={}){
      assert.equal(role,'button');
      return actionLocator(name instanceof RegExp && name.test(label));
    },
    locator(){return actionLocator(false);}
  };
}
async function pageWithScope(label){
  const scope=scopeWith(label);
  return {
    evaluate:async()=>true,
    locator(selector){
      assert.equal(selector,'[data-cati-your-work="1"]');
      return {first:()=>scope};
    },
    getByRole(){throw new Error('page-wide button lookup must never be used for final submission');},
    getByText(){throw new Error('page-wide text lookup must never be used for final submission');}
  };
}
(async()=>{
  const turn=await getSubmissionAction(await pageWithScope('Turn in'));
  assert(turn&&turn.label==='Turn in','Scoped Turn in button was not found');
  const done=await getSubmissionAction(await pageWithScope('Mark as done'));
  assert(done&&done.label==='Mark as done','Scoped Mark as done button was not found');
  const noScope={evaluate:async()=>false,getByRole(){throw new Error('page-wide lookup used')},getByText(){throw new Error('page-wide lookup used')}};
  assert.equal(await getSubmissionAction(noScope),null,'Final submission must fail closed when Your work scope cannot be verified');
  console.log('Submission action scope regression check passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
