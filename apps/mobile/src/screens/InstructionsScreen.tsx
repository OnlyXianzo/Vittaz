import { useEffect, useState } from "react";
import {
  read_instructions,
  save_instructions,
} from "../assistant/custom_instructions";
import { Button, Card, Input, M, PageHeader, Screen } from "../ui";

export function InstructionsScreen({ onBack }: { onBack: () => void }) {
  const [text, set_text] = useState("");
  const [status, set_status] = useState("Loading saved instructions…");
  const [ready, set_ready] = useState(false);
  useEffect(() => {
    let active = true;
    void read_instructions()
      .then((value) => {
        if (active) {
          set_text(value);
          set_status("");
          set_ready(true);
        }
      })
      .catch(() => {
        if (active) {
          set_status(
            "Could not read saved instructions. Clear them or try again; they were not sent.",
          );
          set_ready(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  const save = async (value: string) => {
    try {
      await save_instructions(value);
      set_text(value.trim());
      set_status("Instructions saved on this device.");
    } catch {
      set_status(
        "Could not save. Use at most 1,200 characters and do not include sensitive information.",
      );
    }
  };
  return (
    <Screen>
      <PageHeader title="Custom instructions" onBack={onBack} />
      <M style={{ marginVertical: 12 }}>
        These preferences are stored on this device without encryption and sent
        with every question to your selected provider. Do not include secrets or
        personal information. They cannot grant permissions, change read-only
        tools or approve entries. The assistant may not always follow them.
      </M>
      <Card style={{ gap: 12 }}>
        <Input
          label="Custom instructions"
          value={text}
          onChangeText={set_text}
          multiline
          placeholder="For example, use concise answers."
          textStyle={{ height: 150, textAlignVertical: "top" }}
        />
        <Button
          label="Save instructions"
          disabled={!ready}
          onPress={() => {
            void save(text);
          }}
        />
        <Button
          label="Clear instructions"
          variant="ghost"
          disabled={!ready}
          onPress={() => {
            void save("");
          }}
        />
        {status ? <M>{status}</M> : null}
      </Card>
      <Button label="Back to chat" variant="ghost" onPress={onBack} />
    </Screen>
  );
}
