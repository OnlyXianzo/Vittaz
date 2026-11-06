import { View } from "react-native";
import { useApp } from "../store";
import { formatPaise } from "../domain";
import {
  Avatar,
  B,
  Button,
  Card,
  Input,
  LinkButton,
  M,
  PageHeader,
  Row,
  Screen,
} from "../ui";

/**
 * The preview calls this screen "Quick ingestion"; the product wording agreed
 * with the user drops "ingestion", so the native title is "Add or ask".
 */
export function QuickScreen() {
  const { state, dispatch } = useApp();
  const recent = state.quickRecentIds
    .map((id) => state.transactions.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  return (
    <Screen
      footer={
        <Button
          label="Analyze"
          onPress={() => dispatch({ type: "analyze_quick" })}
        />
      }
    >
      <PageHeader
        title="Add or ask"
        onBack={() => dispatch({ type: "back" })}
      />
      <Card style={{ marginTop: 14 }}>
        <Input
          label="Transaction text"
          multiline
          value={state.quickInput}
          placeholder="Paste a bank SMS, or just ask: Who owes me? What did I spend this month?"
          onChangeText={(value) => dispatch({ type: "set_quick_input", value })}
          textStyle={{ height: 110, fontSize: 16, textAlignVertical: "top" }}
        />
      </Card>
      <M style={{ marginVertical: 10, marginHorizontal: 4 }}>
        Quick capture and assistant actions are not connected yet. Use Add
        transaction from Ledger to save a real entry to this device.
      </M>
      <Row style={{ marginTop: 20, marginBottom: 4 }}>
        <B>Recent inputs</B>
        <LinkButton
          label="See all"
          onPress={() => dispatch({ type: "navigate", screen: "inbox" })}
        />
      </Row>
      <Card style={{ paddingVertical: 6 }}>
        {recent.length === 0 ? (
          <M style={{ paddingVertical: 10 }}>
            Nothing yet. Anything you analyze shows up here.
          </M>
        ) : null}
        {recent.map((t) => (
          <Row key={t.id} style={{ paddingVertical: 9 }}>
            <Row start gap={12} style={{ flexShrink: 1 }}>
              <Avatar transaction={t} />
              <View style={{ flexShrink: 1 }}>
                <B size={15}>
                  {t.title}, {formatPaise(t.amountPaise)}
                </B>
                <M>
                  {t.day}, {t.time}
                </M>
              </View>
            </Row>
          </Row>
        ))}
      </Card>
      <M style={{ marginVertical: 14, marginHorizontal: 4 }}>
        No message is processed or sent anywhere. Your saved ledger stays on
        this device.
      </M>
    </Screen>
  );
}
