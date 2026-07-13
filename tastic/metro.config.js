// Sentry serializer 로 감싸야 프로덕션 소스맵이 정상 업로드/디밍글링된다
// (getDefaultConfig 만 쓰면 스택트레이스가 난독화된 채로 올라감).
const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const { withNativeWind } = require("nativewind/metro");

const config = getSentryExpoConfig(__dirname);

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
