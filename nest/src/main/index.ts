/**
 * Main process entry point - App bootstrap, window, tray
 */
import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  nativeTheme,
  Tray,
  Menu,
  nativeImage,
  dialog,
} from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerHandlers } from './ipc/register';
import { setupEventBus } from './events';
import { initializeDatabase } from './db';
import { initializeLogging } from './services/logging';
import { ApplicationManager } from './services/application-manager';
import { PortManager } from './services/port-manager';
import { HealthMonitor } from './services/health-monitor';
import { NetworkManager } from './services/network-manager';
import { SecurityPolicyManager } from './services/security-policy';
import { DiagnosticsService } from './services/diagnostics';
import { createOsAdapter } from './os/os-adapter';
import { loadSettings, saveSettings } from './db';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let trayNoticeShown = false;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#ffffff',
      symbolColor: '#1e293b',
      height: 36,
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  // Block navigation to external URLs
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const parsedUrl = new URL(url);
    if (parsedUrl.origin !== 'file://' && parsedUrl.origin !== `http://localhost:5173`) {
      event.preventDefault();
    }
  });

  // Handle new window requests (external links)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const parsedUrl = new URL(url);
    if (['http:', 'https:'].includes(parsedUrl.protocol)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // CSP is also set via meta tag in index.html for defense in depth
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; ');

    const responseHeaders = details.responseHeaders;
    if (responseHeaders) {
      responseHeaders['Content-Security-Policy'] = [csp];
      responseHeaders['X-Content-Type-Options'] = ['nosniff'];
      responseHeaders['X-Frame-Options'] = ['DENY'];
      responseHeaders['Referrer-Policy'] = ['strict-origin-when-cross-origin'];
    }
    callback({ responseHeaders });
  });

  if (isDev) {
    await mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      const settings = loadSettings();
      if (settings.backgroundMode) {
        event.preventDefault();
        mainWindow?.hide();
        if (process.platform === 'darwin') {
          app.dock?.hide();
        }
        // Show one-time notice
        if (!trayNoticeShown && !settings.trayNoticeDismissed) {
          trayNoticeShown = true;
          dialog
            .showMessageBox(mainWindow!, {
              type: 'info',
              title: 'NEST running in background',
              message:
                'NEST has been minimized to the tray. Managed applications will continue running.',
              detail: 'Click the tray icon to open NEST or manage running apps.',
              buttons: ['OK'],
              checkboxLabel: "Don't show this again",
              checkboxChecked: false,
            })
            .then((result) => {
              if (result.checkboxChecked) {
                saveSettings({ trayNoticeDismissed: true });
              }
            });
        }
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray(): void {
  const iconPath = join(__dirname, '../../resources/icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('NEST');

  const updateTrayMenu = () => {
    if (!tray) return;
    const runningApps = applicationManager.getAllRunningApps();
    const template = [
      { label: 'Open NEST', click: () => mainWindow?.show() },
      { type: 'separator' as const },
      ...runningApps.map((app) => ({
        label: `${app.config.name} (${app.runtimeState.processState})`,
        submenu: [
          {
            label: app.runtimeState.processState === 'running' ? 'Stop' : 'Start',
            click: async () => {
              if (app.runtimeState.processState === 'running') {
                await applicationManager.stop(app.config.id);
              } else {
                await applicationManager.start(app.config.id);
              }
              updateTrayMenu();
            },
          },
          {
            label: 'Restart',
            enabled: app.runtimeState.processState === 'running',
            click: async () => {
              await applicationManager.restart(app.config.id);
              updateTrayMenu();
            },
          },
        ],
      })),
      { type: 'separator' as const },
      {
        label: 'Review Warnings',
        click: () => {
          mainWindow?.show();
          mainWindow?.webContents.send('navigate', '/diagnostics');
        },
      },
      { type: 'separator' as const },
      {
        label: 'Exit',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ];
    tray.setContextMenu(Menu.buildFromTemplate(template));
  };

  updateTrayMenu();
  eventBus.on('app.stateChanged', updateTrayMenu);
  tray.on('double-click', () => mainWindow?.show());
}

async function initializeApp(): Promise<void> {
  // Single instance lock
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit();
    return;
  }

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      mainWindow.show();
    }
  });

  // Initialize database
  await initializeDatabase();

  // Initialize logging
  initializeLogging();

  // Load settings
  const settings = loadSettings();

  // Apply startup-at-login setting (Windows)
  if (process.platform === 'win32') {
    const openAtLogin = settings.startupAtLogin === true;
    app.setLoginItemSettings({
      openAtLogin,
      path: process.execPath,
      args: [],
    });
  }

  // Initialize services
  applicationManager = new ApplicationManager(
    osAdapter,
    eventBus,
    settings,
    undefined,
    undefined,
    portManager
  );
  portManager = new PortManager(osAdapter, eventBus, applicationManager);
  healthMonitor = new HealthMonitor(osAdapter, eventBus, applicationManager);
  networkManager = new NetworkManager(osAdapter, eventBus);
  securityPolicyManager = new SecurityPolicyManager(
    osAdapter,
    eventBus,
    networkManager,
    applicationManager
  );
  diagnosticsService = new DiagnosticsService(
    osAdapter,
    applicationManager,
    portManager,
    healthMonitor,
    networkManager,
    securityPolicyManager
  );

  // Register IPC handlers
  registerHandlers(ipcMain, {
    applicationManager,
    portManager,
    healthMonitor,
    networkManager,
    securityPolicyManager,
    diagnosticsService,
    osAdapter,
    eventBus,
    settings,
    saveSettings,
  });

  // Create window and tray
  await createWindow();
  createTray();

  // Startup recovery
  await applicationManager.recover();

  // Start external app monitoring
  applicationManager.startExternalMonitoring();

  // Start monitors
  healthMonitor.start();
  networkManager.start();

  // Handle shutdown policy
  app.on('before-quit', async (event) => {
    // Stop external monitoring
    applicationManager.stopExternalMonitoring();

    if (!isQuitting) {
      isQuitting = true;
      const currentSettings = loadSettings();
      const policy = currentSettings.shutdownPolicy || 'ask';

      if (policy === 'ask') {
        event.preventDefault();

        const runningApps = applicationManager.getAllRunningApps();
        const appList = runningApps
          .map((a) => `  • ${a.config.name} (port ${a.config.port})`)
          .join('\n');

        const message =
          runningApps.length > 0
            ? `Managed applications are still running:\n${appList}\n\nWhat would you like to do?`
            : 'No managed applications are running. What would you like to do?';

        const response = await dialog.showMessageBox(mainWindow!, {
          type: 'question',
          title: 'NEST is running',
          message,
          buttons: ['Stop All Apps & Exit', 'Keep Apps Running & Exit', 'Cancel'],
          defaultId: runningApps.length > 0 ? 0 : 2,
          checkboxLabel: 'Remember my choice',
          checkboxChecked: false,
        });

        if (response.response === 2) {
          isQuitting = false;
          return;
        }

        if (response.checkboxChecked) {
          const newPolicy = response.response === 0 ? 'stop_all' : 'keep_running';
          saveSettings({ ...currentSettings, shutdownPolicy: newPolicy });
        }

        if (response.response === 0) {
          await applicationManager.stopAll();
        }
        // If response.response === 1 (keep_running), do nothing - apps keep running
        app.quit();
      } else if (policy === 'stop_all') {
        await applicationManager.stopAll();
      }
      // keep_running: do nothing, apps keep running
    }
  });

  // Theme change
  nativeTheme.on('updated', () => {
    mainWindow?.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors);
  });
}

// Initialize OS adapter after imports
const osAdapter = createOsAdapter();
const eventBus = setupEventBus();
let applicationManager: ApplicationManager;
let portManager: PortManager;
let healthMonitor: HealthMonitor;
let networkManager: NetworkManager;
let securityPolicyManager: SecurityPolicyManager;
let diagnosticsService: DiagnosticsService;

app.whenReady().then(initializeApp).catch(console.error);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle unhandled errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
