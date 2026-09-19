const {createGradingRequestHandler}=require('../main-services/grading-confirmation');

function assert(condition,message){if(!condition)throw new Error(message)}

(async()=>{
  const assignment={courseId:'course_1',assignmentId:'assignment_1',title:'Industrialization'};
  let response=0,dialogCalls=0,authorizationCalls=0,processCalls=0,lastRequest=null;
  const service={
    authorizeWriteBatch(value){authorizationCalls++;assert(value===assignment,'Confirmation authorized a different assignment object');return 'one-time-token'},
    async processClassroomAssignment(value){processCalls++;lastRequest=value;return {ok:true}}
  };
  const handler=createGradingRequestHandler({dialog:{async showMessageBox(options){dialogCalls++;assert(options.defaultId===0&&options.cancelId===0,'Draft-write confirmation must default to Cancel');assert(/never click Return/.test(options.detail),'Draft-write confirmation lost the no-Return boundary');return {response}}},getGradingService:()=>service});

  const cancelled=await handler({assignment,writeDrafts:true,batchSize:5});
  assert(cancelled.cancelled===true&&dialogCalls===1&&authorizationCalls===0&&processCalls===0,'Cancel did not stop the write-enabled batch before authorization');

  response=1;
  const confirmed=await handler({assignment,writeDrafts:true,batchSize:5});
  assert(confirmed.ok===true&&dialogCalls===2&&authorizationCalls===1&&processCalls===1,'Confirmed write batch did not receive one authorization and one service call');
  assert(lastRequest.writeAuthorization==='one-time-token','Confirmed write batch did not carry the one-time authorization token');

  await handler({assignment,writeDrafts:false,batchSize:5});
  assert(dialogCalls===2&&authorizationCalls===1&&processCalls===2,'Preview-only grading unexpectedly requested write confirmation');
  console.log('Classroom grading confirmation checks passed: native main-process confirmation, Cancel-default behavior, one-time authorization, and preview bypass.');
})().catch(error=>{console.error(error);process.exit(1)});
