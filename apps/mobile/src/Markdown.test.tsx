import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { Markdown } from "./Markdown";
import { fonts } from "./theme";

function flat(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.map(flat));
  }
  return (style ?? {}) as Record<string, unknown>;
}

describe("Markdown (assistant chat rendering)", () => {
  it("renders plain text unchanged", async () => {
    await render(<Markdown text="Just a plain answer." />);
    expect(screen.getByText("Just a plain answer.")).toBeTruthy();
  });

  it("renders **bold** without literal asterisks and applies the bold font", async () => {
    await render(<Markdown text="Hello **world** end" />);
    expect(screen.queryAllByText(/\*\*/)).toHaveLength(0);
    const bold = screen.getByText("world");
    expect(flat(bold.props.style).fontFamily).toBe(fonts.bold);
  });

  it("renders __bold__ without literal underscores", async () => {
    await render(<Markdown text="Hello __world__ end" />);
    expect(screen.queryAllByText(/__/)).toHaveLength(0);
    expect(flat(screen.getByText("world").props.style).fontFamily).toBe(
      fonts.bold,
    );
  });

  it("renders bullet lists without literal '- ' markers", async () => {
    await render(<Markdown text={"- first item\n- second item"} />);
    expect(screen.getByText("first item")).toBeTruthy();
    expect(screen.getByText("second item")).toBeTruthy();
    expect(screen.queryAllByText(/^- /)).toHaveLength(0);
  });

  it("renders ordered lists with their numbers", async () => {
    await render(<Markdown text={"1. alpha\n2. beta"} />);
    expect(screen.getByText("alpha")).toBeTruthy();
    expect(screen.getByText("beta")).toBeTruthy();
    expect(screen.getAllByText("1.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2.").length).toBeGreaterThan(0);
  });

  it("keeps snake_case tool names literal (no intraword underscore emphasis)", async () => {
    await render(<Markdown text="Used get_month_summary to total." />);
    expect(screen.getByText(/get_month_summary/)).toBeTruthy();
  });

  it("renders `inline code` without backticks", async () => {
    await render(<Markdown text={"Run `query_transactions` now"} />);
    expect(screen.queryAllByText(/`/)).toHaveLength(0);
    expect(screen.getByText("query_transactions")).toBeTruthy();
  });

  it("renders headings without leading #", async () => {
    await render(<Markdown text={"## Summary"} />);
    expect(screen.getByText("Summary")).toBeTruthy();
    expect(screen.queryAllByText(/^#/)).toHaveLength(0);
  });

  it("renders *italic* without literal asterisks", async () => {
    await render(<Markdown text="an *emphasized* word" />);
    expect(screen.queryAllByText(/\*/)).toHaveLength(0);
    expect(screen.getByText("emphasized")).toBeTruthy();
  });

  it("renders _italic_ at word boundaries without underscores", async () => {
    await render(<Markdown text="an _emphasized_ word" />);
    expect(screen.queryAllByText(/_/)).toHaveLength(0);
    expect(screen.getByText("emphasized")).toBeTruthy();
  });

  it("renders links as their label only (no URL or brackets)", async () => {
    await render(
      <Markdown text="See [the docs](https://example.com) please" />,
    );
    expect(screen.getByText("the docs")).toBeTruthy();
    expect(screen.queryAllByText(/example\.com/)).toHaveLength(0);
    expect(screen.queryAllByText(/\[/)).toHaveLength(0);
  });

  it("leaves an unclosed marker as literal text", async () => {
    await render(<Markdown text="2 * 3 and a ** stray" />);
    expect(screen.getByText(/2 \* 3 and a \*\* stray/)).toBeTruthy();
  });

  it("renders a horizontal rule as a divider without literal dashes", async () => {
    await render(<Markdown text={"above\n\n---\n\nbelow"} />);
    expect(screen.getByText("above")).toBeTruthy();
    expect(screen.getByText("below")).toBeTruthy();
    expect(screen.queryAllByText(/^---$/)).toHaveLength(0);
  });

  it("renders nothing meaningful for empty text", async () => {
    await render(<Markdown text="" />);
    expect(screen.queryAllByText(/\S/)).toHaveLength(0);
  });

  it("renders a full assistant markdown answer (bold headers + bullets) cleanly", async () => {
    const md = [
      "Based on the ledger data, there is no record of Who owing you anything.",
      "",
      "**What I checked:**",
      "- Verified Who exists in the system",
      "- Queried all transactions → **0 transactions found**",
      "",
      "**Conclusion:** Who has no outstanding obligations.",
    ].join("\n");
    await render(<Markdown text={md} />);
    expect(screen.queryAllByText(/\*\*/)).toHaveLength(0);
    expect(screen.getAllByText("What I checked:").length).toBeGreaterThan(0);
    expect(screen.getByText("0 transactions found")).toBeTruthy();
    expect(screen.getByText("Verified Who exists in the system")).toBeTruthy();
    expect(
      screen.getByText(/Who has no outstanding obligations\./),
    ).toBeTruthy();
  });
});
