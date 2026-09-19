const {log}=require('./lib');
const {extractGoogleFileId}=require('./safety');

async function assertGoogleSession(page,where='Google Classroom'){
  const url=String(page.url()||'');
  const authHost=/https?:\/\/accounts\.google\.com\//i.test(url);
  let authText=false;
  if(authHost){
    authText=await page.getByText(/Sign in|Choose an account|Use your Google Account/i).first().isVisible({timeout:1000}).catch(()=>true);
  }
  if(authHost&&authText){
    const err=new Error(`Google session expired or requires sign-in before ${where} can be accessed. Open the app and sign in again.`);
    err.code='AUTH_REQUIRED'; err.retryable=false; throw err;
  }
}

async function maybeClick(locator, timeout=1800) {
  // Playwright ignores isVisible's timeout, so wait explicitly for the control.
  try {
    const first=locator.first();
    await first.waitFor({state:'visible',timeout:Math.max(1,timeout)});
    await first.click({timeout:Math.max(1000,timeout)});
    return true;
  } catch{/* best-effort fallback */}
  return false;
}

async function pollUntil(fn, timeout, interval=300) {
  const deadline=Date.now()+Math.max(0,timeout);
  for(;;){
    const value=await fn().catch(()=>null);
    if(value) return value;
    if(Date.now()>=deadline) return value;
    await new Promise(r=>setTimeout(r,interval));
  }
}

async function isSubmitted(page) {
  // Positive completion evidence must belong to this assignment's Your work area.
  // Generic words elsewhere on the page (a comment saying "Submitted", for example)
  // are not proof that the assignment itself was turned in.
  const scope=await getYourWorkScope(page);
  if(scope){
    const checks=[
      scope.getByText('Turned in',{exact:true}),
      scope.getByRole('button',{name:/Unsubmit/i}),
      scope.getByText('Unsubmit',{exact:true}),
      scope.getByText('Marked as done',{exact:true}),
      scope.getByText('Submitted',{exact:true}),
      scope.getByText('Done late',{exact:true}),
      scope.getByText('Turned in late',{exact:true}),
      scope.getByText('Handed in',{exact:true}),
      scope.getByText('Handed in late',{exact:true})
    ];
    for(const x of checks){try{if(await x.first().isVisible({timeout:900}))return true}catch{/* best-effort fallback */}}
  }
  // Unsubmit is a strong action-specific fallback if Classroom changes the panel wrapper.
  try{if(await page.getByRole('button',{name:/^Unsubmit$/i}).first().isVisible({timeout:700}))return true}catch{/* best-effort fallback */}
  return false;
}

async function isReturned(page) {
  const scope=await getYourWorkScope(page);
  if(!scope)return false;
  return await scope.getByText('Returned',{exact:true}).first().isVisible().catch(()=>false);
}

async function getSubmissionAction(page) {
  // Final submission controls are only trusted inside this assignment's
  // verified Your work panel. Never search the full page for destructive text.
  const scope=await getYourWorkScope(page);
  if(!scope)return null;
  const actions=[
    {label:'Turn in', pattern:/^Turn in$/i},
    {label:'Mark as done', pattern:/^Mark as done$/i}
  ];
  for(const action of actions){
    const candidates=[
      scope.getByRole('button',{name:action.pattern}),
      scope.locator('button,[role="button"]').filter({hasText:action.pattern})
    ];
    for(const loc of candidates){
      const n=Math.min(await loc.count().catch(()=>0),8);
      for(let i=0;i<n;i++){
        const el=loc.nth(i);
        try{
          if(await el.isVisible({timeout:500}))return {label:action.label,locator:el};
        }catch{/* best-effort fallback */}
      }
    }
  }
  return null;
}

