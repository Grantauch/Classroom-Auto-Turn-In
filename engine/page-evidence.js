const {log,screenshotPath}=require('./lib');

// Troubleshooting evidence for a check that stopped: a screenshot plus a short
// outline of the page structure (landmarks, headings, button labels). It is
// written only to this computer's support log and never changes behavior.
async function savePageEvidence(page,label){
  if(!page||(typeof page.isClosed==='function'&&page.isClosed()))return;
  try{await page.screenshot({path:screenshotPath(label),fullPage:true,timeout:15000});}
  catch(e){log(`Troubleshooting screenshot could not be saved (${label}): ${String(e?.message||e).split('\n')[0]}`);}
  try{
    const outline=await page.evaluate(()=>{
      const clean=v=>String(v||'').replace(/\s+/g,' ').trim().slice(0,80);
      const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};
      const pick=(sel,max,fn)=>[...document.querySelectorAll(sel)].filter(visible).slice(0,max).map(fn);
      return {
        page:location.hostname+location.pathname,
        title:clean(document.title),
        regions:pick('[role="region"],section,[role="list"],ol,ul',40,el=>({tag:el.tagName.toLowerCase(),role:el.getAttribute('role')||'',label:clean(el.getAttribute('aria-label')),items:el.querySelectorAll('li,[role="listitem"]').length})),
        headings:pick('h1,h2,h3,h4,[role="heading"]',60,el=>({tag:el.tagName.toLowerCase(),level:el.getAttribute('aria-level')||'',text:clean(el.innerText)})),
        controls:pick('button,[role="button"],[role="menuitem"],[role="tab"]',80,el=>clean(el.innerText||el.getAttribute('aria-label'))).filter(Boolean),
        dialogs:pick('[role="dialog"],[aria-modal="true"]',5,el=>clean(el.innerText)),
        streamItems:document.querySelectorAll('[data-stream-item-id]').length
      };
    });
    log(`Page outline (${label}): ${JSON.stringify(outline).slice(0,8000)}`);
  }catch(e){log(`Page outline could not be read (${label}): ${String(e?.message||e).split('\n')[0]}`);}
}

module.exports={savePageEvidence};
