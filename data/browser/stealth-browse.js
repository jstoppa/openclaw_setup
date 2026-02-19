#!/usr/bin/env node
// stealth-browse.js — Stealth Playwright browser for bot-protected sites.
// Called by OpenClaw agent via shell when the built-in browser tool gets 403s.
//
// Usage:
//   node stealth-browse.js --url "https://x.com" --action screenshot --output /tmp/shot.png
//
// Output: JSON to stdout. Diagnostics to stderr.

'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('/app/node_modules/playwright-core');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PROFILE_DIR = '/home/node/.openclaw/browser/stealth/user-data';
const CHROME_PATH = '/home/node/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome';

const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-blink-features=AutomationControlled',
  '--disable-features=AutomationControlled,EnableAutomation',
  '--enable-features=NetworkService,NetworkServiceInProcess',
  '--disable-infobars',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-ipc-flooding-protection',
  '--disable-breakpad',
  '--disable-component-extensions-with-background-pages',
  '--disable-domain-reliability',
  '--disable-hang-monitor',
  '--disable-notifications',
  '--disable-popup-blocking',
  '--disable-extensions',
  '--disable-plugins',
  '--disable-sync',
  '--disable-background-networking',
  '--disable-component-update',
  '--metrics-recording-only',
  '--force-color-profile=srgb',
  '--lang=en-US,en',
  '--hide-scrollbars',
  '--window-size=1920,1080',
  '--no-first-run',
  '--no-default-browser-check',
];

const EXTRA_HEADERS = {
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Sec-Ch-Ua': '"Chromium";v="145", "Google Chrome";v="145", "Not-A.Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Linux"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  'Cache-Control': 'max-age=0',
};

