import { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { VitePlugin } from '@electron-forge/plugin-vite';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: 'resources/icon.ico',
    extraResource: ['resources/firewall-helper.ps1'],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: 'NEST',
      setupIcon: 'resources/icon.ico',
      loadingGif: 'resources/installer-loading.gif',
      noMsi: true,
    }),
    new MakerZIP({}, ['win32']),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
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