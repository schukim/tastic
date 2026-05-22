const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Add stability options for development
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => {
    return (req, res, next) => {
      // Add stability headers
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return middleware(req, res, next);
    };
  },
};

// Improve Fast Refresh stability
config.transformer = {
  ...config.transformer,
  unstable_allowRequireContext: true,
};

module.exports = withNativeWind(config, { input: "./global.css" });
