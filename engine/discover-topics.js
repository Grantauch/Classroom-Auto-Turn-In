const { launchTeacherContext } = require('./browser');
const { loadConfig } = require('./lib');
const {emit,emitError}=require('./protocol');
const {parseClassroomIds}=require('./safety');
(async()=>{
  const cfg=loadConfig();
  if(!cfg.courseUrl) throw new Error('Choose a Classroom first.');
  const context=await launchTeacherContext(cfg);
  try{
  const page=context.pages()[0] || await context.newPage();
  await page.goto(cfg.courseUrl,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForTimeout(1200);
  if(/https?:\/\/accounts\.google\.com\//i.test(page.url())) throw new Error('Google needs you to sign in again before Classroom topics can be checked. Open Google Classroom from the app and sign in.');
  const classwork=page.getByText('Classwork',{exact:true});
  try { await classwork.first().waitFor({state:'visible',timeout:4000}); await classwork.first().click(); } catch{/* best-effort fallback */}
  await page.waitForTimeout(1500);
  const {courseId}=parseClassroomIds(cfg.courseUrl);
  if(courseId&&!(/\/w\//.test(new URL(page.url()).pathname)&&parseClassroomIds(page.url()).courseId===courseId)){
    const prefix=(new URL(cfg.courseUrl).pathname.match(/^\/u\/\d+/)||[''])[0];
    await page.goto(`https://classroom.google.com${prefix}/w/${courseId}/t/all`,{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForTimeout(1500);
  }
  if(/https?:\/\/accounts\.google\.com\//i.test(page.url())) throw new Error('Google needs you to sign in again before Classroom topics can be checked.');
  await page.waitForFunction(()=>[...document.querySelectorAll('[role="region"][aria-label],h2,h3,[role="heading"]')].some(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0}),null,{timeout:15000,polling:500}).catch(()=>{});
  await page.waitForTimeout(800);
  const topics=await page.evaluate(()=>{
    const out=[];
    const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
    for(const el of document.querySelectorAll('[role="region"][aria-label]')){
      const raw=clean(el.getAttribute('aria-label'));
      const stripped=raw.replace(/^Topic\b\s*:?\s*/i,'').trim();
      const headings=[...el.querySelectorAll('h1,h2,h3,h4,[role="heading"]')].map(h=>clean(h.innerText||h.textContent).toLowerCase());
      if(raw&&headings.includes(raw.toLowerCase())) out.push(raw);
      else if(stripped&&(headings.includes(stripped.toLowerCase())||/^Topic\b/i.test(raw))) out.push(stripped);
    }
    if(!out.length){
      for(const el of document.querySelectorAll('h2,h3,[role="heading"]')){
        const t=(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim();
        if(t && t.length<140) out.push(t);
      }
    }
    return [...new Set(out)].slice(0,100);
  });
  emit('topics',topics);
  }finally{await context.close().catch(()=>{});}
})().catch(e=>{emitError(e);process.exit(1)});
