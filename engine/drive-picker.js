function driveFolderId(value){
  try{
    const url=new URL(String(value||''),'https://drive.google.com');
    if(url.hostname.toLowerCase()!=='drive.google.com')return null;
    const match=url.pathname.match(/^\/drive\/(?:u\/\d+\/)?folders\/([^/?#]+)/i);
    return match?match[1]:null;
  }catch{return null}
}

function driveFolderDisplayName(payload={}){
  return String(payload.folderName||payload.title||'Google Drive folder')
    .replace(/\s+/g,' ')
    .trim()
    .replace(/\s*[-–—]\s*Google Drive.*$/i,'')
    .replace(/^Google Drive\s*[-–—]\s*/i,'')
    .trim()||'Google Drive folder';
}

function installDriveFolderPicker(){
  if(location.hostname.toLowerCase()!=='drive.google.com')return false;
  const match=location.pathname.match(/^\/drive\/(?:u\/\d+\/)?folders\/([^/?#]+)/i);
  let host=document.getElementById('cati-drive-picker');
  if(!match){if(host)host.remove();return false}
  if(host)return true;

  host=document.createElement('div');
  host.id='cati-drive-picker';
  host.style.cssText='position:fixed;right:24px;bottom:24px;z-index:2147483647;background:#111827;color:white;padding:14px 16px;border-radius:14px;box-shadow:0 12px 36px rgba(0,0,0,.35);font:13px Segoe UI,Arial,sans-serif;max-width:330px';
  const text=document.createElement('div');
  text.textContent='Classroom Auto Turn-In: if this folder contains your weekly lesson plans, choose it here.';
  text.style.cssText='margin-bottom:10px;line-height:1.35;color:#dbe4f0';
  const btn=document.createElement('button');
  btn.type='button';
  btn.textContent='Use this folder';
  btn.style.cssText='flex:1;border:0;border-radius:9px;padding:10px 12px;background:#3468e8;color:white;font-weight:700;cursor:pointer';
  btn.addEventListener('click',async event=>{
    event.preventDefault();
    event.stopPropagation();
    if(btn.dataset.busy==='1')return;
    btn.dataset.busy='1';
    btn.disabled=true;
    btn.textContent='Choosing…';
    try{
      if(typeof window.catiPickDriveFolder!=='function')throw new Error('The Drive picker is not connected to the app.');
      await window.catiPickDriveFolder({url:location.href,title:document.title});
      btn.textContent='Folder chosen';
    }catch{
      btn.dataset.busy='0';
      btn.disabled=false;
      btn.textContent='Try again';
      text.textContent='The app could not receive this folder. Close this browser window, return to Auto Turn-In, and choose the folder again.';
    }
  });
  const cancel=document.createElement('button');
  cancel.type='button';
  cancel.textContent='Cancel';
  cancel.style.cssText='border:1px solid #60708a;border-radius:9px;padding:10px 12px;background:#253149;color:white;font-weight:700;cursor:pointer';
  cancel.addEventListener('click',async event=>{
    event.preventDefault();
    event.stopPropagation();
    cancel.disabled=true;
    cancel.textContent='Closing…';
    try{await window.catiCancelDrivePicker()}catch{cancel.disabled=false;cancel.textContent='Cancel'}
  });
  const actions=document.createElement('div');
  actions.style.cssText='display:flex;gap:8px';
  actions.append(btn,cancel);
  host.append(text,actions);
  document.body.appendChild(host);
  return true;
}

async function createDriveFolderPickerBridge(context,onPick,{onCancel=()=>{}}={}){
  const pageBindings=new WeakMap();
  let disposed=false;
  const bind=async page=>{
    if(disposed||!page||page.isClosed())return;
    if(pageBindings.has(page))return pageBindings.get(page);
    const binding=(async()=>{
      await page.exposeFunction('catiPickDriveFolder',onPick);
      await page.exposeFunction('catiCancelDrivePicker',onCancel);
    })();
    pageBindings.set(page,binding);
    try{await binding}catch(error){pageBindings.delete(page);throw error}
  };
  const onPage=page=>{bind(page).catch(()=>{})};
  context.on('page',onPage);
  for(const page of context.pages())await bind(page);
  return {
    async inject(){
      let visible=0;
      for(const page of context.pages()){
        if(page.isClosed())continue;
        try{
          await bind(page);
          if(await page.evaluate(installDriveFolderPicker))visible++;
        }catch(error){
          if(driveFolderId(page.url()))throw error;
        }
      }
      return visible;
    },
    dispose(){
      disposed=true;
      context.off('page',onPage);
    }
  };
}

module.exports={driveFolderId,driveFolderDisplayName,createDriveFolderPickerBridge};
