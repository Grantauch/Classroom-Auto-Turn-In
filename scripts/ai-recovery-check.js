const fs=require('fs'),path=require('path'),os=require('os');
const {DEFAULT_PROVIDER,DEFAULT_MODELS,buildDraftPrompt,extractOutputText,validateDraftPlan,createAiDraft,createOpenAiDraft,renderDraftDocx}=require('../engine/ai-recovery');
const {createAiService}=require('../main-services/ai-service');
const {createLocalData}=require('../main-services/local-data');

const prompt=buildDraftPrompt({week:8,assignmentTitle:'Week 8 - Lesson Plans',dueText:'Due Sep 21',planningContext:'Teach U.S. History and Government. Use concise daily plans.',weekNotes:'History is on the Gilded Age.'});
if(DEFAULT_PROVIDER!=='groq'||DEFAULT_MODELS.groq!=='openai/gpt-oss-20b')throw new Error('Free AI defaults are not aligned');
if(!prompt.includes('Gilded Age')||!prompt.includes('Week 8'))throw new Error('AI prompt did not preserve week-specific teacher context');
const raw={output:[{content:[{type:'output_text',text:'{"ok":true}'}]}]};
if(extractOutputText(raw)!=='{"ok":true}')throw new Error('Responses API output parser failed');
let mismatch=false;try{validateDraftPlan({weekNumber:7,courses:[{}]},8)}catch{mismatch=true}if(!mismatch)throw new Error('AI week mismatch was not blocked');

const plan={title:'Week 8',weekNumber:8,weekLabel:'Week 8',overview:'Students examine industrialization.',courses:[{course:'U.S. History',objective:'Explain one major Gilded Age change.',standards:'Verify local standard before submission.',days:[{day:'Monday',topic:'Gilded Age',activities:'Analyze notes and a short source.',assessment:'Exit ticket.',materials:'Class notes.'}]}],teacherReview:['Confirm the local standard.'],notes:'Teacher review required.'};
const ok=data=>({ok:true,status:200,text:async()=>JSON.stringify(data)});

