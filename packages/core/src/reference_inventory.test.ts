import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("reference_inventory_maps_each_baseline_check_once", () => {
  const inventory = readFileSync(
    new URL("../../../docs/reference_inventory.md", import.meta.url),
    "utf8",
  );
  const ids = [...inventory.matchAll(/^\| `(baseline_[a-z0-9_]+)`\s+\|/gm)].map(
    (match) => match[1],
  );
  const expected = [
    ...[4, 8, 6, 6, 6].flatMap((count, layer) =>
      Array.from(
        { length: count },
        (_, index) => `baseline_${layer}_${index + 1}`,
      ),
    ),
    "baseline_headless_flows",
  ];
  expect([...ids].sort()).toEqual([...expected].sort());
  for (const line of inventory
    .split("\n")
    .filter((line) => line.startsWith("| `baseline_"))) {
    expect(line).toMatch(/`(?:packages|tests)\/[a-zA-Z0-9_/.]+\.test\.ts`/);
    expect(line).toMatch(/pending|ported/);
  }
});
