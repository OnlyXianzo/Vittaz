import { expect, test } from "vitest";
import { runKeylessSmoke } from "../helpers/keyless_smoke.js";
test.runIf(process.env.VITTAZ_RUN_KEYLESS_LIVE === "1")(
  "@live keyless_free_reply_and_tool_json_shape",
  async (context) => {
    const result = await runKeylessSmoke();
    if (result.status === "rate_limited")
      context.skip("Public gateway throttled; no retries or fallback");
    expect(result).toEqual({ status: "ok", requests: 3 });
  },
);
