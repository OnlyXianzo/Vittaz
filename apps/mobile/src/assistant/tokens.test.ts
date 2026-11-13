import { describe_usage, format_tokens } from "./tokens";

describe("token usage presentation", () => {
  it("formats counts with grouping and never renders invalid input as NaN", () => {
    expect(format_tokens(0)).toBe("0");
    expect(format_tokens(1234)).toBe("1,234");
    expect(format_tokens(1234567)).toBe("1,234,567");
    // The QA loop only produces safe integers, but a provider that reports a
    // fractional or hostile number must not reach the UI as "NaN" or negative.
    expect(format_tokens(12.7)).toBe("12");
    expect(format_tokens(Number.NaN)).toBe("0");
    expect(format_tokens(-5)).toBe("0");
    expect(format_tokens(Number.POSITIVE_INFINITY)).toBe("0");
  });

  it("renders nothing before the first answer instead of claiming zero tokens", () => {
    expect(describe_usage(undefined, undefined)).toBeNull();
  });

  it("summarizes the last answer and the session total", () => {
    expect(describe_usage(234, 1234)).toBe("234 tokens · 1,234 this session");
    // A session total always accompanies a recorded answer, so a missing last
    // value is displayed as zero rather than hidden.
    expect(describe_usage(undefined, 500)).toBe("0 tokens · 500 this session");
    expect(describe_usage(12, undefined)).toBe("12 tokens · 0 this session");
  });
});
