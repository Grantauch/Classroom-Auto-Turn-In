'use strict';
// Loaded into the Electron main process by the UI end-to-end gate only
// (NODE_OPTIONS=--require). On a non-Windows test host it lets the real
// scheduler service drive the mock Windows Task Scheduler (a powershell.exe
// shim on PATH), and it hands engine helper processes the Google simulator
// preload instead of this file. Never packaged into the teacher installer.
const path = require('path');
const Module = require('module');

const enginePreload = path.join(__dirname, 'preload.js');
process.env.NODE_OPTIONS = `--require ${JSON.stringify(enginePreload)}`;

if (process.env.CATI_E2E_FAKE_WINDOWS_SCHEDULER === '1' && process.platform !== 'win32') {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    const loaded = originalLoad.apply(this, arguments);
    if (/[\\/]scheduler-service(?:\.js)?$/.test(request) && loaded && typeof loaded.createSchedulerService === 'function' && !loaded.__catiE2E) {
      const create = loaded.createSchedulerService;
      return { ...loaded, __catiE2E: true, createSchedulerService: options => create({ ...options, platform: 'win32' }) };
    }
    return loaded;
  };
}
