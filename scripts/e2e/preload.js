'use strict';
// Loaded with NODE_OPTIONS=--require by the end-to-end gate only. It routes the
// engine's real Playwright browser traffic for Google hosts to the offline
// simulator. Nothing here is packaged into the teacher installer.
const path = require('path');
const stateFile = process.env.CATI_E2E_MOCK_STATE;
if (stateFile) {
  const engineDir = process.env.CATI_E2E_ENGINE_DIR || path.join(__dirname, '..', '..', 'engine');
  const pwPath = require.resolve('playwright-core', { paths: [engineDir] });
  const { chromium } = require(pwPath);
  const { installMockRoutes, readState } = require('./mock-google');
  const original = chromium.launchPersistentContext.bind(chromium);
  chromium.launchPersistentContext = async (userDataDir, options = {}) => {
    const extra = {};
    if (process.env.CATI_E2E_EXECUTABLE) extra.executablePath = process.env.CATI_E2E_EXECUTABLE;
    const args = [...(options.args || [])];
    if (process.platform === 'linux') args.push('--no-sandbox', '--disable-dev-shm-usage');
    const context = await original(userDataDir, { ...options, ...extra, args });
    try {
      require('fs').appendFileSync(`${stateFile}.launches.log`, `${JSON.stringify({ pid: process.pid, script: path.basename(process.argv[1] || ''), headless: options.headless === true, channel: options.channel || null })}\n`);
    } catch { /* diagnostics only */ }
    await installMockRoutes(context, stateFile);
    const auto = readState(stateFile).autoPick;
    if (auto) {
      // Simulates the teacher clicking the injected picker button in the real
      // browser window during the UI-level test.
      const timer = setInterval(async () => {
        for (const p of context.pages()) {
          try {
            const url = p.url();
            if (auto.classroom && /classroom\.google\.com\/h/.test(url)) await p.goto(`https://classroom.google.com/c/${readState(stateFile).course.id}`);
            if (auto.drive && /drive\.google\.com\/drive\/my-drive/.test(url)) await p.goto(`https://drive.google.com/drive/folders/${readState(stateFile).drive.folderId}`);
            for (const sel of ['#cati-classroom-picker button:first-of-type', '#cati-drive-picker button:first-of-type']) {
              const b = p.locator(sel);
              if (await b.count() && await b.isEnabled()) await b.click({ timeout: 1000 });
            }
          } catch { /* page may be navigating */ }
        }
      }, 900);
      context.on('close', () => clearInterval(timer));
    }
    return context;
  };
}
