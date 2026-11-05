const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
// The preview's domain modules (reducer, selectors, money, answers, synthetic
// data) live one level up and are shared, not copied.
const sharedSource = path.resolve(projectRoot, "../src");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [
  ...new Set([...(config.watchFolders ?? []), sharedSource]),
];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];

module.exports = config;
