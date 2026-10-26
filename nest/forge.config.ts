import { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { VitePlugin } from '@electron-forge/plugin-vite';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as path from 'path';

/**
 * Compute SHA256 hash of firewall-helper.ps1 for runtime integrity verification.
 * This hash is embedded in the app and verified before executing the script.
 */
function getFirewallHelperHash(): string {
  const helperPath = 'resources/firewall-helper.ps1';
  if (fs.existsSync(helperPath)) {
    const content = fs.readFileSync(helperPath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }
  return '';
}

const FIREWALL_HELPER_HASH = getFirewallHelperHash();

/**
 * Custom plugin to inject the firewall helper hash into the WindowsAdapter at build time.
 * Replaces the placeholder '__FIREWALL_HELPER_HASH__' with the actual SHA256 hash.
 */
class InjectFirewallHashPlugin {
  name = 'inject-firewall-hash';

  async packageAfterExtract(config: any, buildPath: string) {
    const adapterPath = path.join(buildPath, 'main', 'os', 'windows', 'WindowsAdapter.js');
    if (fs.existsSync(adapterPath)) {
      let content = fs.readFileSync(adapterPath, 'utf8');
      const placeholder = '__FIREWALL_HELPER_HASH__';
      if (content.includes(placeholder)) {
        content = content.replace(new RegExp(placeholder, 'g'), FIREWALL_HELPER_HASH);
        fs.writeFileSync(adapterPath, content, 'utf8');
        console.log('[InjectFirewallHashPlugin] Injected firewall helper hash:', FIREWALL_HELPER_HASH);
      }
    }
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: 'resources/icon.ico',
    extraResource: [
      'resources/firewall-helper.ps1',
    ],
    // Embed the firewall helper hash for runtime integrity verification
    executableName: 'NEST',
    // Version from package.json is used automatically
    // Per-user install is Squirrel default (no config needed)
    // Code signing configuration via environment variables
    // CSC_LINK (URL to .pfx) and CSC_KEY_PASSWORD for CI/CD
    // Unsigned builds allowed when CSC_LINK is not set (dev)
    // See: https://www.electron.build/code-signing
    // CSC_LINK: URL to the code signing certificate (.pfx file) hosted on a file server
    // CSC_KEY_PASSWORD: Password for the code signing certificate
    // To build unsigned (dev): omit CSC_LINK
    // To build signed (CI/CD): set CSC_LINK and CSC_KEY_PASSWORD
    // Set product name for installer
    name: 'NEST',
    // Set product version from package.json (auto-populated)
    // Set copyright
    appCopyright: 'Copyright © 2024 NEST Contributors',
    // Set file version and product version from package.json
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: 'NEST',
      setupIcon: 'resources/icon.ico',
      loadingGif: 'resources/installer-loading.gif',
      noMsi: true,
      // Per-user install is Squirrel default (installs to %LOCALAPPDATA%)
      // Squirrel handles per-user by default, no admin required
      // Upgrade path: Squirrel handles delta updates, preserves user data
      // Uninstall: Squirrel offers cleanup but we add custom handler for firewall rules
      // Set the app name for the installer
      setupExe: 'NEST-Setup.exe',
      // Set the exe name
      exe: 'NEST.exe',
      // Options for Squirrel
      // setupExe is the output name
    }),
    new MakerZIP({}, ['win32']),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({
      // Automatically unpack native modules (better-sqlite3) for Electron
      // Required for native Node.js modules in asar archives
    }),
    new InjectFirewallHashPlugin(),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
      [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: true,
    }),
    new VitePlugin({
      build: [
        { entry: 'vite.main.config.ts', config: 'vite.main.config.ts' },
        { entry: 'vite.preload.config.ts', config: 'vite.preload.config.ts' },
        { entry: 'vite.renderer.config.ts', config: 'vite.renderer.config.ts' },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
};

export default config;