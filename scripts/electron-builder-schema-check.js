const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

// Validate against the schema installed with the exact pinned electron-builder
// dependency. This prevents documentation/version drift from reaching step 6.
const schema = require('app-builder-lib/scheme.json');
const validatorModule = require('@develar/schema-utils');
const validate = validatorModule.default || validatorModule.validate || validatorModule;

if (typeof validate !== 'function') {
  throw new Error('Could not load electron-builder schema validator.');
}

validate(schema, pkg.build || {}, { name: 'electron-builder' });
console.log(`electron-builder ${pkg.devDependencies['electron-builder']} configuration schema check passed.`);
