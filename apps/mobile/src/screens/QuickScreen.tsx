import { useApp } from "../store";
import { Button, Card, Input, M, PageHeader, Screen } from "../ui";

/** Read-only Quick-to-Chat entry point; ledger writes remain on the Ledger screen. */
export function QuickScreen() {
  const { state, dispatch } = useApp();

  return (
    <Screen
      footer={
        <Button
          label="Ask Assistant"
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
          label="Question"
          multiline
          value={state.quickInput}
          placeholder="Ask a question about your ledger…"
          onChangeText={(value) => dispatch({ type: "set_quick_input", value })}
          textStyle={{ height: 110, fontSize: 16, textAlignVertical: "top" }}
        />
      </Card>
      <M style={{ marginVertical: 10, marginHorizontal: 4, lineHeight: 18 }}>
        Ask questions about your ledger here. To add an entry, use Add
        transaction from Ledger; the assistant cannot write to your ledger. Kilo
        Auto Free may route or log prompts, so use synthetic data only.
      </M>
      <M style={{ marginVertical: 14, marginHorizontal: 4, lineHeight: 18 }}>
        Only your question and data returned by read-only ledger tools are sent
        for a reply. Your ledger remains on this device; provider handling is
        outside Vittaz's control.
      </M>
    </Screen>
  );
}
