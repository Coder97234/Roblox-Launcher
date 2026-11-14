'use strict';

/**
 * Xenity desktop shell.
 *
 * The AppImage wraps the same React interface and the same Node service this
 * repository develops against: the service is started on a loopback port and
 * serves both the API and the compiled UI, so the window and its backend share
 * one origin exactly like the dev server does.
 */

const { app, BrowserWindow, Menu, shell, nativeImage } = require('electron');
const { spawn } = require('node:child_process');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const APP_DIR = path.join(__dirname);
const SERVER_ENTRY = path.join(APP_DIR, 'server', 'index.js');
const STATIC_DIR = path.join(APP_DIR, 'dist');
const DATA_DIR =
  process.env.XENITY_DATA_DIR || path.join(os.homedir(), '.local', 'share', 'xenity');

let server = null;
let window = null;

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function healthy(port) {
  return new Promise((resolve) => {
    const request = http.get(
      { host: '127.0.0.1', port, path: '/api/health', timeout: 1500 },
      (response) => {
        response.resume();
        resolve(response.statusCode === 200);
      },
    );
    request.on('error', () => resolve(false));
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await healthy(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

function startServer(port) {
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: APP_DIR,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(port),
      XENITY_DATA_DIR: DATA_DIR,
      XENITY_STATIC_DIR: STATIC_DIR,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => process.stdout.write(`[xenity] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[xenity] ${chunk}`));
  child.on('exit', (code) => {
    if (code !== 0 && window && !window.isDestroyed()) window.destroy();
  });
  return child;
}

async function createWindow() {
  const port = await freePort();
  server = startServer(port);

  const ready = await waitForServer(port);

  const icon = nativeImage.createFromPath(path.join(APP_DIR, 'xenity.png'));

  window = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#0b0710',
    autoHideMenuBar: true,
    title: 'Xenity',
    icon: icon.isEmpty() ? undefined : icon,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once('ready-to-show', () => window.show());

  // Everything that is not the launcher opens in the desktop browser instead.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${port}`)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  if (ready) {
    await window.loadURL(`http://127.0.0.1:${port}/`);
  } else {
    await window.loadURL(
      `data:text/html,${encodeURIComponent(
        '<body style="background:#0b0710;color:#e8e2f5;font-family:sans-serif;padding:48px">' +
          '<h1>Xenity could not start its service.</h1>' +
          '<p>The interface is fine, but the local service did not answer on its port.</p>' +
          '<p>Run the AppImage from a terminal to see the log.</p></body>',
      )}`,
    );
  }

  window.on('closed', () => {
    window = null;
  });
}

Menu.setApplicationMenu(null);

app.setName('Xenity');

app.whenReady().then(createWindow).catch((cause) => {
  console.error('[xenity] startup failed', cause);
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

app.on('before-quit', () => {
  if (server && !server.killed) server.kill();
});