async function getYourWorkScope(page) {
  const marked=await page.evaluate(()=>{
    document.querySelectorAll('[data-cati-your-work]').forEach(el=>el.removeAttribute('data-cati-your-work'));
    const visible=el=>{const r=el.getBoundingClientRect(),st=getComputedStyle(el);return r.width>1&&r.height>1&&st.display!=='none'&&st.visibility!=='hidden'};
    const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
    const labels=[...document.querySelectorAll('h1,h2,h3,h4,div,span')].filter(visible).filter(el=>clean(el.textContent)==='Your work');
    // Prefer the smallest ancestor that holds this panel's own action controls.
    // A header row can contain both "Your work" and a status such as
    // "Turned in"; stopping there would hide the attachment list.
    const actionRe=/(?:^|[\s+])(?:Add or create|Turn in|Mark as done|Unsubmit|Mark as not done)$/i;
    const hasAction=el=>[...el.querySelectorAll('button,[role="button"]')].some(b=>{
      if(!visible(b))return false;
      const t=clean(b.innerText||b.textContent||b.getAttribute('aria-label'));
      return t.length<=40&&actionRe.test(t);
    });
    for(const label of labels){
      let p=label;
      for(let depth=0;p&&depth<8;depth++,p=p.parentElement){
        const text=clean(p.innerText||p.textContent);
        if(text.length<12000&&hasAction(p)){
          p.setAttribute('data-cati-your-work','1');
          return true;
        }
      }
    }
    for(const label of labels){
      let p=label;
      for(let depth=0;p&&depth<8;depth++,p=p.parentElement){
        const text=clean(p.innerText||p.textContent);
        if(/Add or create|Turn in|Mark as done|Unsubmit|Turned in|Submitted|Marked as done/i.test(text) && text.length<12000){
          p.setAttribute('data-cati-your-work','1');
          return true;
        }
      }
    }
    return false;
  }).catch(()=>false);
  return marked?page.locator('[data-cati-your-work="1"]').first():null;
}

async function verifyPlanAttachment(page, plan, timeout=1200) {
  const deadline=Date.now()+Math.max(250,timeout);
  const fileId=extractGoogleFileId(plan.url);
  do {
    const scope=await getYourWorkScope(page);
    if(scope){
      if(fileId){
        const idVisible=await scope.evaluate((root,id)=>{
          for(const el of root.querySelectorAll('a[href], [data-id], [data-file-id], [data-resource-id], [data-doc-id]')){
            const values=[el.getAttribute('href'),...Array.from(el.attributes||[]).map(a=>a.value)].filter(Boolean);
            if(values.some(v=>String(v).includes(id))) return true;
          }
          return false;
        },fileId).catch(()=>false);
        if(idVisible) return {verified:true,method:'Google file ID inside Your work',fileId};
        // When a Google file ID is known, it is the authoritative identity.
        // A same-title card is not enough because two files may share a name.
      } else {
        const title=scope.getByText(plan.title,{exact:true}).first();
        const titleVisible=await title.isVisible({timeout:250}).catch(()=>false);
        if(titleVisible) return {verified:true,method:'exact title inside Your work',fileId:''};
      }
    }
    if(Date.now()<deadline) await page.waitForTimeout(250);
  } while(Date.now()<deadline);
  return {verified:false,method:'not found',fileId:fileId||''};
}

async function assertSafeAttachmentSet(page,plan){
  const scope=await getYourWorkScope(page);
  if(!scope) throw new Error('Could not verify the Your work attachment area. Submission is blocked.');
  const evidence=await scope.evaluate(root=>{
    const visible=el=>{const r=el.getBoundingClientRect(),st=getComputedStyle(el);return r.width>1&&r.height>1&&st.display!=='none'&&st.visibility!=='hidden'};
    const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
    const links=[];const seen=new Set();const fileIds=new Set();
    for(const a of root.querySelectorAll('a[href]')){
      if(!visible(a))continue;
      const href=a.href||a.getAttribute('href')||'';if(!href||/^javascript:/i.test(href))continue;
      const text=clean(a.innerText||a.textContent||a.getAttribute('aria-label')||a.getAttribute('title'));
      const key=`${href}|${text}`;if(seen.has(key))continue;seen.add(key);links.push({href,text});
    }
    for(const el of root.querySelectorAll('[data-file-id],[data-doc-id],[data-resource-id]')){
      if(!visible(el))continue;
      for(const name of ['data-file-id','data-doc-id','data-resource-id']){
        const raw=el.getAttribute(name);if(!raw)continue;
        const v=String(raw).trim();
        if(/^[A-Za-z0-9_-]{10,}$/.test(v)){fileIds.add(v);continue;}
        const tail=v.match(/(?:^|[:/])([A-Za-z0-9_-]{20,})$/);if(tail)fileIds.add(tail[1]);
      }
    }
    return {links,fileIds:[...fileIds]};
  }).catch(()=>({links:[],fileIds:[]}));
  const expectedId=extractGoogleFileId(plan.url);
  const unexpected=[];
  for(const id of evidence.fileIds||[]){if(!expectedId||id!==expectedId)unexpected.push(`Google file ${id.slice(0,8)}…`);}
  for(const item of evidence.links||[]){
    let href=item.href;
    try{
      const u=new URL(href);
      if(/(^|\.)classroom\.google\.com$/i.test(u.hostname)||/(^|\.)accounts\.google\.com$/i.test(u.hostname)||/(^|\.)support\.google\.com$/i.test(u.hostname)) continue;
      if(/(^|\.)google\.com$/i.test(u.hostname)&&u.pathname==='/url') href=u.searchParams.get('q')||u.searchParams.get('url')||href;
    }catch{/* best-effort fallback */}
    const id=extractGoogleFileId(href);
    if(id){
      if(expectedId&&id===expectedId) continue;
      unexpected.push(item.text||`Google file ${id.slice(0,8)}…`);continue;
    }
    try{
      const u=new URL(href);
      if(!/(^|\.)google\.com$/i.test(u.hostname)) unexpected.push(item.text||u.hostname);
    }catch{/* best-effort fallback */}
  }
  if(unexpected.length){
    const names=[...new Set(unexpected)].slice(0,5);
    throw new Error(`Unexpected attachment(s) are already present in Your work: ${names.join(' | ')}. Nothing was submitted. Remove the extra attachment(s), then check again.`);
  }
  return true;
}

