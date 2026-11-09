import type { ReactNode } from "react";
import { Platform, Text, View } from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import { colors, fonts } from "./theme";

/**
 * A tiny, dependency-free Markdown renderer for assistant chat replies.
 *
 * The bounded QA loop returns Markdown (bold headers, bullet lists, inline
 * code, the occasional link). Rendering it as plain text showed literal `**`
 * and `-` markers on device. This renders the common subset the model emits
 * using React Native's nested <Text> inline styling — no third-party Markdown
 * library, so nothing new can break on Hermes and no prompt text leaves the
 * device through a renderer. Links render as their label only (read-only chat
 * never navigates), and snake_case tool names such as `get_month_summary` are
 * preserved because underscore emphasis is only honoured at word boundaries.
 */

type Span = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  link?: boolean;
};

const WORD = /[A-Za-z0-9_]/;
const SPACE = /\s/;
function is_word(ch: string | undefined): boolean {
  return ch !== undefined && WORD.test(ch);
}
function is_space(ch: string | undefined): boolean {
  return ch === undefined || SPACE.test(ch);
}

const MONOSPACE = Platform.select({
  ios: "Menlo",
  default: "monospace",
});

/** Tokenize a single line into styled inline spans. */
export function parse_inline(text: string): Span[] {
  const spans: Span[] = [];
  let buffer = "";
  let i = 0;
  const flush = () => {
    if (buffer) {
      spans.push({ text: buffer });
      buffer = "";
    }
  };
  while (i < text.length) {
    const ch = text[i];
    const prev = text[i - 1];

    // `inline code`
    if (ch === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i) {
        flush();
        spans.push({ text: text.slice(i + 1, end), code: true });
        i = end + 1;
        continue;
      }
    }

    // **bold** or __bold__
    if ((ch === "*" || ch === "_") && text[i + 1] === ch) {
      const delim = ch + ch;
      const end = text.indexOf(delim, i + 2);
      if (
        end > i + 2 &&
        !is_space(text[i + 2]) &&
        !is_space(text[end - 1]) &&
        (ch === "*" || (!is_word(prev) && !is_word(text[end + 2])))
      ) {
        flush();
        spans.push({ text: text.slice(i + 2, end), bold: true });
        i = end + 2;
        continue;
      }
    }

    // *italic* or _italic_
    if (ch === "*" || ch === "_") {
      const end = text.indexOf(ch, i + 1);
      if (
        end > i + 1 &&
        !is_space(text[i + 1]) &&
        !is_space(text[end - 1]) &&
        (ch === "*" || (!is_word(prev) && !is_word(text[end + 1])))
      ) {
        flush();
        spans.push({ text: text.slice(i + 1, end), italic: true });
        i = end + 1;
        continue;
      }
    }

    // [label](url) -> label only; read-only chat never navigates.
    if (ch === "[") {
      const close = text.indexOf("]", i + 1);
      if (close > i && text[close + 1] === "(") {
        const paren = text.indexOf(")", close + 2);
        if (paren > close + 1) {
          flush();
          spans.push({ text: text.slice(i + 1, close), link: true });
          i = paren + 1;
          continue;
        }
      }
    }

    buffer += ch;
    i += 1;
  }
  flush();
  return spans;
}

type Block =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; level: number; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "divider" };

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*(\d+)\.\s+(.*)$/;
const DIVIDER = /^\s*([-*_])\1{2,}\s*$/;

/** Group raw text into block-level elements. */
export function parse_blocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush_paragraph = () => {
    if (paragraph.length) {
      blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
      paragraph = [];
    }
  };
  const flush_list = () => {
    if (list) {
      blocks.push({ kind: "list", ordered: list.ordered, items: list.items });
      list = null;
    }
  };

  for (const line of lines) {
    if (!line.trim()) {
      flush_paragraph();
      flush_list();
      continue;
    }
    if (DIVIDER.test(line)) {
      flush_paragraph();
      flush_list();
      blocks.push({ kind: "divider" });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush_paragraph();
      flush_list();
      blocks.push({
        kind: "heading",
        level: heading[1].length,
        text: heading[2],
      });
      continue;
    }
    const ordered = ORDERED.exec(line);
    if (ordered) {
      flush_paragraph();
      if (!list || !list.ordered) {
        flush_list();
        list = { ordered: true, items: [] };
      }
      list.items.push(ordered[2]);
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet) {
      flush_paragraph();
      if (!list || list.ordered) {
        flush_list();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]);
      continue;
    }
    flush_list();
    paragraph.push(line.trim());
  }
  flush_paragraph();
  flush_list();
  return blocks;
}

const HEADING_SIZE: Record<number, number> = {
  1: 20,
  2: 18,
  3: 16,
  4: 15,
  5: 15,
  6: 15,
};

export function Markdown({
  text,
  size = 15,
  color = colors.text,
  style,
}: {
  text: string;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const line_height = Math.round(size * 1.5);
  const base: TextStyle = { color, fontSize: size, lineHeight: line_height };

  const render_spans = (line: string): ReactNode =>
    parse_inline(line).map((span, index) => {
      // Plain text stays a raw string so it does not create a duplicate Text
      // node with the same content as its parent.
      if (!span.bold && !span.italic && !span.code && !span.link) {
        return span.text;
      }
      const span_style: TextStyle = {
        ...(span.bold && { fontFamily: fonts.bold }),
        ...(span.italic && { fontStyle: "italic" as const }),
        ...(span.code && { fontFamily: MONOSPACE, color: colors.lime }),
        ...(span.link && {
          color: colors.lime,
          textDecorationLine: "underline" as const,
        }),
      };
      return (
        <Text key={index} style={span_style}>
          {span.text}
        </Text>
      );
    });

  return (
    <View style={[{ gap: 10 }, style]}>
      {parse_blocks(text).map((block, index) => {
        if (block.kind === "divider") {
          return (
            <View
              key={index}
              style={{
                height: 1,
                backgroundColor: colors.hairline,
                marginVertical: 2,
              }}
            />
          );
        }
        if (block.kind === "heading") {
          const heading_size = HEADING_SIZE[block.level] ?? size;
          return (
            <Text
              key={index}
              accessibilityRole="header"
              style={[
                base,
                {
                  fontFamily: fonts.bold,
                  fontSize: heading_size,
                  lineHeight: Math.round(heading_size * 1.4),
                },
              ]}
            >
              {render_spans(block.text)}
            </Text>
          );
        }
        if (block.kind === "list") {
          return (
            <View key={index} style={{ gap: 6 }}>
              {block.items.map((item, item_index) => (
                <View
                  key={item_index}
                  style={{ flexDirection: "row", alignItems: "flex-start" }}
                >
                  <Text style={[base, { fontFamily: fonts.bold }]}>
                    {block.ordered ? `${item_index + 1}.` : "•"}
                  </Text>
                  <Text style={[base, { flex: 1, marginLeft: 8 }]}>
                    {render_spans(item)}
                  </Text>
                </View>
              ))}
            </View>
          );
        }
        return (
          <Text key={index} style={base}>
            {render_spans(block.text)}
          </Text>
        );
      })}
    </View>
  );
}
