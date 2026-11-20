const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withRemoveSystemAlert(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const permissions = manifest.manifest['uses-permission'] || [];
    manifest.manifest['uses-permission'] = permissions.filter(
      (p) => p.$?.['android:name'] !== 'android.permission.SYSTEM_ALERT_WINDOW'
    );
    return config;
  });
};