async function isPlanAttached(page, plan) {
  return (await verifyPlanAttachment(page,plan,1200)).verified;
}

async function visibleDialogInfo(page) {
  const dialogs=page.locator('[role="dialog"]');
  const n=Math.min(await dialogs.count().catch(()=>0),8);
  for (let i=n-1;i>=0;i--) {
    const d=dialogs.nth(i);
    try {
      if (!(await d.isVisible({timeout:250}))) continue;
      const text=(await d.innerText().catch(()=>'' )).replace(/\s+/g,' ').trim().slice(0,700);
      const buttons=await d.locator('button,[role="button"]').evaluateAll(els=>els.map(el=>({
        text:(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim(),
        aria:(el.getAttribute('aria-label')||'').replace(/\s+/g,' ').trim()
      }))).catch(()=>[]);
      return {locator:d,text,buttons};
    } catch{/* best-effort fallback */}
  }
  return null;
}

function escapeRegex(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }

async function clickSubmissionConfirmation(page, label) {
  // Classroom normally opens a modal confirmation after the first Turn in /
  // Mark as done click. Scope the second click to that dialog so we never
  // accidentally click the page-level action twice.
  for (let i=0;i<8;i++) {
    const info=await visibleDialogInfo(page);
    if (info) {
      log(`Submission confirmation dialog: ${info.text || '(no dialog text)'}`);
      // Another computer may have completed the assignment after this machine's
      // page-level click but before confirmation. Positive shared completion
      // state always wins over clicking the confirmation button.
      if(await isSubmitted(page)){
        await page.keyboard.press('Escape').catch(()=>{});
        return {clicked:false,alreadyCompleted:true,completedDuringConfirmation:true};
      }
      const exact=new RegExp(`^${escapeRegex(label)}$`,'i');
      const candidates=[
        info.locator.getByRole('button',{name:exact}),
        info.locator.locator('button').filter({hasText:exact}),
        info.locator.locator('[role="button"]').filter({hasText:exact})
      ];
      for (const loc of candidates) {
        const n=Math.min(await loc.count().catch(()=>0),10);
        for (let j=n-1;j>=0;j--) {
          const el=loc.nth(j);
          try {
            if (!(await el.isVisible({timeout:300}))) continue;
            await el.click({timeout:2200});
            return {clicked:true,dialog:true};
          } catch{/* best-effort fallback */}
        }
      }
      const names=(info.buttons||[]).map(b=>b.text||b.aria).filter(Boolean).join(' | ');
      throw new Error(`Confirmation dialog appeared, but its ${label} button could not be clicked. Visible dialog buttons: ${names || '(none detected)'}`);
    }
    if (await isSubmitted(page)) return {clicked:false,dialog:false,completedAfterInitialClick:true};
    await page.waitForTimeout(250);
  }
  // No dialog appeared. Some Classroom variants complete immediately after the
  // first click, so let the durable post-submit verification decide success.
  return {clicked:false,dialog:false};
}

async function visibleAttachmentMenuChoices(page) {
  return await page.evaluate(() => {
    const visible = el => {
      const r=el.getBoundingClientRect();
      const st=getComputedStyle(el);
      return r.width>1 && r.height>1 && st.visibility!=='hidden' && st.display!=='none' && Number(st.opacity||1)>0;
    };
    const sels='[role="menuitem"],[role="menuitemradio"],[role="option"],[role="button"],button,[aria-label],[title]';
    const out=[];
    for (const el of document.querySelectorAll(sels)) {
      if (!visible(el)) continue;
      const txt=(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim();
      const aria=(el.getAttribute('aria-label')||'').replace(/\s+/g,' ').trim();
      const title=(el.getAttribute('title')||'').replace(/\s+/g,' ').trim();
      const label=[txt,aria,title].filter(Boolean).join(' / ');
      if (!label || label.length>120) continue;
      out.push(label);
    }
    return [...new Set(out)].slice(0,40);
  }).catch(()=>[]);
}

async function findAndClickLinkChoice(page, timeout=3000) {
  return !!(await pollUntil(()=>findAndClickLinkChoiceOnce(page),timeout,250));
}

async function findAndClickLinkChoiceOnce(page) {
  // Classroom has used several DOM shapes for the attachment menu over time.
  // Try accessible-role locators first, then fall back to the actual visible DOM.
  const locators=[
    page.getByRole('menuitem',{name:/^\s*(?:attach\s+)?link\s*$/i}),
    page.getByRole('menuitemradio',{name:/^\s*(?:attach\s+)?link\s*$/i}),
    page.getByRole('option',{name:/^\s*(?:attach\s+)?link\s*$/i})
  ];
  for (const loc of locators) {
    const n=Math.min(await loc.count().catch(()=>0),12);
    for (let i=0;i<n;i++) {
      const el=loc.nth(i);
      try {
        if (!(await el.isVisible({timeout:350}))) continue;
        await el.scrollIntoViewIfNeeded().catch(()=>{});
        await el.click({timeout:1600});
        return true;
      } catch{/* best-effort fallback */}
    }
  }

  // Final fallback: only inspect a visible menu/listbox/dialog that Classroom
  // opened for Add or create. Never search the entire page for the word "Link".
  return await page.evaluate(() => {
    const visible = el => {
      const r=el.getBoundingClientRect();
      const st=getComputedStyle(el);
      return r.width>1 && r.height>1 && st.visibility!=='hidden' && st.display!=='none' && Number(st.opacity||1)>0;
    };
    const roots=[...document.querySelectorAll('[role="menu"],[role="listbox"],[role="dialog"],[aria-modal="true"]')].filter(visible);
    const candidates=[];
    for(const root of roots){
      for (const el of root.querySelectorAll('button,[role="button"],[role="menuitem"],[role="menuitemradio"],[role="option"],[tabindex],a,[aria-label],[title]')) {
        if (!visible(el)) continue;
        const r=el.getBoundingClientRect();if(r.width>500||r.height>140)continue;
        const txt=(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim();
        const aria=(el.getAttribute('aria-label')||'').replace(/\s+/g,' ').trim();
        const title=(el.getAttribute('title')||'').replace(/\s+/g,' ').trim();
        const label=[txt,aria,title].filter(Boolean).join(' ');
        if (!/(^|\s)(attach\s+)?link($|\s)/i.test(label)) continue;
        const clickable = el.matches('button,[role="button"],[role="menuitem"],[role="menuitemradio"],[role="option"],[tabindex],a') || !!el.getAttribute('jsaction');
        if(!clickable)continue;
        candidates.push({el,score:r.width*r.height});
      }
    }
    candidates.sort((a,b)=>a.score-b.score);
    const target=candidates[0]?.el;if(!target)return false;
    target.click();return true;
  }).catch(()=>false);
}

async function openAttachmentMenu(page) {
  const addCandidates=[
    page.getByRole('button',{name:/Add or create/i}),
    page.getByText('Add or create',{exact:true}),
    page.locator('[aria-label*="Add or create" i]')
  ];
  for (const c of addCandidates) {
    if (await maybeClick(c,2500)) {
      await page.waitForTimeout(650); // allow Classroom menu animation/render
      return true;
    }
  }
  return false;
}

const LINK_INPUT_SELECTOR='input[type="url"],input[type="text"],input:not([type]),textarea,[role="textbox"]';

async function findLinkEntryDialog(page, timeout=3000) {
  // The Link dialog is the newest visible dialog that holds a text field. Typing
  // is scoped to it so a private-comment box elsewhere on the page is never used.
  const deadline=Date.now()+Math.max(0,timeout);
  do {
    const dialogs=page.locator('[role="dialog"],[aria-modal="true"]');
    const n=Math.min(await dialogs.count().catch(()=>0),8);
    for (let i=n-1;i>=0;i--) {
      const d=dialogs.nth(i);
      try {
        if (!(await d.isVisible())) continue;
        const inputs=d.locator(LINK_INPUT_SELECTOR);
        const m=Math.min(await inputs.count().catch(()=>0),6);
        for (let j=0;j<m;j++) {
          const input=inputs.nth(j);
          if (await input.isVisible().catch(()=>false)) return {dialog:d,input};
        }
      } catch{/* best-effort fallback */}
    }
    if (Date.now()<deadline) await page.waitForTimeout(200);
  } while (Date.now()<deadline);
  return null;
}

async function attachLink(page, plan) {
  // Never rely on a same-title string elsewhere on the page. The attachment must
  // be visible inside Classroom's Your work area before submission is allowed.
  const existing=await verifyPlanAttachment(page,plan,1200);
  await assertSafeAttachmentSet(page,plan);
  if(existing.verified) return `already attached and verified (${existing.method}; no unexpected attachments)`;

  if (!(await openAttachmentMenu(page))) throw new Error('Could not find "Add or create".');

  if (!(await findAndClickLinkChoice(page))) {
    const choices=await visibleAttachmentMenuChoices(page);
    throw new Error(`Could not choose Link from Add or create menu. Visible choices: ${choices.join(' | ') || '(none detected)'}`);
  }

  await page.waitForTimeout(500);
  const linkDialog=await findLinkEntryDialog(page,5000);
  let input;
  if (linkDialog) input=linkDialog.input;
  else {
    // Same rule the Safety Check verified: without dialog semantics, only a
    // dedicated URL field may receive the plan link. A comment box never does.
    input=page.locator('input[type="url"]').last();
    if (!(await input.count())) throw new Error('Link was chosen, but no link-entry dialog appeared. Nothing was attached.');
  }
  await input.waitFor({state:'visible',timeout:5000});
  await input.fill(plan.url);

  const scope=linkDialog?linkDialog.dialog:page;
  const buttons=[
    scope.getByRole('button',{name:/^Add link$/i}),
    scope.getByRole('button',{name:/^Add$/i}),
    scope.locator('[aria-label*="Add link" i]')
  ];
  let added=false;
  for (const b of buttons) { if (await maybeClick(b,2500)) {added=true;break;} }
  if (!added) throw new Error('Could not confirm Add link.');

  const verified=await verifyPlanAttachment(page,plan,10000);
  if(!verified.verified) throw new Error(`Classroom accepted the Add link click, but the exact plan "${plan.title}" did not appear inside Your work. Submission is blocked.`);
  await assertSafeAttachmentSet(page,plan);
  return `attached and verified (${verified.method}; no unexpected attachments)`;
}

async function verifyDryRunControls(page, plan) {
  await assertSafeAttachmentSet(page,plan);
  if (await isPlanAttached(page,plan)) {
    const action=await getSubmissionAction(page);
    if (!action) throw new Error('DRY RUN verified the plan attachment, but no Turn in or Mark as done control is visible. This assignment cannot certify LIVE mode.');
    return `exact plan attachment + ${action.label} control verified`;
  }
  if (!(await openAttachmentMenu(page))) throw new Error('DRY RUN could not find Add or create control.');

  const choices=await visibleAttachmentMenuChoices(page);
  if (choices.length) log(`Attachment menu visible choices: ${choices.join(' | ')}`);

  const linkFound=await findAndClickLinkChoice(page);
  if (!linkFound) throw new Error(`DRY RUN opened Add or create, but Link was not found. Visible choices: ${choices.join(' | ') || '(none detected)'}`);

  // We only need to prove the Link choice works. Do not type a URL or attach anything.
  await page.waitForTimeout(450);
  let linkDialogVisible=!!(await findLinkEntryDialog(page,3000));
  if (!linkDialogVisible && !(await page.locator('[role="dialog"],[aria-modal="true"]').count().catch(()=>0))) {
    // Some Classroom builds may render the link field without dialog semantics.
    // Only then fall back to the newest URL field on the page.
    linkDialogVisible=await page.locator('input[type="url"]').last().isVisible().catch(()=>false);
  }
  if (!linkDialogVisible) throw new Error('DRY RUN clicked Link, but no link-entry dialog appeared.');

  await page.keyboard.press('Escape').catch(()=>{});
  await page.waitForTimeout(300);
  // Some dialogs require a second Escape to dismiss the parent menu/dialog.
  await page.keyboard.press('Escape').catch(()=>{});
  await page.waitForTimeout(250);

  const action=await getSubmissionAction(page);
  if (!action) throw new Error('DRY RUN could not find a Turn in or Mark as done button.');
  return `Link attachment dialog + ${action.label} control verified`;
}

async function submitAssignment(page) {
  // Re-read shared Classroom state at the last possible moment before the
  // page-level destructive action. This narrows the Main/Backup race window.
  if(await isSubmitted(page))return {label:'Already completed',confirmedBy:'Classroom completed state at final pre-click recheck',alreadyCompleted:true};
  const action=await getSubmissionAction(page);
  if (!action) throw new Error('Could not verify a Turn in or Mark as done button inside Your work.');
  const label=action.label;
  await action.locator.click({timeout:3000});
  await page.waitForTimeout(350);

  // IMPORTANT: the first click can open a confirmation modal. Confirm only
  // inside that visible dialog, never by clicking another page-level copy of
  // the same label.
  const confirm=await clickSubmissionConfirmation(page,label);
  if(confirm.alreadyCompleted)return {label,confirmedBy:'Classroom completed state before confirmation click',alreadyCompleted:true};
  if(confirm.completedAfterInitialClick)return {label,confirmedBy:'completion label after initial submission click',alreadyCompleted:false};
  if (confirm.clicked) {
    log(`${label}: confirmation dialog button clicked.`);
    await page.waitForTimeout(650);
  }

  // Do not declare success from a disappearing button. Classroom must show
  // a positive completed state, either now or after a reload.
  for (let i=0;i<10;i++) {
    await page.waitForTimeout(500);
    if (await isSubmitted(page)) return {label, confirmedBy:'completion label'};
  }

  const detailUrl=page.url();
  await page.reload({waitUntil:'domcontentloaded',timeout:30000}).catch(async()=>{
    await page.goto(detailUrl,{waitUntil:'domcontentloaded',timeout:30000});
  });
  await page.waitForTimeout(1400);

  if (await isSubmitted(page)) return {label, confirmedBy:'completion label after reload'};
  const remainingAction=await getSubmissionAction(page);
  if (remainingAction) {
    throw new Error(`${label} was clicked${confirm.clicked?' and confirmed in the dialog':''}, but Classroom still shows ${remainingAction.label} after reload; refusing to record success.`);
  }
  throw new Error(`${label} was clicked${confirm.clicked?' and confirmed in the dialog':''}, but Classroom did not show a positive Turned in/Submitted state after reload; refusing to record success.`);
}

async function assignmentDetailVisible(page, timeout=0) {
  if(timeout>0) return !!(await pollUntil(()=>assignmentDetailVisible(page,0),timeout));
  const checks=[
    page.getByText('Your work',{exact:true}),
    page.getByText('Add or create',{exact:true}),
    page.getByRole('button',{name:/^Turn in$/i}),
    page.getByRole('button',{name:/^Mark as done$/i}),
    page.getByRole('button',{name:/Unsubmit/i})
  ];
  for (const c of checks) {
    // Classroom can leave a hidden copy of a control in the DOM before the
    // visible assignment panel. Checking only locator.first() makes the real
    // panel look absent. Accept any visible exact match, while retaining the
    // action-specific names that keep this check off the Classwork list page.
    const n=Math.min(await c.count().catch(()=>0),20);
    for(let i=0;i<n;i++){
      try { if (await c.nth(i).isVisible()) return true; } catch{/* best-effort fallback */}
    }
  }
  return false;
}

module.exports={assertGoogleSession,maybeClick,pollUntil,isSubmitted,isReturned,getSubmissionAction,getYourWorkScope,verifyPlanAttachment,assertSafeAttachmentSet,isPlanAttached,visibleDialogInfo,escapeRegex,clickSubmissionConfirmation,visibleAttachmentMenuChoices,findAndClickLinkChoice,openAttachmentMenu,findLinkEntryDialog,attachLink,verifyDryRunControls,submitAssignment,assignmentDetailVisible};
