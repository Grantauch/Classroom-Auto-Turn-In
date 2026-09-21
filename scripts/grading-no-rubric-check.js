const {createOllamaGrade,buildGradePrompt,derivedRubricText,validateGrade}=require('../engine/grading');

function assert(condition,message){if(!condition)throw new Error(message)}
function response(data,{status=200}={}){return {ok:status>=200&&status<300,status,text:async()=>JSON.stringify(data),json:async()=>data}}

const question='Explain two ways factories changed daily life in American cities.';
const studentWork='Factories created jobs so people moved to cities for work. Cities grew fast and got crowded.';
const modelGrade={
  score:8,max_score:10,
  rubric_breakdown:[
    {criterion:'First change explained',earned:4,possible:5,evidence:'Factories created jobs'},
    {criterion:'Second change explained',earned:4,possible:5,evidence:'Cities grew fast and got crowded'}
  ],
  feedback:'Two clear changes with support.',needs_teacher_review:false,review_reason:null
};

// The derived rubric names the Classroom total and never invents a different one.
const derived=derivedRubricText(10);
assert(derived.includes('exactly 10 points'),'The derived rubric no longer states the Classroom point total');
assert(/must not change/i.test(derived),'The derived rubric no longer pins the Classroom total');

// A teacher rubric still forces criterion labels to be copied from it.
const teacherRubric='Total points: 10. First change explained: 5 points. Second change explained: 5 points.';
const invented=validateGrade({...modelGrade,rubric_breakdown:[{criterion:'Creativity',earned:8,possible:10,evidence:'Factories created jobs'}]},{rubric:teacherRubric,studentWork});
assert(!invented.valid&&invented.errors.some(error=>/not copied from the teacher-provided rubric/i.test(error)),'An invented criterion is no longer rejected when a teacher rubric exists');

// With no teacher rubric there is nothing to copy from, so that one check stands down.
const derivedOk=validateGrade(modelGrade,{rubric:'',studentWork});
assert(derivedOk.valid,`Derived criteria were rejected without a teacher rubric: ${derivedOk.errors.join(' | ')}`);

// Every other guard still applies to a derived-criteria grade.
const badMath=validateGrade({...modelGrade,rubric_breakdown:[{criterion:'First',earned:4,possible:5,evidence:'Factories created jobs'},{criterion:'Second',earned:4,possible:9,evidence:'Cities grew fast'}]},{rubric:'',studentWork});
assert(!badMath.valid,'Rubric point math is no longer checked when the criteria were derived');
const fakeEvidence=validateGrade({...modelGrade,rubric_breakdown:[{criterion:'First',earned:5,possible:5,evidence:'The student cited census data'},{criterion:'Second',earned:5,possible:5,evidence:'Cities grew fast and got crowded'}]},{rubric:'',studentWork});
assert(!fakeEvidence.valid&&fakeEvidence.errors.some(error=>/not an exact excerpt/i.test(error)),'Invented evidence is no longer rejected when the criteria were derived');

(async()=>{
  const oldFetch=global.fetch;
  let sentPrompt='';
  global.fetch=async(url,options={})=>{
    if(url==='http://127.0.0.1:11434/api/chat'){
      sentPrompt=JSON.parse(options.body).messages.map(message=>message.content).join('\n');
      return response({model:'test-model',done:true,message:{role:'assistant',content:JSON.stringify(modelGrade)}});
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };
  try{
    const withoutRubric=await createOllamaGrade({model:'test-model',question,rubric:'',studentWork,maxPoints:10});
    assert(withoutRubric.status==='SAFE_DRAFT',`Grading without a rubric did not produce a safe draft: ${withoutRubric.reason}`);
    assert(withoutRubric.rubricSource==='directions','A grade made without a teacher rubric is not labelled as coming from the directions');
    assert(sentPrompt.includes('exactly 10 points'),'The Classroom point total was not sent as the scale');

    const withRubric=await createOllamaGrade({model:'test-model',question,rubric:teacherRubric,studentWork,maxPoints:10});
    assert(withRubric.rubricSource==='teacher','A grade made from a teacher rubric is mislabelled');
    assert(sentPrompt.includes('First change explained: 5 points'),'The teacher rubric was not sent verbatim');
    assert(!sentPrompt.includes('No teacher rubric was provided'),'The derived rubric replaced a teacher rubric that was supplied');

    let failedClosed=null;
    try{await createOllamaGrade({model:'test-model',question,rubric:'',studentWork,maxPoints:null})}catch(error){failedClosed=error}
    assert(failedClosed,'Grading with no rubric and no Classroom point total must fail closed rather than invent a scale');
  }finally{global.fetch=oldFetch}
  console.log('Rubric-optional grading checks passed: Classroom point total used as the scale, derived criteria allowed only without a teacher rubric, evidence and point math still enforced, and no scale means no grade.');
})().catch(error=>{console.error(error);process.exit(1)});
