import { useCallback, useEffect } from "react";
import { BackHandler, Platform, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import {
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { AppProvider, useApp } from "./src/store";
import { BottomNav, NAV_SCREENS, Toast } from "./src/ui";
import { colors } from "./src/theme";
import { selectPending } from "./src/domain";
import { HomeScreen } from "./src/screens/HomeScreen";
import { InboxScreen } from "./src/screens/InboxScreen";
import { ReviewScreen } from "./src/screens/ReviewScreen";
import { LedgerScreen } from "./src/screens/LedgerScreen";
import { PeopleScreen } from "./src/screens/PeopleScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { AddScreen } from "./src/screens/AddScreen";
import { QuickScreen } from "./src/screens/QuickScreen";
import { ChatScreen } from "./src/screens/ChatScreen";
import { ModelsScreen } from "./src/screens/ModelsScreen";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";

/**
 * Navigation is the reducer's `screen` field, exactly as in the preview, so the
 * mock's flow is preserved: Home → "Add or ask by message" → message → chat.
 * The browser preview's desktop side panel is a preview affordance and is not
 * part of the app, so it has no counterpart here.
 */
function ScreenView() {
  const { state } = useApp();
  switch (state.screen) {
    case "inbox":
      return <InboxScreen />;
    case "review":
      return <ReviewScreen />;
    case "ledger":
      return <LedgerScreen />;
    case "people":
      return <PeopleScreen />;
    case "settings":
      return <SettingsScreen />;
    case "add":
      return <AddScreen />;
    case "quick":
      return <QuickScreen />;
    case "chat":
      return <ChatScreen />;
    case "models":
      return <ModelsScreen />;
    case "onboarding-welcome":
    case "onboarding-how":
    case "onboarding-ai":
      return <OnboardingScreen />;
    default:
      return <HomeScreen />;
  }
}

function Shell() {
  const { state, dispatch } = useApp();
  const showNav = NAV_SCREENS.includes(state.screen);
  const pendingCount = selectPending(state).length;

  useFonts({
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  const goBack = useCallback(() => {
    if (state.screen === "home" || state.screen.startsWith("onboarding"))
      return false;
    dispatch({ type: "back" });
    return true;
  }, [state.screen, dispatch]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", goBack);
    return () => sub.remove();
  }, [goBack]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScreenView />
      {showNav ? (
        <BottomNav current={state.screen} pendingCount={pendingCount} />
      ) : null}
      <Toast />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <Shell />
      </AppProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
