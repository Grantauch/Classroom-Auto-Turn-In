const {launchTeacherContext}=require('./browser');
const {loadConfig}=require('./lib');
const {decodePayload}=require('./classroom-grading');
const {readTurnIns,catalog,sheetIdentity}=require('./storyhub-submissions');
const {emit,emitError}=require('./protocol');

(async()=>{
  const input=decodePayload(process.argv[2]),spreadsheetUrl=sheetIdentity(input.spreadsheetUrl).url;
  const context=await launchTeacherContext(loadConfig(),{headless:false});
  try{const groups=catalog(await readTurnIns(context,spreadsheetUrl));emit('storyhub-catalog',{spreadsheetUrl,groups})}
  finally{await context.close().catch(()=>{/* Close the read-only teacher session. */})}
})().catch(error=>{emitError(error);process.exit(1)});
