// Must stay the first import: installs a Web Crypto getRandomValues shim for
// Hermes before any other module is evaluated. See web_crypto.ts for why it is
// kept now that the LangChain adapter (its original cause) is gone.
import "./src/assistant/web_crypto";

import { registerRootComponent } from "expo";

import App from "./App";

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
