const path = require('path');
const os = require('os');

// On Linux/Mac the plugin is installed in ~/.config/draw.io/plugins/.
// On Windows it lives in %APPDATA%\draw.io\plugins\.
// Building outputs directly there so DrawIO picks up changes after a restart.
const drawioPluginsDir = process.platform === 'win32'
  ? path.join(process.env.APPDATA, 'draw.io', 'plugins')
  : path.join(os.homedir(), '.config', 'draw.io', 'plugins');

module.exports = {
  entry: './src/index.js',
  output: {
    filename: 'properties-plugin.js',
    path: drawioPluginsDir,
  },
  // DrawIO's Electron shell enforces a strict CSP that blocks 'unsafe-eval'.
  // Webpack's default devtool in development mode ('eval') violates that policy.
  // 'inline-source-map' embeds the source map as a data-URI comment — no eval needed.
  devtool: 'inline-source-map',
  optimization: {
    minimize: false, // Keep readable for debugging; enable for production releases
  },
};
