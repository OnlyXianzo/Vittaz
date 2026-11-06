const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
// The preview's domain modules (reducer, selectors, money, answers, synthetic
// data) live in the sibling web preview and are shared, not copied.
const sharedSource = path.resolve(projectRoot, "./ui/src");
// S34: the framework-free domain core is consumed as source, not as a built
// package, so the app and the backend share one copy of the logic.
const coreSource = path.resolve(projectRoot, "../../packages/core/src");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [
  ...new Set([...(config.watchFolders ?? []), sharedSource, coreSource]),
];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];
// `@vittaz/core` is a workspace source package with no installed entry point in
// this standalone app, so map the bare specifier at the resolver level.
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  "@vittaz/core": coreSource,
};

// `packages/core` is written for NodeNext and imports "./x.js" while shipping
// "./x.ts". Metro has no extension substitution, so remap relative .js
// specifiers to the TypeScript source when the .js file does not exist.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolveRequest ?? context.resolveRequest;
  if (moduleName.startsWith(".") && moduleName.endsWith(".js")) {
    try {
      return resolve(context, moduleName.slice(0, -3), platform);
    } catch {
      // Fall through to the original specifier.
    }
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
