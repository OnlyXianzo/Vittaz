// Must be the first import: install a Web Crypto getRandomValues polyfill for
// Hermes before any module (notably LangChain) can call it. Without this, every
// assistant question fails at provider_call on device. See web_crypto.ts.
import "./src/assistant/web_crypto";

import { registerRootComponent } from "expo";

import App from "./App";

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
