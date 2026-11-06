import { View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useApp } from "../store";
import {
  formatPaise,
  groupByDay,
  selectLedger,
  selectPending,
  selectSummary,
} from "../domain";
import type { LedgerFilter } from "../domain";
import { colors } from "../theme";
import {
  B,
  Card,
  Chip,
  EmptyState,
  IconBtn,
  Input,
  M,
  PageHeader,
  Row,
  Screen,
  TxnRow,
} from "../ui";

const FILTERS: Array<{ id: LedgerFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "unverified", label: "Unverified" },
];

export function LedgerScreen() {
  const { state, dispatch } = useApp();
  const groups = groupByDay(selectLedger(state));
  const summary = selectSummary(state);
  const pending = selectPending(state).length;

  return (
    <Screen>
      <PageHeader
        large
        title="Ledger"
        right={
          <Row gap={4}>
            <IconBtn
              label="Search"
              onPress={() => dispatch({ type: "toggle_search" })}
            >
              <Feather name="search" size={22} color={colors.text} />
            </IconBtn>
            <IconBtn
              label="Add transaction"
              variant="fab"
              onPress={() => dispatch({ type: "navigate", screen: "add" })}
            >
              <Feather name="plus" size={22} color={colors.limeDark} />
            </IconBtn>
          </Row>
        }
      />
      {state.searchOpen ? (
        <Input
          label="Search ledger"
          placeholder="Search title, category, person…"
          value={state.ledgerSearch}
          onChangeText={(value) =>
            dispatch({ type: "set_ledger_search", value })
          }
          style={{
            height: 44,
            marginTop: 10,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.cardBorder,
            backgroundColor: colors.card,
            paddingHorizontal: 14,
          }}
        />
      ) : null}
      <Row start gap={8} style={{ marginTop: 10, flexWrap: "wrap" }}>
        {FILTERS.map((f) => (
          <Chip
            key={f.id}
            label={f.id === "unverified" ? `${f.label} ${pending}` : f.label}
            selected={state.ledgerFilter === f.id}
            onPress={() =>
              dispatch({ type: "set_ledger_filter", filter: f.id })
            }
          />
        ))}
      </Row>
      <Card tone="hero" style={{ marginTop: 10, paddingVertical: 12 }}>
        <M size={12}>This month</M>
        <Row gap={8} style={{ marginTop: 6 }}>
          <View style={{ flex: 1 }}>
            <M size={12}>Spent</M>
            <B size={17}>{formatPaise(summary.spentPaise)}</B>
          </View>
          <View style={{ flex: 1 }}>
            <M size={12}>Received</M>
            <B size={17} color={colors.lime}>
              {formatPaise(summary.receivedPaise)}
            </B>
          </View>
          <View style={{ flex: 1 }}>
            <M size={12}>Cash in hand</M>
            <B size={17}>{formatPaise(summary.cashPaise)}</B>
          </View>
        </Row>
      </Card>

      {groups.length === 0 ? (
        <EmptyState
          title="No entries"
          copy="Try another filter or add a transaction."
        />
      ) : null}
      {groups.map((group) => (
        <View key={group.day}>
          <M style={{ marginTop: 14, marginHorizontal: 2, marginBottom: 2 }}>
            {group.day}
          </M>
          {group.rows.map((t) => (
            <TxnRow
              key={t.id}
              transaction={t}
              onPress={
                t.status === "user_confirmed"
                  ? undefined
                  : () => dispatch({ type: "open_review", id: t.id })
              }
            />
          ))}
        </View>
      ))}
    </Screen>
  );
}
