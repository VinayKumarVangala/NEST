import * as fs from 'fs';
import * as crypto from 'crypto';

/**
 * Compute SHA256 hash of firewall-helper.ps1 for runtime integrity verification.
 * This hash is embedded in the app and verified before executing the script.
 */
export function getFirewallHelperHash(): string {
  const helperPath = 'resources/firewall-helper.ps1';
  if (fs.existsSync(helperPath)) {
    const content = fs.readFileSync(helperPath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }
  return '';
}

export const FIREWALL_HELPER_HASH = getFirewallHelperHash();