(async()=>{
  const oldFetch=global.fetch,seen=[];let forceGroqLimit=false;
  global.fetch=async(url,opts)=>{
    const body=JSON.parse(opts.body);seen.push({url,body,headers:opts.headers});
    if(url==='https://api.openai.com/v1/responses'){
      if(body.model!=='gpt-5.6-terra'||body.store!==false||body.text?.format?.type!=='json_schema'||body.text?.format?.strict!==true)throw new Error('Structured OpenAI request is malformed or response storage was not disabled');
      return ok({id:'resp_openai',model:'gpt-5.6-terra',output:[{content:[{type:'output_text',text:JSON.stringify(plan)}]}]});
    }
    if(url==='https://api.groq.com/openai/v1/chat/completions'){
      if(body.model!=='openai/gpt-oss-20b'||body.response_format?.type!=='json_schema'||body.response_format?.json_schema?.strict!==true||body.max_tokens>3500)throw new Error('Groq free structured request is malformed');
      if(forceGroqLimit)return {ok:false,status:429,text:async()=>JSON.stringify({error:{message:'free limit reached'}})};
      return ok({id:'resp_groq',model:body.model,choices:[{message:{content:JSON.stringify(plan)}}]});
    }
    if(url==='https://openrouter.ai/api/v1/chat/completions'){
      if(body.model!=='openrouter/free'||body.response_format?.type!=='json_schema'||body.provider?.require_parameters!==true||body.provider?.data_collection!=='deny'||body.provider?.zdr!==true)throw new Error('OpenRouter free privacy/structured request is malformed');
      return ok({id:'resp_router',model:'free/test-model',choices:[{message:{content:JSON.stringify(plan)}}]});
    }
    if(url==='https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent'){
      if(body.generationConfig?.responseMimeType!=='application/json'||body.generationConfig?.responseJsonSchema?.type!=='object'||!opts.headers['x-goog-api-key'])throw new Error('Gemini free structured request is malformed');
      return ok({responseId:'resp_gemini',modelVersion:'gemini-3.5-flash',candidates:[{content:{parts:[{text:JSON.stringify(plan)}]}}]});
    }
    throw new Error(`Unexpected AI endpoint: ${url}`);
  };
  try{
    const common={apiKey:'test-private-key-12345678901234567890',week:8,assignmentTitle:'Week 8 - Lesson Plans',planningContext:'U.S. History'};
    const openai=await createOpenAiDraft(common),groq=await createAiDraft({provider:'groq',...common}),gemini=await createAiDraft({provider:'gemini',...common}),router=await createAiDraft({provider:'openrouter',...common});
    for(const out of [openai,groq,gemini,router])if(out.plan.weekNumber!==8||out.plan.courses[0].course!=='U.S. History')throw new Error('Mock multi-provider draft generation failed');
    if(groq.provider!=='groq'||gemini.provider!=='gemini'||router.provider!=='openrouter'||seen.length!==4)throw new Error('AI provider dispatch did not use every expected endpoint');
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cati-ai-'));const file=path.join(dir,'draft.docx');renderDraftDocx(groq.plan,file);const buf=fs.readFileSync(file);
    if(buf.readUInt32LE(0)!==0x04034b50||!buf.includes(Buffer.from('[Content_Types].xml'))||!buf.includes(Buffer.from('word/document.xml'))||!buf.includes(Buffer.from('Gilded Age')))throw new Error('Generated DOCX package is invalid or missing lesson content');
    fs.rmSync(dir,{recursive:true,force:true});

    const serviceRoot=fs.mkdtempSync(path.join(os.tmpdir(),'cati-ai-service-')),localData=createLocalData(()=>serviceRoot);
    const protect=value=>Buffer.from(`protected:${value}`,'utf8'),unprotect=buffer=>buffer.toString('utf8').replace(/^protected:/,'');
    fs.writeFileSync(localData.jsonPath('ai-secrets.json'),JSON.stringify({openaiApiKeyEncrypted:protect('legacy-openai-private-key-12345').toString('base64')}),'utf8');
    const service=createAiService({safeStorage:{isEncryptionAvailable:()=>true,encryptString:protect,decryptString:unprotect},localData,ensureAutomationIdle(){},runNodeScript:async()=>'',lastPayload:()=>[],acquireLock:()=>({}),releaseLock(){},runAutomation:async()=>({}),userSafeError:()=>({}),compactError:e=>String(e?.message||e),getMainWindow:()=>null});
    service.saveAiSettings({optedIn:true,enabled:false,provider:'groq',planningContext:'Teach U.S. History with concise daily plans and teacher review.',apiKey:'groq-private-key-1234567890'});
    service.saveAiSettings({optedIn:true,enabled:true,provider:'groq',connectionProvider:'gemini',planningContext:'Teach U.S. History with concise daily plans and teacher review.',apiKey:'gemini-private-key-1234567890',fallbackEnabled:true});
    const state=service.aiPublicState();
    if(!state.settings.connections.groq?.hasApiKey||!state.settings.connections.gemini?.hasApiKey||!state.settings.connections.openai?.hasApiKey)throw new Error('Provider connection storage or legacy OpenAI migration failed');
    const secretRecord=JSON.parse(fs.readFileSync(localData.jsonPath('ai-secrets.json'),'utf8'));
    if(secretRecord.schema!==2||!secretRecord.providers?.groq||!secretRecord.providers?.gemini||!secretRecord.providers?.openai||secretRecord.openaiApiKeyEncrypted)throw new Error('Encrypted AI connection schema migration failed');
    forceGroqLimit=true;
    const fallbackDraft=await service.createAiDraftForBlocker({week:8,assignmentTitle:'Week 8 - Lesson Plans'});
    if(fallbackDraft.provider!=='gemini'||fallbackDraft.providerAttempts?.map(x=>x.provider).join(',')!=='groq,gemini'||fallbackDraft.providerAttempts?.[0]?.retryable!==true)throw new Error('Opt-in fallback did not move from a limited Groq free account to the connected Gemini free account');
    forceGroqLimit=false;
    fs.rmSync(serviceRoot,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }finally{global.fetch=oldFetch;}
  for(const provider of ['openai','groq','gemini','openrouter']){let noKey=false;try{await createAiDraft({provider,apiKey:'',week:8})}catch{noKey=true}if(!noKey)throw new Error(`${provider} draft generation did not require a private key`)}
  console.log('AI recovery offline checks passed: OpenAI plus three free providers, privacy parameters, structured plans, week validation, and DOCX generation.');
})().catch(e=>{console.error(e);process.exit(1)});
