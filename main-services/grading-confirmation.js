function createGradingRequestHandler({dialog,getGradingService}){
  if(!dialog||typeof dialog.showMessageBox!=='function'||typeof getGradingService!=='function')throw new Error('The grading confirmation service is not configured safely.');
  return async function processClassroomGrading(value={}){
    const service=getGradingService(),request=value&&typeof value==='object'?{...value}:{};
    if(request.writeDrafts===true){
      const assignment=request.assignment&&typeof request.assignment==='object'?request.assignment:{};
      const title=String(assignment.title||'the selected assignment').replace(/\s+/g,' ').trim().slice(0,180);
      const course=String(assignment.courseDisplayName||request.courseDisplayName||'the selected grading Classroom').replace(/\s+/g,' ').trim().slice(0,180);
      const batchSize=Math.max(1,Math.min(10,Math.floor(Number(request.batchSize)||5)));
      const answer=await dialog.showMessageBox({
        type:'warning',
        buttons:['Cancel','Save verified draft scores'],
        defaultId:0,
        cancelId:0,
        title:'Confirm this draft-grade batch',
        message:`Save SAFE_DRAFT scores for ${title}?`,
        detail:`Grading Classroom: ${course}. GoClassroom will inspect up to ${batchSize} submissions. It will skip TEACHER_REVIEW results and existing grades, verify Classroom's point total before every write, reload each saved value, and never click Return.`
      });
      if(answer.response!==1)return {cancelled:true,writeDraftsRequested:true};
      request.writeAuthorization=service.authorizeWriteBatch(assignment);
    }
    return service.processClassroomAssignment(request);
  };
}

module.exports={createGradingRequestHandler};
