const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const jsFiles=[];
(function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){if(ent.name==='node_modules'||ent.name==='.build-tools'||ent.name==='dist')continue;const p=path.join(dir,ent.name);if(ent.isDirectory())walk(p);else if(ent.isFile()&&p.endsWith('.js'))jsFiles.push(p)}})(root);

// Relative-require graph must remain acyclic.
const graph=new Map(jsFiles.map(f=>[f,[]]));
const req=/require\(['"](\.{1,2}\/[^'"]+)['"]\)/g;
for(const f of jsFiles){let m;const s=fs.readFileSync(f,'utf8');while((m=req.exec(s))){let target=path.resolve(path.dirname(f),m[1]);if(!path.extname(target))target+='.js';if(graph.has(target))graph.get(f).push(target)}}
const visiting=new Set(),visited=new Set();
function dfs(n,stack=[]){if(visiting.has(n))throw new Error(`Circular internal dependency: ${[...stack,n].map(x=>path.relative(root,x)).join(' -> ')}`);if(visited.has(n))return;visiting.add(n);for(const d of graph.get(n)||[])dfs(d,[...stack,n]);visiting.delete(n);visited.add(n)}
for(const n of graph.keys())dfs(n);

const main=read('main.js'),submit=read('engine/submit-weekly.js'),pkg=JSON.parse(read('package.json'));
assert(main.split(/\r?\n/).length<500,'main.js has become overloaded again');
assert(submit.split(/\r?\n/).length<400,'submit-weekly.js has become overloaded again');
assert(!/CATI_(?:RESULT|DRY_CERT|DRIVE_PLANS|COURSE|TOPICS|PREFLIGHT|AI_UPLOAD):/.test(jsFiles.map(f=>fs.readFileSync(f,'utf8')).join('\n')),'Legacy ad-hoc child-process protocol markers returned');
assert(read('engine/protocol.js').includes("const PREFIX='CATI_EVENT:'"),'Versioned process protocol is missing');
assert(pkg.build.files.includes('main-services/**/*'),'Packaged app would omit refactored main-process services');
assert(!main.includes('function defaultConfig()'),'main.js reintroduced a duplicate configuration definition');
assert(read('engine/lib.js').includes("require('./app-config')")&&read('main-services/local-data.js').includes("require('../engine/app-config')"),'Engine and desktop shell are not sharing the configuration contract');
assert(!jsFiles.some(f=>/catch\s*\{\s*\}/.test(fs.readFileSync(f,'utf8'))),'Undocumented empty catch block found');

// IPC contract: every invoke exposed by preload must exist in main, and main must not keep dead invoke handlers.
const preload=read('preload.js');
const exposed=[...preload.matchAll(/invoke\('([^']+)'/g)].map(m=>m[1]);
const handled=[...main.matchAll(/handleIpc\('([^']+)'/g)].map(m=>m[1]);
const allowMainOnly=new Set([]);
for(const ch of new Set(exposed))assert(handled.includes(ch),`Preload invokes missing IPC handler: ${ch}`);
for(const ch of new Set(handled))assert(exposed.includes(ch)||allowMainOnly.has(ch),`Dead IPC handler not exposed by preload: ${ch}`);
assert(!handled.includes('setup:complete')&&!handled.includes('diagnostics:get')&&!handled.includes('logs:get'),'Removed legacy IPC handler returned');

// Structured protocol round-trip.
const protocol=require('../engine/protocol');
const encoded=protocol.encode('test',{ok:true,n:3});
const parsed=protocol.parseLine(encoded);assert.equal(parsed.type,'test');assert.deepEqual(parsed.payload,{ok:true,n:3});
assert.deepEqual(protocol.lastPayload(`${encoded}\n${protocol.encode('test',{ok:false})}`,'test'),{ok:false});

// Config migration must preserve safety defaults and converge on the current schema.
const appConfig=require('../engine/app-config');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cati-arch-'));
const profile=path.join(temp,'browser-profile');
const migrated=appConfig.migrateConfig({configSchema:3,eligibilityMode:'planWeekOf',schedule:{time:'07:15',days:['MON']}},{profileDir:profile,env:{}});
assert.equal(migrated.configSchema,appConfig.CONFIG_SCHEMA);
assert.equal(migrated.eligibilityMode,'classroomDueDate');
assert.equal(migrated.profileDir,profile);
assert.equal(migrated.submitOverdue,false);
assert.deepEqual(migrated.retryMinutes,[15,30]);

// Shared JSON store must restore the latest committed backup.
const store=require('../engine/json-store');
const jf=path.join(temp,'x.json');store.atomicWriteJson(jf,{v:1},{backup:true});store.atomicWriteJson(jf,{v:2},{backup:true});fs.writeFileSync(jf,'{broken');
const recovered=store.readJsonWithBackup(jf,{fallback:{},label:'Test'});assert.deepEqual(recovered,{v:2});
fs.rmSync(temp,{recursive:true,force:true});

console.log(`Architecture checks passed: ${jsFiles.length} JavaScript files, no internal dependency cycles, IPC contract aligned, shared config/storage/protocol verified.`);
