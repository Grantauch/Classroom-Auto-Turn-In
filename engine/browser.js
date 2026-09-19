const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const { log } = require('./lib');
const {shouldRunHeadless}=require('./browser-mode');

function windowsCandidates(){
  const env=process.env;
  return [
    {channel:'chrome',label:'Google Chrome',paths:[
      env.LOCALAPPDATA && path.join(env.LOCALAPPDATA,'Google','Chrome','Application','chrome.exe'),
      env.ProgramFiles && path.join(env.ProgramFiles,'Google','Chrome','Application','chrome.exe'),
      env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'],'Google','Chrome','Application','chrome.exe')
    ]},
    {channel:'msedge',label:'Microsoft Edge',paths:[
      env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'],'Microsoft','Edge','Application','msedge.exe'),
      env.ProgramFiles && path.join(env.ProgramFiles,'Microsoft','Edge','Application','msedge.exe'),
      env.LOCALAPPDATA && path.join(env.LOCALAPPDATA,'Microsoft','Edge','Application','msedge.exe')
    ]}
  ];
}

function detectInstalledBrowser(){
  if(process.platform!=='win32') return {channel:'chrome',label:'Google Chrome',detected:false,path:null};
  for(const c of windowsCandidates()){
    const hit=c.paths.filter(Boolean).find(p=>fs.existsSync(p));
    if(hit) return {channel:c.channel,label:c.label,detected:true,path:hit};
  }
  return {channel:null,label:null,detected:false,path:null};
}

function channelOrder(cfg={}){
  const pref=String(cfg.browserChannel||'auto').toLowerCase();
  if(pref==='chrome') return ['chrome'];
  if(pref==='msedge') return ['msedge'];
  const detected=detectInstalledBrowser();
  if(detected.channel==='msedge') return ['msedge','chrome'];
  return ['chrome','msedge'];
}

function launchOnce(cfg,channel,silent,extra,overrides={}){
  const extraArgs=Array.isArray(extra.args)?extra.args:[];
  const rest={...extra}; delete rest.args;
  return chromium.launchPersistentContext(cfg.profileDir,{
    headless:silent,
    channel,
    viewport:silent?{width:1440,height:1000}:null,
    args:['--no-first-run','--no-default-browser-check',...extraArgs],
    ...rest,
    ...overrides
  });
}

// Background Chrome/Edge announces itself as "HeadlessChrome". Google pages
// can treat that differently from the visible browser the Safety Check used,
// so silent runs reopen with the browser's normal user agent.
async function browserUserAgent(context){
  try{const page=context.pages()[0]||await context.newPage();return String(await page.evaluate(()=>navigator.userAgent)||'');}
  catch{return '';}
}

async function launchTeacherContext(cfg, extra={}){
  const errors=[];
  const silent=extra.headless===undefined?shouldRunHeadless():!!extra.headless;
  for(const channel of channelOrder(cfg)){
    try{
      let context=await launchOnce(cfg,channel,silent,extra);
      if(silent&&!extra.userAgent){
        const ua=await browserUserAgent(context);
        if(/HeadlessChrome\//.test(ua)){
          await context.close();
          context=await launchOnce(cfg,channel,silent,extra,{userAgent:ua.replace(/HeadlessChrome\//g,'Chrome/')});
        }
      }
      log(`Browser engine: ${channel==='chrome'?'Google Chrome':'Microsoft Edge'} (${silent?'background':'visible'} mode).`);
      return context;
    }catch(e){
      errors.push(`${channel}: ${String(e.message||e).split('\n')[0]}`);
    }
  }
  throw new Error(
    'Classroom Auto Turn-In could not open Google Chrome or Microsoft Edge. '+
    'Install one of those browsers, close any stuck Auto Turn-In browser window, and try again. '+
    `Details: ${errors.join(' | ')}`
  );
}

module.exports={detectInstalledBrowser,launchTeacherContext,browserUserAgent};
