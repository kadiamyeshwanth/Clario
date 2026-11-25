/**
 * Expo config plugin: allow plain-HTTP only to local development hosts.
 *
 * Android blocks cleartext HTTP in release builds (API 28+). That's right for
 * production (the API is https), but it also blocks testing a real build
 * against the API on your laptop over USB (`adb reverse tcp:5000 tcp:5000` →
 * http://localhost:5000). This adds a network security config that permits
 * cleartext ONLY for localhost / 127.0.0.1 / 10.0.2.2 — every other host still
 * requires HTTPS.
 */
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">localhost</domain>
    <domain includeSubdomains="false">127.0.0.1</domain>
    <domain includeSubdomains="false">10.0.2.2</domain>
  </domain-config>
</network-security-config>
`;

const withLocalCleartext = (config) => {
  config = withDangerousMod(config, ['android', async (cfg) => {
    const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'network_security_config.xml'), XML);
    return cfg;
  }]);
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (app) app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return cfg;
  });
};

module.exports = withLocalCleartext;
