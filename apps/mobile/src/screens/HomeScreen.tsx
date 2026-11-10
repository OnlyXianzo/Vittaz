import { Pressable, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useApp } from "../store";
import { formatPaise, selectPending, selectSummary } from "../domain";
import { colors, fonts, gradients, radii } from "../theme";
import { B, Card, IconBtn, M, Row, Screen, Sparkline, T, TxnRow } from "../ui";

export function HomeScreen() {
  const { state, dispatch } = useApp();
  const summary = selectSummary(state);
  const pending = selectPending(state);
  const recent = state.transactions
    .filter((t) => t.status === "user_confirmed")
    .slice(0, 3);

  return (
    <Screen
      footer={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add or ask by message"
          onPress={() => dispatch({ type: "navigate", screen: "chat" })}
          style={({ pressed }) => [
            { borderRadius: radii.chip },
            pressed && { opacity: 0.8 },
          ]}
        >
          <LinearGradient
            colors={gradients.cta}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              height: 52,
              borderRadius: radii.chip,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingLeft: 16,
              paddingRight: 6,
            }}
          >
            <Ionicons name="sparkles" size={20} color={colors.limeDark} />
            <T
              size={15}
              weight="bold"
              color={colors.limeDark}
              style={{ flex: 1, fontFamily: fonts.bold }}
            >
              Add or ask by message
            </T>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: "rgba(11,26,7,0.14)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="mic" size={20} color={colors.limeDark} />
            </View>
          </LinearGradient>
        </Pressable>
      }
    >
      <Row style={{ minHeight: 44 }}>
        <Row start gap={10}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: radii.logo,
              backgroundColor: colors.lime,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <T size={16} weight="heavy" color={colors.limeDark}>
              V
            </T>
          </View>
          <T accessibilityRole="header" size={20} weight="bold">
            Vittaz
          </T>
        </Row>
        <Row>
          <IconBtn
            label="Settings"
            onPress={() => dispatch({ type: "navigate", screen: "settings" })}
          >
            <Feather name="settings" size={22} color={colors.text} />
          </IconBtn>
          <IconBtn
            label="Notifications"
            onPress={() => dispatch({ type: "navigate", screen: "inbox" })}
          >
            <Feather name="bell" size={22} color={colors.text} />
          </IconBtn>
        </Row>
      </Row>

      <Card tone="hero" style={{ marginTop: 14, minHeight: 210 }}>
        <M>Net spend this month</M>
        <T size={38} weight="heavy" style={{ marginTop: 2 }}>
          {formatPaise(summary.spentPaise)}
        </T>
        <T size={13} color={colors.lime}>
          12% lower than last month
        </T>
        <Sparkline />
      </Card>

      <Row gap={10} style={{ marginTop: 12 }}>
        {(
          [
            ["Cash", summary.cashPaise],
            ["Receivable", summary.receivablePaise],
            ["Payable", summary.payablePaise],
          ] as const
        ).map(([label, value]) => (
          <Card key={label} style={{ flex: 1, padding: 12 }}>
            <M>{label}</M>
            <B size={18} style={{ marginTop: 4 }}>
              {formatPaise(value)}
            </B>
          </Card>
        ))}
      </Row>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Pending review"
        onPress={() => dispatch({ type: "navigate", screen: "inbox" })}
        style={({ pressed }) => [
          {
            marginTop: 12,
            minHeight: 78,
            justifyContent: "center",
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.cardBorder,
            borderRadius: radii.card,
            padding: 16,
          },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Row start gap={12}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              backgroundColor: "#f5a524",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <T size={16} weight="heavy" color="#1a1000">
              {String(pending.length)}
            </T>
          </View>
          <View>
            <B size={15}>Pending review</B>
            <M>{pending.length} transactions need a check</M>
          </View>
        </Row>
      </Pressable>

      <Row style={{ marginTop: 18, marginBottom: 4 }}>
        <B>Recent activity</B>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="See all"
          onPress={() => dispatch({ type: "navigate", screen: "ledger" })}
          style={{ padding: 4 }}
        >
          <T size={13} color={colors.muted}>
            See all
          </T>
        </Pressable>
      </Row>
      {recent.map((t) => (
        <TxnRow
          key={t.id}
          transaction={t}
          showStatus={false}
          onPress={() => dispatch({ type: "navigate", screen: "ledger" })}
        />
      ))}
    </Screen>
  );
}
