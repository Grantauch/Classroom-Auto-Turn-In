const {createPlanDocx}=require('./docx-writer');

const DEFAULT_PROVIDER='groq';
const DEFAULT_MODELS={
  groq:'openai/gpt-oss-20b',
  gemini:'gemini-3.5-flash',
  openrouter:'openrouter/free',
  openai:'gpt-5.6-terra'
};
const DEFAULT_MODEL=DEFAULT_MODELS.openai; // backward-compatible export
const AI_PROVIDERS={
  groq:{id:'groq',label:'Groq Free',free:true,privacy:'Groq says ordinary inference prompts are not retained by default.'},
  gemini:{id:'gemini',label:'Google Gemini Free',free:true,privacy:'Google says free-tier content may be used to improve its products.'},
  openrouter:{id:'openrouter',label:'OpenRouter Free',free:true,privacy:'OpenRouter routes requests to a changing free model provider; privacy depends on the available route.'},
  openai:{id:'openai',label:'OpenAI API',free:false,privacy:'OpenAI API billing is separate from ChatGPT.'}
};
const SYSTEM_INSTRUCTIONS=[
  'You draft weekly lesson plans for a classroom teacher. This is a DRAFT that the teacher must review before submission.',
  'Use only the supplied teacher context and assignment information. Do not invent specific events, standards, readings, tests, dates, or activities that are not supported by that context.',
  'When information is missing, make the safest useful draft you can and add a short, concrete item to teacherReview explaining what the teacher should verify or replace.',
  'Never include student names, disability or IEP details, medical information, grades, behavior records, or other student-specific personal information.',
  'Use clear professional school language, concise enough to be practical. Return only the requested structured lesson-plan data.'
].join(' ');
const LESSON_PLAN_SCHEMA={
  type:'object',additionalProperties:false,
  properties:{
    title:{type:'string'},
    weekNumber:{type:'integer'},
    weekLabel:{type:'string'},
    overview:{type:'string'},
    courses:{type:'array',items:{type:'object',additionalProperties:false,properties:{
      course:{type:'string'},objective:{type:'string'},standards:{type:'string'},
      days:{type:'array',items:{type:'object',additionalProperties:false,properties:{day:{type:'string'},topic:{type:'string'},activities:{type:'string'},assessment:{type:'string'},materials:{type:'string'}},required:['day','topic','activities','assessment','materials']}}
    },required:['course','objective','standards','days']}},
    teacherReview:{type:'array',items:{type:'string'}},
    notes:{type:'string'}
  },
  required:['title','weekNumber','weekLabel','overview','courses','teacherReview','notes']
};
function clean(s,n=12000){return String(s??'').replace(/\u0000/g,'').trim().slice(0,n)}
function normalizeProvider(value){const id=String(value||'').trim().toLowerCase();return AI_PROVIDERS[id]?id:DEFAULT_PROVIDER}
function providerLabel(provider){return AI_PROVIDERS[normalizeProvider(provider)].label}
function modelForProvider(provider,model=''){const id=normalizeProvider(provider),value=String(model||'').trim().slice(0,160);return value||DEFAULT_MODELS[id]}
function buildDraftPrompt({week,assignmentTitle,dueText,cardText,planningContext,weekNotes}){
  return [
    `Create a weekly lesson-plan draft for Week ${Number(week)}.`,
    `Classroom assignment: ${clean(assignmentTitle,500)||`Week ${week} - Lesson Plans`}`,
    dueText?`Classroom due information: ${clean(dueText,500)}`:'',
    cardText?`Other assignment-card text: ${clean(cardText,1200)}`:'',
    '',
    'Teacher-provided standing planning context:',
    clean(planningContext)||'(No standing planning context was provided.)',
    '',
    'Teacher notes for this specific week:',
    clean(weekNotes,6000)||'(No week-specific notes were provided.)'
  ].filter(x=>x!==undefined).join('\n');
}
function extractOutputText(data){
  if(typeof data?.output_text==='string')return data.output_text;
  const bits=[];
  for(const item of data?.output||[]){
    for(const c of item?.content||[]){if(typeof c?.text==='string'&&(c.type==='output_text'||c.type==='text'))bits.push(c.text);}
  }
  return bits.join('\n').trim();
}
function validateDraftPlan(plan,week){
  if(!plan||typeof plan!=='object')throw new Error('AI returned an invalid lesson-plan draft.');
  const n=Number(plan.weekNumber);if(!Number.isInteger(n)||n!==Number(week))throw new Error(`AI draft week mismatch. Expected Week ${week}, got ${plan.weekNumber}.`);
  if(!Array.isArray(plan.courses)||!plan.courses.length)throw new Error('AI draft did not contain any course plans.');
  plan.title=clean(plan.title,240)||`Week ${String(week).padStart(2,'0')} - Lesson Plans`;
  plan.weekLabel=clean(plan.weekLabel,240);
  plan.overview=clean(plan.overview,5000);
  plan.notes=clean(plan.notes,5000);
  plan.teacherReview=(Array.isArray(plan.teacherReview)?plan.teacherReview:[]).map(x=>clean(x,600)).filter(Boolean).slice(0,20);
  plan.courses=plan.courses.slice(0,12).map(c=>({
    course:clean(c.course,240)||'Course',objective:clean(c.objective,2000),standards:clean(c.standards,1500),
    days:(Array.isArray(c.days)?c.days:[]).slice(0,10).map(d=>({day:clean(d.day,80),topic:clean(d.topic,800),activities:clean(d.activities,2500),assessment:clean(d.assessment,1500),materials:clean(d.materials,1200)}))
  }));
  return plan;
}
function providerError(provider,message,{retryable=false,status=0}={}){const e=new Error(message);e.aiProvider=normalizeProvider(provider);e.aiProviderRetryable=!!retryable;e.httpStatus=Number(status)||0;return e}
function parseProviderPlan(provider,text,week){
  const label=providerLabel(provider),cleaned=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  if(!cleaned)throw providerError(provider,`${label} returned no lesson-plan text.`);
  let parsed;try{parsed=JSON.parse(cleaned)}catch{throw providerError(provider,`${label} returned a lesson-plan draft that could not be read safely.`)}
  return validateDraftPlan(parsed,week);
}
async function requestJson({provider,url,headers,body,timeoutMs}){
  const label=providerLabel(provider),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  let response;
  try{response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),signal:controller.signal});}
  catch(e){
    if(e?.name==='AbortError')throw providerError(provider,`${label} drafting timed out. Nothing was uploaded or submitted.`,{retryable:true});
    throw providerError(provider,`AI drafting could not reach ${label}: ${e.message}`,{retryable:true});
  }finally{clearTimeout(timer)}
  const raw=await response.text();let data={};try{data=JSON.parse(raw)}catch{/* provider may return plain text on an outage */}
  if(!response.ok){
    const msg=data?.error?.message||data?.message||raw.slice(0,500)||`HTTP ${response.status}`;
    const retryable=response.status===408||response.status===409||response.status===429||response.status>=500;
    throw providerError(provider,`${label} draft request failed: ${msg}`,{retryable,status:response.status});
  }
  return {data,raw};
}
async function createOpenAiDraft({apiKey,model=DEFAULT_MODELS.openai,week,assignmentTitle='',dueText='',cardText='',planningContext='',weekNotes='',timeoutMs=90000}){
  if(!apiKey||String(apiKey).length<16)throw providerError('openai','OpenAI API key is not configured.');
  const prompt=buildDraftPrompt({week,assignmentTitle,dueText,cardText,planningContext,weekNotes}),selected=modelForProvider('openai',model);
  const body={model:selected,store:false,input:[{role:'developer',content:[{type:'input_text',text:SYSTEM_INSTRUCTIONS}]},{role:'user',content:[{type:'input_text',text:prompt}]}],text:{format:{type:'json_schema',name:'weekly_lesson_plan_draft',description:'A teacher-reviewable weekly lesson plan draft.',strict:true,schema:LESSON_PLAN_SCHEMA}},max_output_tokens:7000};
  const {data}=await requestJson({provider:'openai',url:'https://api.openai.com/v1/responses',headers:{Authorization:`Bearer ${apiKey}`},body,timeoutMs});
  return {plan:parseProviderPlan('openai',extractOutputText(data),week),responseId:data.id||null,model:data.model||selected,provider:'openai'};
}
async function createOpenAiCompatibleDraft({provider,apiKey,model,week,assignmentTitle='',dueText='',cardText='',planningContext='',weekNotes='',timeoutMs=90000}){
  const id=normalizeProvider(provider),label=providerLabel(id);if(!['groq','openrouter'].includes(id))throw new Error(`Unsupported compatible AI provider: ${id}`);
  if(!apiKey||String(apiKey).length<16)throw providerError(id,`${label} private key is not configured.`);
  const prompt=buildDraftPrompt({week,assignmentTitle,dueText,cardText,planningContext,weekNotes}),selected=modelForProvider(id,model);
  const body={model:selected,messages:[{role:'system',content:SYSTEM_INSTRUCTIONS},{role:'user',content:prompt}],response_format:{type:'json_schema',json_schema:{name:'weekly_lesson_plan_draft',strict:true,schema:LESSON_PLAN_SCHEMA}},temperature:0.2,max_tokens:id==='groq'?3500:5000};
  let url='https://api.groq.com/openai/v1/chat/completions';
  const headers={Authorization:`Bearer ${apiKey}`};
  if(id==='openrouter'){
    url='https://openrouter.ai/api/v1/chat/completions';
    body.provider={require_parameters:true,data_collection:'deny',zdr:true};
    headers['X-Title']='Classroom Auto Turn-In';
  }
  const {data}=await requestJson({provider:id,url,headers,body,timeoutMs});
  const text=data?.choices?.[0]?.message?.content;
  return {plan:parseProviderPlan(id,text,week),responseId:data.id||null,model:data.model||selected,provider:id};
}
async function createGeminiDraft({apiKey,model=DEFAULT_MODELS.gemini,week,assignmentTitle='',dueText='',cardText='',planningContext='',weekNotes='',timeoutMs=90000}){
  if(!apiKey||String(apiKey).length<16)throw providerError('gemini','Google Gemini private key is not configured.');
  const prompt=buildDraftPrompt({week,assignmentTitle,dueText,cardText,planningContext,weekNotes}),selected=modelForProvider('gemini',model);
  const body={systemInstruction:{parts:[{text:SYSTEM_INSTRUCTIONS}]},contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0.2,maxOutputTokens:5000,responseMimeType:'application/json',responseJsonSchema:LESSON_PLAN_SCHEMA}};
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selected)}:generateContent`;
  const {data}=await requestJson({provider:'gemini',url,headers:{'x-goog-api-key':apiKey},body,timeoutMs});
  const text=(data?.candidates?.[0]?.content?.parts||[]).map(x=>typeof x?.text==='string'?x.text:'').join('\n');
  return {plan:parseProviderPlan('gemini',text,week),responseId:data.responseId||null,model:data.modelVersion||selected,provider:'gemini'};
}
async function createAiDraft({provider=DEFAULT_PROVIDER,...options}){
  const id=normalizeProvider(provider);
  if(id==='openai')return createOpenAiDraft(options);
  if(id==='gemini')return createGeminiDraft(options);
  return createOpenAiCompatibleDraft({provider:id,...options});
}
function renderDraftDocx(plan,file){return createPlanDocx(plan,file)}
module.exports={AI_PROVIDERS,DEFAULT_PROVIDER,DEFAULT_MODELS,DEFAULT_MODEL,LESSON_PLAN_SCHEMA,SYSTEM_INSTRUCTIONS,normalizeProvider,providerLabel,modelForProvider,buildDraftPrompt,extractOutputText,validateDraftPlan,createAiDraft,createOpenAiDraft,createOpenAiCompatibleDraft,createGeminiDraft,renderDraftDocx};
