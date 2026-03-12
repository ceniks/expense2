const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, {
  input: "./global.css",
  // forceWriteFileSystem causes SHA-1 errors in clean build environments (e.g. Railway CI).
  // Only enable in development to fix iOS styling issues.
  forceWriteFileSystem: process.env.NODE_ENV !== "production",
});
