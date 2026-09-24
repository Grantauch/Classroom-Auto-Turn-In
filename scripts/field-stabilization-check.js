const fs=require('fs');
function src(file){return fs.readFileSync(file,'utf8')}
function assert(ok,msg){if(!ok)throw new Error(msg)}
const main=src('main.js'),lib=src('engine/lib.js'),submit=src('engine/submit-weekly.js'),actions=src('engine/classroom-actions.js'),runner=src('main-services/engine-runner.js'),appConfig=src('engine/app-config.js'),ui=src('renderer/app.js'),pkg=JSON.parse(src('package.json'));
assert(pkg.version==='0.9.29','package version is not 0.9.29');
assert(!src('renderer/index.html').includes('Silent weekly automation'),'UI still claims scheduled operation is silent before v0.9.0');
assert(main.includes("const autoSubmittedRecords=records.filter(r=>r.detected!==true)"),'dashboard does not separate Auto Turn-In submissions from already-completed detections');
assert(main.includes('submittedCount:autoSubmittedRecords.length'),'dashboard submitted count still includes detected/manual completions');
assert(main.includes('cfg.safetyCertification?.verified'),'next-plan anchor does not use the safety-verified current/future week');
assert(ui.includes('blockerCount=(d.diagnostics?.currentBlockers||[]).length'),'Home master status does not include current blockers');
assert(ui.includes('fullyReady=live&&scheduleReady&&historyHealthy&&blockerCount===0'),'Home can still show healthy while a blocker exists');
assert(ui.includes('/\\bweek(\\s*[-#:]?\\s*)(0?\\d{1,2})\\b/i'),'naming example parser is not Week-aware');
assert(!ui.includes('const m=s.match(/\\d+/)'),'naming example parser still grabs the first number');
assert(runner.includes("'submit-weekly.js':13*60*1000"),'master automation child timeout is missing');
assert(runner.includes('terminateChildTree(child)'),'timed-out child processes are not terminated');
assert(main.includes('withExclusiveBrowserOperation'),'setup browser actions are not serialized');
for(const op of ["'course:select'","'topics:discover'","'drive:select-folder'","'drive:scan-folder'"]) assert(main.includes(op),'missing setup operation '+op);
assert(lib.includes('A confirmed-live process owns the lock regardless of age'),'run-lock live-PID protection is missing');
assert(!lib.includes('age>staleMinutes'),'a live lock can still be removed only because it is old');
assert(actions.includes('Turned in|Submitted|Marked as done'),'completed Your work scope is not recognized');
assert(!actions.includes("document.querySelectorAll('body *')"),'Link fallback still searches the whole page');
assert(actions.includes("'[role=\"menu\"],[role=\"listbox\"],[role=\"dialog\"],[aria-modal=\"true\"]'"),'Link fallback is not scoped to the opened menu/dialog');
assert(main.includes('shouldShowIncidentNotification'),'repeated blocker notification suppression is missing');
assert(main.includes('6*60*60*1000'),'notification incident suppression window is missing');
assert(appConfig.includes("'browser-profile'"),'shared browser profile default is missing');
assert(lib.includes('defaultProfileDirForDataRoot(ROOT)'),'engine profile default is not using the shared profile rule');
assert(submit.includes('4*60*1000'),'nested trusted-Drive scan timeout is missing');
console.log('v0.8.2 field-test stabilization regression checks passed under v0.9.29.');