const STEALTH_INIT_SCRIPT = `
  // 1. Delete navigator.webdriver
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

  // 2. Mock window.chrome
  window.chrome = {
    runtime: {
      onMessage: { addListener: function(){}, removeListener: function(){} },
      sendMessage: function(){},
      connect: function(){},
    },
    loadTimes: function() { return {}; },
    csi: function() { return {}; },
    app: {},
  };

  // 3. Mock navigator.plugins (non-empty)
  Object.defineProperty(navigator, 'plugins', {
    get: function() {
      var plugins = [
        {
          name: 'Chrome PDF Plugin',
          filename: 'internal-pdf-viewer',
          description: 'Portable Document Format',
          length: 1,
          0: { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format' },
        },
        {
          name: 'Chrome PDF Viewer',
          filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
          description: '',
          length: 1,
          0: { type: 'application/pdf', suffixes: 'pdf', description: '' },
        },
        {
          name: 'Native Client',
          filename: 'internal-nacl-plugin',
          description: 'Native Client Executable',
          length: 1,
          0: { type: 'application/x-nacl', suffixes: '', description: 'Native Client Executable' },
        },
      ];
      plugins.refresh = function() {};
      return plugins;
    },
  });

  // 4. Mock navigator.languages
  Object.defineProperty(navigator, 'languages', {
    get: function() { return ['en-US', 'en']; },
  });

  // 5. Mock permissions API
  var originalQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
  window.navigator.permissions.query = function(params) {
    if (params.name === 'notifications') {
      return Promise.resolve({ state: Notification.permission });
    }
    return originalQuery(params);
  };

  // 6. Mock Notification
  if (!window.Notification) {
    window.Notification = { permission: 'default' };
  }

  // 7. Fake WebGL vendor/renderer
  var getParamOrig = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(param) {
    if (param === 37445) return 'Intel Inc.';
    if (param === 37446) return 'Intel(R) Iris(TM) Plus Graphics';
    return getParamOrig.call(this, param);
  };
  if (typeof WebGL2RenderingContext !== 'undefined') {
    var getParam2Orig = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function(param) {
      if (param === 37445) return 'Intel Inc.';
      if (param === 37446) return 'Intel(R) Iris(TM) Plus Graphics';
      return getParam2Orig.call(this, param);
    };
  }
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const value = (i + 1 < argv.length && !argv[i + 1].startsWith('--'))
        ? argv[++i]
        : true;
      args[key] = value;
    }
  }
  return args;
}

function log(msg) {
  process.stderr.write(`[stealth-browse] ${msg}\n`);
}

function cleanSingletonLocks(profileDir) {
  for (const f of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    try { fs.unlinkSync(path.join(profileDir, f)); } catch (_) { /* ignore */ }
  }
}

function outputResult(result) {
  process.stdout.write(JSON.stringify(result) + '\n');
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function executeAction(page, action, args) {
  switch (action) {
    case 'screenshot': {
      const outPath = args.output || `/tmp/stealth-${Date.now()}.png`;
      const dir = path.dirname(outPath);
      fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: outPath, fullPage: false });
      return { screenshot_path: outPath };
    }

    case 'content': {
      const text = await page.evaluate(() => document.body.innerText);
      return { content_text: (text || '').substring(0, 50000) };
    }

    case 'click': {
      if (!args.selector) throw new Error('--selector required for click action');
      await page.click(args.selector, { timeout: 10000 });
      await page.waitForLoadState('networkidle').catch(() => {});
      return {};
    }

    case 'type': {
      if (!args.selector) throw new Error('--selector required for type action');
      if (!args.text) throw new Error('--text required for type action');
      await page.click(args.selector, { timeout: 10000 });
      await page.fill(args.selector, args.text);
      return {};
    }

    case 'scroll': {
      const pixels = parseInt(args.pixels || '0', 10);
      if (pixels) {
        await page.evaluate((px) => window.scrollBy(0, px), pixels);
      } else {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      }
      return {};
    }

    default:
      throw new Error(`Unknown action: ${action}. Use: screenshot, content, click, type, scroll`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.url) {
    throw new Error('--url is required');
  }

  const profileDir = args.profile || DEFAULT_PROFILE_DIR;
  fs.mkdirSync(profileDir, { recursive: true });
  cleanSingletonLocks(profileDir);

  log(`Launching browser (profile: ${profileDir})`);

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    executablePath: CHROME_PATH,
    args: BROWSER_ARGS,
    bypassCSP: true,
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.7632.6 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'Europe/London',
    colorScheme: 'light',
    geolocation: { latitude: 51.4067, longitude: -0.0186 },
    permissions: ['geolocation'],
    ignoreHTTPSErrors: true,
    hasTouch: false,
    javaScriptEnabled: true,
    acceptDownloads: false,
  });

  let page;
  try {
    // Inject stealth script before any navigation
    await context.addInitScript(STEALTH_INIT_SCRIPT);

    // Set extra HTTP headers
    const pages = context.pages();
    page = pages.length > 0 ? pages[0] : await context.newPage();
    await page.setExtraHTTPHeaders(EXTRA_HEADERS);

    // Navigate
    const timeout = parseInt(args.timeout || '30000', 10);
    log(`Navigating to ${args.url}`);
    await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout });

    // Wait after load
    const waitMs = parseInt(args.wait || '2000', 10);
    if (waitMs > 0) {
      await page.waitForTimeout(waitMs);
    }

    // Execute action
    const action = args.action || 'screenshot';
    log(`Executing action: ${action}`);
    const actionResult = await executeAction(page, action, args);

    // Build result
    const result = {
      success: true,
      url: page.url(),
      title: await page.title(),
      screenshot_path: actionResult.screenshot_path || null,
      content_text: actionResult.content_text || null,
      error: null,
    };

    outputResult(result);
  } finally {
    await context.close().catch(() => {});
  }
}

// Hard timeout: kill process after 60 seconds no matter what
const hardTimeout = setTimeout(() => {
  log('Hard timeout reached (60s), forcing exit');
  process.exit(2);
}, 60000);
hardTimeout.unref();

main().catch((err) => {
  log(`Error: ${err.message}`);
  outputResult({
    success: false,
    url: null,
    title: null,
    screenshot_path: null,
    content_text: null,
    error: err.message,
  });
  process.exit(1);
});
