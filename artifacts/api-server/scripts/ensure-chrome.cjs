const { existsSync } = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const chromePaths = [
  '/home/runner/.cache/puppeteer/chrome/linux-146.0.7680.153/chrome-linux64/chrome',
  '/home/runner/.cache/puppeteer/chrome/linux-146.0.7680.90/chrome-linux64/chrome',
];

const found = chromePaths.find(p => existsSync(p));
if (found) {
  console.log('Chrome already cached at:', found);
  process.exit(0);
}

console.log('Chrome not found at expected paths, running puppeteer install...');
try {
  const puppeteerDir = path.resolve(__dirname, '..', 'node_modules', 'puppeteer');
  const installScript = path.join(puppeteerDir, 'lib', 'cjs', 'puppeteer', 'node', 'install.js');
  if (existsSync(installScript)) {
    execSync('node ' + installScript, { stdio: 'inherit', timeout: 180000 });
  } else {
    execSync('node install.mjs', { cwd: puppeteerDir, stdio: 'inherit', timeout: 180000 });
  }
  console.log('Chrome ready');
} catch (e) {
  console.warn('Chrome install warning (continuing):', e.message);
}
