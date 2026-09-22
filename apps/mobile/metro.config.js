const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files in monorepo
config.watchFolders = [monorepoRoot];

// 2. Node modules paths
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// 3. Support package.json exports field
config.resolver.unstable_enablePackageExports = true;

// 4. Fallback extra mapping for core package
config.resolver.extraNodeModules = {
  '@streamforge/core': path.resolve(monorepoRoot, 'packages/core'),
};

module.exports = config;
