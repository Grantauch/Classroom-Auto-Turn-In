const { launchTeacherContext } = require('./browser');
const { loadConfig, log } = require('./lib');
const {collectDrivePlanRowsDom} = require('./dom-helpers');

const {emit,emitError}=require('./protocol');
const DRIVE_LIST_WAIT_MS=25000;
function normalizeUrl(href){
  if(!href) return '';
  try{
    const u=new URL(href,'https://drive.google.com');
    if(!/(^|\.)google\.com$/i.test(u.hostname)) return '';
    return u.href;
  }catch{return '';}
}
function usefulDocumentUrl(href){
  const u=normalizeUrl(href);
  if(!u) return '';
  return /\/(document|spreadsheets|presentation|file)\/d\//i.test(u) || /drive\.google\.com\/open\?id=/i.test(u) ? u : '';
}

(async()=>{
  const cfg=loadConfig();
  if(!cfg.driveFolderUrl) throw new Error('Choose a Google Drive folder first.');
  const planRe=new RegExp(cfg.planTitleRegex||'^Week\\s+0?(\\d+)\\s*-\\s*Lesson Plans(?:\\.(?:docx|pdf))?$','i');
  const context=await launchTeacherContext(cfg);
  try{
  const page=context.pages()[0] || await context.newPage();
  await page.goto(cfg.driveFolderUrl,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForTimeout(1800);
  if(/https?:\/\/accounts\.google\.com\//i.test(page.url())) throw new Error('Google sign-in is required before the lesson-plan folder can be checked. Open the app and sign in to Google again.');
  // Drive draws its file list after the page loads. On a slow connection that
  // can take several seconds, so wait for a matching row before scanning.
  async function waitForMatchingRows(timeout=DRIVE_LIST_WAIT_MS){
    const deadline=Date.now()+timeout;
    for(;;){
      const rows=await page.evaluate(collectDrivePlanRowsDom,{source:planRe.source,flags:planRe.flags}).catch(()=>[]);
      if(rows.length||Date.now()>=deadline) return rows.length;
      await page.waitForTimeout(500);
    }
  }
  if(!(await waitForMatchingRows())) log('Drive scan: no matching file names were visible after waiting for the folder to load; scanning the folder anyway.');
  const found=new Map();
  const candidates=new Map();
  const resolvedChoices=new Map();

  async function collect(){
    const rows=await page.evaluate(collectDrivePlanRowsDom,{source:planRe.source,flags:planRe.flags});

    const unresolvedThisPass=new Map();
    for(const r of rows){
      let url=usefulDocumentUrl(r.href);
      if(!url && r.id) url=`https://drive.google.com/open?id=${encodeURIComponent(r.id)}`;
      if(url){
        if(!resolvedChoices.has(r.week)) resolvedChoices.set(r.week,new Map());
        const choices=resolvedChoices.get(r.week);
        const key=r.id||url;
        choices.set(key,{week:r.week,title:r.title,url,id:r.id||''});
        if(choices.size>1){
          const names=[...choices.values()].map(x=>`${x.title} [${x.id||x.url}]`).join(' | ');
          throw new Error(`Duplicate plan files map to Week ${r.week}. Exactly one file is allowed per week. ${names}`);
        }
        found.set(r.week,{week:r.week,weekOf:'',title:r.title,url,source:'drive-folder'});
      }else{
        if(!unresolvedThisPass.has(r.week)) unresolvedThisPass.set(r.week,new Map());
        unresolvedThisPass.get(r.week).set(r.rootKey,{week:r.week,title:r.title,rootKey:r.rootKey});
        if(!candidates.has(r.week)) candidates.set(r.week,new Map());
        candidates.get(r.week).set(r.rootKey,{week:r.week,title:r.title,rootKey:r.rootKey});
      }
    }
    for(const [week,items] of unresolvedThisPass){
      if(items.size>1) throw new Error(`Duplicate plan files map to Week ${week}. More than one matching file is visible in the approved Drive folder. Remove or rename the duplicate before automation can continue.`);
    }
  }

  async function scrollPass(){
    await collect();
    const result=await page.evaluate(()=>{
      const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>100&&r.height>100&&s.display!=='none'&&s.visibility!=='hidden'};
      const all=[document.scrollingElement,...document.querySelectorAll('[role="main"],[role="grid"],div')].filter(Boolean);
      const scrollables=all.filter(e=>visible(e)&&e.scrollHeight>e.clientHeight+80).sort((a,b)=>(b.scrollHeight-b.clientHeight)-(a.scrollHeight-a.clientHeight));
      const el=scrollables[0]||document.scrollingElement;
      const before=el.scrollTop,max=el.scrollHeight-el.clientHeight;
      el.scrollTop=Math.min(max,before+Math.max(500,Math.floor(el.clientHeight*.78)));
      return {before,after:el.scrollTop,max};
    }).catch(()=>({before:0,after:0,max:0}));
    await page.waitForTimeout(240); return result;
  }

  for(let i=0,stable=0;i<100;i++){
    const r=await scrollPass();
    if(r.after===r.before||r.after>=r.max-4) stable++; else stable=0;
    if(stable>=4) break;
  }
  await collect();

  async function resolveByOpening(candidate){
    // Drive often does not expose a useful href until a file is opened. Use an exact title,
    // double-click/Enter it like a teacher would, capture the resulting Google URL, then close/back out.
    await page.goto(cfg.driveFolderUrl,{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForTimeout(900);
    await waitForMatchingRows(15000);
    const title=candidate.title;
    const exact=page.getByText(title,{exact:true}).first();
    let visible=false, stable=0;
    for(let i=0;i<100&&!visible;i++){
      try{visible=await exact.isVisible({timeout:250})}catch{visible=false}
      if(visible)break;
      const r=await page.evaluate(()=>{
        const vis=e=>{const b=e.getBoundingClientRect(),s=getComputedStyle(e);return b.width>100&&b.height>100&&s.display!=='none'&&s.visibility!=='hidden'};
        const all=[document.scrollingElement,...document.querySelectorAll('[role="main"],[role="grid"],div')].filter(Boolean);
        const scrollables=all.filter(e=>vis(e)&&e.scrollHeight>e.clientHeight+80).sort((a,b)=>(b.scrollHeight-b.clientHeight)-(a.scrollHeight-a.clientHeight));
        const el=scrollables[0]||document.scrollingElement;
        const before=el.scrollTop,max=el.scrollHeight-el.clientHeight;
        el.scrollTop=Math.min(max,before+Math.max(500,Math.floor(el.clientHeight*.78)));
        return {before,after:el.scrollTop,max};
      }).catch(()=>({before:0,after:0,max:0}));
      if(r.after===r.before||r.after>=r.max-4)stable++;else stable=0;
      if(stable>=4)break;
      await page.waitForTimeout(220);
    }
    if(!visible)return '';
    try{await exact.scrollIntoViewIfNeeded({timeout:4500})}catch{return ''}
    const beforePages=new Set(context.pages());
    const beforeUrl=page.url();
    let popup=null;
    const popupPromise=context.waitForEvent('page',{timeout:3500}).catch(()=>null);
    try{await exact.dblclick({timeout:4500})}catch{
      try{await exact.click({timeout:2500});await page.keyboard.press('Enter')}catch{return ''}
    }
    popup=await popupPromise;
    await page.waitForTimeout(1200);
    if(popup){
      try{await popup.waitForLoadState('domcontentloaded',{timeout:5000})}catch{/* best-effort fallback */}
      const u=usefulDocumentUrl(popup.url());
      try{await popup.close()}catch{/* best-effort fallback */}
      if(u)return u;
    }
    for(const p of context.pages()){
      if(!beforePages.has(p)){
        const u=usefulDocumentUrl(p.url());
        try{await p.close()}catch{/* best-effort fallback */}
        if(u)return u;
      }
    }
    const same=usefulDocumentUrl(page.url());
    if(same){try{await page.goBack({waitUntil:'domcontentloaded',timeout:8000})}catch{/* best-effort fallback */};return same}
    if(page.url()!==beforeUrl){try{await page.goBack({waitUntil:'domcontentloaded',timeout:8000})}catch{/* best-effort fallback */}}
    return '';
  }

  for(const [week,items] of candidates){if(!found.has(week)&&items.size>1)throw new Error(`Duplicate plan files map to Week ${week}. Exactly one matching file is allowed per week.`);}
  const unresolved=[...candidates.entries()].filter(([week])=>!found.has(week)).map(([week,items])=>[...items.values()][0]).sort((a,b)=>a.week-b.week);
  if(unresolved.length) log(`Drive scan: ${unresolved.length} title(s) need open-to-resolve fallback.`);
  for(const c of unresolved){
    const url=await resolveByOpening(c);
    if(url){found.set(c.week,{week:c.week,weekOf:'',title:c.title,url,source:'drive-folder'});log(`Drive scan resolved Week ${c.week} by safely opening its file.`)}
    else log(`Drive scan could see Week ${c.week} but could not resolve a shareable Google URL.`);
  }

  const plans=[...found.values()].sort((a,b)=>a.week-b.week);
  if(!plans.length) throw new Error('No lesson-plan files matched the plan filename pattern in this Drive folder. Check the folder, naming pattern, and make sure the files are visible to this Google account.');
  const missing=[...candidates.keys()].filter(w=>!found.has(w));
  if(missing.length) log(`Drive folder scan warning: matching titles were visible for week(s) ${missing.join(', ')}, but their URLs could not be resolved.`);
  log(`Drive folder scan found ${plans.length} usable plan(s): weeks ${plans.map(p=>p.week).join(', ')}.`);
  emit('drive-plans',plans);
  }finally{await context.close().catch(()=>{});}
})().catch(e=>{emitError(e);process.exit(1)});
