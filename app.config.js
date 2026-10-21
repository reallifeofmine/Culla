// Build number comes from CI so every published APK installs over the previous one.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    versionCode: Number(process.env.CULLA_BUILD || 1),
  },
});
