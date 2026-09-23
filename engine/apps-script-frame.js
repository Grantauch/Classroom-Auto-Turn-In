async function resolveAppsScriptBridgeFrame(page,{timeoutMs=35000,pollMs=200}={}){
  const deadline=Date.now()+Math.max(1000,Number(timeoutMs)||35000);
  const main=typeof page.mainFrame==='function'?page.mainFrame():null;
  while(Date.now()<deadline){
    const frames=typeof page.frames==='function'?page.frames():[];
    const ready=[];
    for(const frame of frames){
      let trusted=false;
      try{
        const host=new URL(frame.url()).hostname.toLowerCase();
        trusted=host==='script.google.com'||host.endsWith('.googleusercontent.com');
      }catch{/* keep untrusted */}
      if(!trusted)continue;
      const hasBridge=await frame.evaluate(()=>Boolean(window.google&&google.script&&google.script.run)).catch(()=>false);
      if(hasBridge)ready.push(frame);
    }
    const childReady=ready.filter(frame=>frame!==main);
    if(childReady.length===1)return childReady[0];
    if(childReady.length>1)throw new Error('The Hall Pass / Check-In page exposed more than one Apps Script application frame. Nothing was synchronized.');
    if(ready.length===1)return ready[0];
    if(ready.length>1)throw new Error('The Hall Pass / Check-In Apps Script bridge was ambiguous. Nothing was synchronized.');
    await page.waitForTimeout(Math.max(50,Number(pollMs)||200));
  }
  throw new Error('The Hall Pass / Check-In application bridge did not become ready. Nothing was synchronized.');
}
module.exports={resolveAppsScriptBridgeFrame};
