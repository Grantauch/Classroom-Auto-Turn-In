const fs = require('fs');
const path = require('path');
const ResEdit = require('resedit');

function versionParts(version) {
  const parts = String(version || '0.0.0').split('.').map(v => {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? Math.min(n, 65535) : 0;
  }).slice(0, 4);
  while (parts.length < 4) parts.push(0);
  return parts;
}

exports.default = async function afterPackWindows(context) {
  if (context.electronPlatformName !== 'win32') return;

  const appInfo = context.packager.appInfo;
  const productName = appInfo.productName || 'Classroom Auto Turn-In';
  const exeName = `${appInfo.productFilename || productName}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
  const iconPath = path.join(__dirname, '..', 'assets', 'GoClassroom.ico');

  if (!fs.existsSync(exePath)) throw new Error(`Windows resource hook could not find packaged executable: ${exePath}`);
  if (!fs.existsSync(iconPath)) throw new Error(`Windows resource hook could not find icon: ${iconPath}`);

  const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const resources = ResEdit.NtExecutableResource.from(exe);

  const iconGroups = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries);
  if (!iconGroups.length) throw new Error('Packaged Electron executable has no icon-group resource to replace.');
  const iconGroup = iconGroups.find(g => Number(g.id) === 1) || iconGroups[0];
  const iconLanguage = Number(iconGroup.lang) || 1033;
  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(iconPath));
  if (!iconFile.icons || !iconFile.icons.length) throw new Error('Configured Windows icon contains no usable icon images.');
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    resources.entries,
    iconGroup.id,
    iconLanguage,
    iconFile.icons.map(item => item.data)
  );

  const versions = ResEdit.Resource.VersionInfo.fromEntries(resources.entries);
  if (!versions.length) throw new Error('Packaged Electron executable has no VERSIONINFO resource to update.');
  const [major, minor, patch, build] = versionParts(appInfo.version);
  for (const vi of versions) {
    vi.setFileVersion(major, minor, patch, build, 1033);
    vi.setProductVersion(major, minor, patch, build, 1033);
    vi.setStringValues(
      { lang: 1033, codepage: 1200 },
      {
        CompanyName: 'Classroom Auto Turn-In',
        FileDescription: 'Classroom Auto Turn-In',
        FileVersion: `${major}.${minor}.${patch}.${build}`,
        InternalName: exeName,
        LegalCopyright: 'Classroom Auto Turn-In',
        OriginalFilename: exeName,
        ProductName: productName,
        ProductVersion: `${major}.${minor}.${patch}.${build}`
      }
    );
    vi.outputToResourceEntries(resources.entries);
  }

  resources.outputResource(exe);
  const output = Buffer.from(exe.generate());
  if (output.length < 1024 * 1024) throw new Error('Resource-edited executable is unexpectedly small; refusing to continue.');
  fs.writeFileSync(exePath, output);

  // Parse our output again before installer creation. This catches a malformed PE
  // immediately instead of letting NSIS package a damaged executable.
  const verifyExe = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const verifyResources = ResEdit.NtExecutableResource.from(verifyExe);
  if (!ResEdit.Resource.IconGroupEntry.fromEntries(verifyResources.entries).length) {
    throw new Error('Windows icon verification failed after resource editing.');
  }
  if (!ResEdit.Resource.VersionInfo.fromEntries(verifyResources.entries).length) {
    throw new Error('Windows version-resource verification failed after resource editing.');
  }
  console.log(`Windows resources applied with pure-JS resedit: ${exePath}`);
};
