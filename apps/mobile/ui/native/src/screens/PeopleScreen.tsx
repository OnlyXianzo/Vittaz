import { View } from "react-native";
import { useApp } from "../store";
import { formatPaise } from "../domain";
import { colors } from "../theme";
import { B, Card, M, PageHeader, Row, Screen, T } from "../ui";

export function PeopleScreen() {
  const { state } = useApp();
  return (
    <Screen>
      <PageHeader large title="People" />
      <M style={{ marginTop: 8, marginHorizontal: 2, marginBottom: 12 }}>
        Receivables and payables in this synthetic preview.
      </M>
      {state.people.map((person) => (
        <Card key={person.id} style={{ marginTop: 12 }}>
          <Row>
            <Row start gap={12}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  backgroundColor: person.color,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <T size={16} weight="heavy" color="#fff">
                  {person.name.charAt(0)}
                </T>
              </View>
              <View>
                <B>{person.name}</B>
                <M>{person.relation}</M>
              </View>
            </Row>
            <B
              color={
                person.balancePaise > 0
                  ? colors.lime
                  : person.balancePaise < 0
                    ? colors.amber
                    : colors.text
              }
            >
              {person.balancePaise === 0
                ? "Settled"
                : formatPaise(Math.abs(person.balancePaise))}
            </B>
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
