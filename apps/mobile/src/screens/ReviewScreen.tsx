import { View } from "react-native";
import { useApp } from "../store";
import { formatPaise } from "../domain";
import {
  Avatar,
  B,
  Button,
  Card,
  EmptyState,
  M,
  PageHeader,
  Row,
  Screen,
  T,
} from "../ui";

export function ReviewScreen() {
  const { state, dispatch } = useApp();
  const transaction = state.transactions.find((t) => t.id === state.reviewId);

  if (!transaction)
    return (
      <Screen>
        <PageHeader
          title="Review transaction"
          onBack={() => dispatch({ type: "back" })}
        />
        <EmptyState
          title="Nothing to review"
          copy="This entry was already handled."
        />
      </Screen>
    );

  return (
    <Screen
      footer={
        <Row gap={12}>
          <Button
            label="Approve"
            style={{ flex: 1.3 }}
            onPress={() => dispatch({ type: "approve", id: transaction.id })}
          />
          <Button
            label="Reject"
            variant="ghost"
            style={{ flex: 1 }}
            onPress={() => dispatch({ type: "reject", id: transaction.id })}
          />
        </Row>
      }
    >
      <PageHeader
        title="Review transaction"
        onBack={() => dispatch({ type: "back" })}
      />
      <Card tone="soft" style={{ marginTop: 14 }}>
        <Row start gap={14}>
          <Avatar transaction={transaction} size={56} />
          <View style={{ flexShrink: 1 }}>
            <B size={18}>{transaction.title}</B>
            <T size={30} weight="heavy">
              {formatPaise(transaction.amountPaise)}
            </T>
            <M>
              {transaction.note}, {transaction.time}
            </M>
          </View>
        </Row>
      </Card>
      <Card style={{ marginTop: 12 }}>
        <M>Ledger impact</M>
        <Row style={{ marginTop: 10 }}>
          <B size={15}>{transaction.category}</B>
          <B>{formatPaise(transaction.amountPaise)}</B>
        </Row>
      </Card>
      <Card style={{ marginTop: 12 }}>
        <M>From notification</M>
        <T size={17} style={{ marginTop: 8, lineHeight: 24 }}>
          {transaction.source ?? transaction.note}
        </T>
      </Card>
    </Screen>
  );
}
