const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..'),pkg=require('../package.json');
function fail(message){console.error(`RELEASE BLOCKER: ${message}`);process.exit(1)}
if(pkg.version!=='0.9.22')fail(`package version is ${pkg.version}, expected 0.9.22.`);
const lockPath=path.join(root,'package-lock.json');
if(!fs.existsSync(lockPath))fail('package-lock.json is missing. Run PREPARE-RC-LOCKFILE.bat once on an internet-connected Windows computer, retain the generated lockfile, then rerun the release checks.');
let lock;try{lock=JSON.parse(fs.readFileSync(lockPath,'utf8'))}catch{fail('package-lock.json cannot be read as valid JSON. Regenerate it with PREPARE-RC-LOCKFILE.bat.')}
if(!(lock.lockfileVersion>=3))fail('package-lock.json uses an unsupported old lockfile format.');
const declared={...pkg.dependencies,...pkg.devDependencies};
for(const [name,v] of Object.entries(declared))if(/^[~^*><=]/.test(String(v)))fail(`dependency is not pinned exactly: ${name}=${v}`);
const rootLock=lock.packages&&lock.packages[''];
if(!rootLock)fail('package-lock.json does not contain the root package record.');
if(rootLock.version!==pkg.version)fail(`package-lock.json belongs to version ${rootLock.version||'unknown'}, not ${pkg.version}. Run PREPARE-RC-LOCKFILE.bat again.`);
for(const [name,v] of Object.entries(pkg.dependencies||{}))if(rootLock.dependencies?.[name]!==v)fail(`locked dependency declaration differs for ${name}.`);
for(const [name,v] of Object.entries(pkg.devDependencies||{}))if(rootLock.devDependencies?.[name]!==v)fail(`locked development dependency declaration differs for ${name}.`);
if(!pkg.build.files.includes('main-services/**/*'))fail('packaged release omits the main-services modules.');
for(const f of ['main-services/local-data.js','main-services/engine-runner.js','main-services/scheduler-service.js','main-services/ai-service.js','main-services/grading-service.js','main-services/machine-service.js','main-services/setup-transfer.js','engine/grading.js','engine/app-config.js','engine/json-store.js','engine/protocol.js'])if(!fs.existsSync(path.join(root,f)))fail(`required release module is missing: ${f}`);

if(pkg.devDependencies?.resedit!=='1.7.2')fail('resedit must be pinned exactly at 1.7.2 for Windows resource restoration.');
if(pkg.build?.win?.signAndEditExecutable!==false)fail('electron-builder 26.0.12 winCodeSign helper must remain disabled on the unsigned recovery build.');
if(Object.prototype.hasOwnProperty.call(pkg.build?.win||{},'signExecutable'))fail('electron-builder 26.0.12 rejects win.signExecutable.');
if(pkg.build?.afterPack!=='./scripts/after-pack-windows.js')fail('Windows afterPack resource hook is missing.');
console.log('Release-readiness dependency gate passed. Lockfile, exact dependency declarations, and packaged architecture are aligned.');
