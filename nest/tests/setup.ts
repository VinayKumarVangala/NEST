import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Electron APIs for unit tests
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name) => `/mock/${name}`),
    on: vi.fn(),
    quit: vi.fn(),
    whenReady: vi.fn().mockResolvedValue(undefined),
  },
  BrowserWindow: vi.fn().mockImplementation(() => ({
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    webContents: {
      on: vi.fn(),
      executeJavaScript: vi.fn(),
    },
    show: vi.fn(),
    hide: vi.fn(),
    close: vi.fn(),
    destroy: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
  })),
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
  },
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    send: vi.fn(),
  },
  contextBridge: {
    exposeInMainWorld: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(),
  },
  safeStorage: {
    encryptString: vi.fn((s) => Buffer.from(s).toString('base64')),
    decryptString: vi.fn((s) => Buffer.from(s, 'base64').toString()),
    isEncryptionAvailable: vi.fn().mockReturnValue(true),
  },
  nativeImage: {
    createFromPath: vi.fn(),
  },
  Tray: vi.fn().mockImplementation(() => ({
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    on: vi.fn(),
    destroy: vi.fn(),
  })),
  Menu: {
    buildFromTemplate: vi.fn(),
  },
  nativeTheme: {
    themeSource: 'system',
    on: vi.fn(),
  },
}));

// Mock better-sqlite3
vi.mock('better-sqlite3', () => {
  const mockDb = {
    prepare: vi.fn().mockReturnValue({
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn(),
      iterate: vi.fn(),
    }),
    exec: vi.fn(),
    transaction: vi.fn((fn) => fn),
    close: vi.fn(),
    pragma: vi.fn(),
  };
  return {
    default: vi.fn(() => mockDb),
    __esModule: true,
  };
});

// Mock node:fs for tests
vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue(''),
    writeFileSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
    statSync: vi.fn().mockReturnValue({ isDirectory: () => true, isFile: () => false }),
  },
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue(''),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  statSync: vi.fn().mockReturnValue({ isDirectory: () => true, isFile: () => false }),
}));

// Mock node:path
vi.mock('node:path', () => ({
  default: {
    join: vi.fn((...args) => args.join('/')),
    resolve: vi.fn((...args) => args.join('/')),
    dirname: vi.fn((p) => p.split('/').slice(0, -1).join('/')),
    basename: vi.fn((p) => p.split('/').pop()),
    extname: vi.fn((p) => '.' + p.split('.').pop()),
  },
  join: vi.fn((...args) => args.join('/')),
  resolve: vi.fn((...args) => args.join('/')),
  dirname: vi.fn((p) => p.split('/').slice(0, -1).join('/')),
  basename: vi.fn((p) => p.split('/').pop()),
  extname: vi.fn((p) => '.' + p.split('.').pop()),
}));

// Mock node:child_process
vi.mock('node:child_process', () => ({
  spawn: vi.fn().mockReturnValue({
    pid: 12345,
    stdout: { on: vi.fn(), pipe: vi.fn() },
    stderr: { on: vi.fn(), pipe: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
  }),
  execSync: vi.fn().mockReturnValue(''),
}));

// Mock node:os
vi.mock('node:os', () => ({
  platform: vi.fn().mockReturnValue('win32'),
  arch: vi.fn().mockReturnValue('x64'),
  homedir: vi.fn().mockReturnValue('/mock/home'),
  tmpdir: vi.fn().mockReturnValue('/mock/tmp'),
  networkInterfaces: vi.fn().mockReturnValue({}),
}));

console.log = vi.fn();
console.warn = vi.fn();
console.error = vi.fn();
