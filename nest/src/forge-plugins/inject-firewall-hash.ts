import * as fs from 'fs';
import * as path from 'path';

import { FIREWALL_HELPER_HASH } from './firewall-hash';

/**
 * Custom plugin to inject the firewall helper hash into the WindowsAdapter at build time.
 * Replaces the placeholder '__FIREWALL_HELPER_HASH__' with the actual SHA256 hash.
 */
export class InjectFirewallHashPlugin {
  name = 'inject-firewall-hash';

  async packageAfterExtract(config: any, buildPath: string): Promise<void> {
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