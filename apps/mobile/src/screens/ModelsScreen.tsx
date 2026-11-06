import { Pressable, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useApp } from "../store";
import type { ModelId } from "../domain";
import { colors } from "../theme";
import {
  B,
  Button,
  Card,
  M,
  PageHeader,
  Pill,
  Radio,
  Row,
  Screen,
  SectionLabel,
} from "../ui";

function ModelRow({
  model,
  title,
  subtitle,
  right,
  first = false,
  onSelect,
}: {
  model: ModelId;
  title: string;
  subtitle: string;
  right?: React.ReactNode;
  first?: boolean;
  onSelect: (model: ModelId) => void;
}) {
  const { state } = useApp();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={title}
      accessibilityState={{ checked: state.model === model }}
      onPress={() => onSelect(model)}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 10,
          minHeight: 56,
        },
        !first && { borderTopWidth: 1, borderTopColor: colors.hairline },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Radio on={state.model === model} />
      <View style={{ flex: 1 }}>
        <B size={15}>{title}</B>
        <M size={12} style={{ marginTop: 2 }}>
          {subtitle}
        </M>
      </View>
      {right}
    </Pressable>
  );
}

export function ModelsScreen() {
  const { state, dispatch } = useApp();
  const select = (model: ModelId) => dispatch({ type: "select_model", model });

  return (
    <Screen>
      <PageHeader
        title="Choose model"
        onBack={() => dispatch({ type: "back" })}
      />
      <Pressable
        accessibilityRole="radio"
        accessibilityLabel="Auto"
        accessibilityState={{ checked: state.model === "auto" }}
        onPress={() => select("auto")}
        style={({ pressed }) => [pressed && { opacity: 0.8 }]}
      >
        <Card
          tone="soft"
          style={{ marginTop: 14, borderColor: "rgba(184,242,60,0.5)" }}
        >
          <Row start gap={12} style={{ alignItems: "flex-start" }}>
            <Radio on={state.model === "auto"} />
            <View style={{ flex: 1 }}>
              <B>Auto</B>
              <M style={{ marginTop: 4, lineHeight: 18 }}>
                Adding entries runs on your phone. Hard questions go to your
                cloud key with names replaced and notes left out.
              </M>
            </View>
          </Row>
        </Card>
      </Pressable>

      <SectionLabel>On this phone</SectionLabel>
      <Card style={{ paddingVertical: 4 }}>
        <ModelRow
          first
          model="qwen-1.5b"
          title="Qwen 1.5B"
          subtitle="Downloaded, 1.1 GB, about 8 tokens a second"
          right={<Pill>Stays on phone</Pill>}
          onSelect={select}
        />
        <ModelRow
          model="qwen-3b"
          title="Qwen 3B"
          subtitle="2 GB, slower, better at questions"
          onSelect={select}
          right={
            <Button
              label="Download"
              variant="ghost"
              small
              onPress={() =>
                dispatch({
                  type: "show_toast",
                  message:
                    "Model downloads are not connected in this UI preview.",
                })
              }
            />
          }
        />
      </Card>

      <SectionLabel>Cloud, your keys</SectionLabel>
      <Card style={{ paddingVertical: 4 }}>
        <ModelRow
          first
          model="claude"
          title="Claude"
          subtitle="Preview only"
          onSelect={select}
        />
        <ModelRow
          model="gemini"
          title="Gemini"
          subtitle="Preview only"
          onSelect={select}
        />
        <ModelRow
          model="free"
          title="Free tier models"
          subtitle="May train on your data"
          right={<Pill tone="amber">Not private</Pill>}
          onSelect={select}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add API key"
          onPress={() =>
            dispatch({
              type: "show_toast",
              message: "Key storage is not connected in this UI preview.",
            })
          }
          style={({ pressed }) => [
            {
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingVertical: 10,
              minHeight: 56,
              borderTopWidth: 1,
              borderTopColor: colors.hairline,
            },
            pressed && { opacity: 0.7 },
          ]}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: colors.lime,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="plus" size={14} color={colors.limeDark} />
          </View>
          <B size={15}>Add API key</B>
        </Pressable>
      </Card>

      <M
        size={12}
        style={{ marginVertical: 14, marginHorizontal: 4, lineHeight: 17 }}
      >
        Preview only. No keys are stored and no cloud model is called.
      </M>
    </Screen>
  );
}
