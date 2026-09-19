const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const file = path.join(root, 'scripts', 'Get-PortableNode.ps1');
const src = fs.readFileSync(file, 'utf8');
const bat = fs.readFileSync(path.join(root, 'BUILD-SETUP-EXE.bat'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');

assert(src.includes("$version = 'v22.19.0'"), 'Portable builder runtime must remain pinned.');
assert(src.includes("$expectedSha256 = 'ea3fad0e67a991d8477d8c01344b56e69c676ccb733f065b22436994b1253f86'"), 'Pinned Node SHA-256 must remain explicit.');
assert(!src.includes("Join-Path $Root '.build-tools'"), 'Portable Node must not extract beneath the project/source path.');
assert(src.includes("$CacheBase = Join-Path $cacheParent 'CATI-Build'"), 'Portable Node must use the short per-user CATI-Build cache.');
assert(src.includes("$stage = Join-Path $CacheBase (\"stage-$nonce\")"), 'Builder extraction must use a unique short staging path.');
assert(src.includes("$extract = Join-Path $stage 'x'"), 'Builder extraction leaf must remain deliberately short.');
assert(!/\bExpand-Archive\b(?![^\r\n]*PowerShell 5\.1)/.test(src.replace(/# PowerShell 5\.1 Expand-Archive[^\r\n]*/g, '')), 'Builder must not depend on PowerShell Expand-Archive.');
assert(src.includes('[System.IO.Compression.ZipFile]::ExtractToDirectory'), 'Builder must use .NET ZIP extraction.');
assert(src.includes('Get-FileHash -Algorithm SHA256'), 'Portable Node download must be hash verified.');
assert(src.includes("Join-Path $expandedDir 'node.exe'"), 'Builder must verify node.exe inside the expected extracted directory.');
assert(src.includes('$installedVersion.Trim() -ne $version'), 'Builder must verify the installed portable Node version after extraction.');
assert(src.includes('finally {'), 'Builder must clean temporary artifacts even after failure.');
assert(bat.includes('set "PATH=%LOCALAPPDATA%\\CATI-Build\\node-v22.19.0;%PATH%"'), 'Builder BAT must add the short portable Node cache to PATH.');
assert(!/PATH=.*else\s*\(/i.test(bat),'Builder contains a malformed leftover else block after pinned Node setup.');
assert(bat.includes('windows-installed-validation.ps1'),'Release builder must run actual install/uninstall/reinstall validation before hashing artifacts.');
assert.equal(pkg.build?.win?.signAndEditExecutable, false, 'Pinned electron-builder 26.0.12 must bypass its winCodeSign resource/signing helper on restricted Windows accounts.');
assert(!Object.prototype.hasOwnProperty.call(pkg.build?.win||{},'signExecutable'),'electron-builder 26.0.12 rejects win.signExecutable; do not reintroduce that invalid schema key.');
assert.equal(pkg.build?.afterPack, './scripts/after-pack-windows.js', 'Pure-JS Windows resource restoration hook is missing.');
assert.equal(pkg.devDependencies?.resedit, '1.7.2', 'Pure-JS Windows resource editor must remain pinned exactly.');
assert(fs.existsSync(path.join(root,'scripts','electron-builder-schema-check.js')), 'Installed electron-builder schema preflight is missing.');
assert(fs.existsSync(path.join(root,'scripts','after-pack-windows.js')), 'Windows resource restoration hook is missing.');
assert(bat.includes('CSC_IDENTITY_AUTO_DISCOVERY=false'), 'Controlled builder must explicitly suppress signing auto-discovery.');
assert(main.includes("icon:path.join(__dirname,'assets','icon.ico')"), 'Runtime BrowserWindow icon must remain explicit.');

for(const file of ['BUILD-SETUP-EXE.bat','BUILD-WINDOWS.bat','PREPARE-RC-LOCKFILE.bat','RUN-PRE-FLIGHT-TESTS.bat']){
  const txt=fs.readFileSync(path.join(root,file),'utf8');
  assert(!txt.includes('.build-tools\\node'),`${file} still points at the retired in-project Node cache.`);
}
for(const file of ['BUILD-SETUP-EXE.bat','PREPARE-RC-LOCKFILE.bat','RUN-PRE-FLIGHT-TESTS.bat']){
  const txt=fs.readFileSync(path.join(root,file),'utf8');
  assert(txt.includes('Get-PortableNode.ps1')&&txt.includes('CATI-Build\\node-v22.19.0'),`${file} must use the pinned Node v22.19.0 cache.`);
}

// Guard the exact field failure: even when the source path itself is extremely
// long, the Node extraction destination must not contain that source path.
const simulatedLongSource = 'C:\\Users\\teacher\\Downloads\\Classroom-Auto-Turn-In-v0.9.13-Source-and-Builder-REV-B\\Classroom-Auto-Turn-In-v0.9.13-Windows-Multi-PC';
const simulatedCache = 'C:\\Users\\teacher\\AppData\\Local\\CATI-Build';
const deepestKnownNodeSuffix = '\\x\\node-v22.19.0-win-x64\\node_modules\\npm\\docs\\content\\commands\\npm-install-ci-test.md';
assert((simulatedCache + '\\stage-1234-123456789' + deepestKnownNodeSuffix).length < 240, 'Portable Node extraction path must retain safe headroom below legacy MAX_PATH.');
assert(!(simulatedCache + deepestKnownNodeSuffix).includes(simulatedLongSource), 'Portable Node extraction must be independent of source folder depth.');

console.log('Builder bootstrap regression check passed.');
