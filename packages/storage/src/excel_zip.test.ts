import { expect, test } from "vitest";
import { crc32, deflateRawSync } from "node:zlib";
import { validateWorkbookZip } from "./excel_zip.js";
// Synthetic ZIP32 encoder solely for preflight failure/descriptor tests.
function zip(
  data = Buffer.from("synthetic"),
  method = 8,
  descriptor = 0,
  extra = Buffer.alloc(0),
) {
  const name = Buffer.from("sheet.xml");
  const packed = method === 8 ? deflateRawSync(data) : data;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(descriptor ? 8 : 0, 6);
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(extra.length, 28);
  const crc = crc32(data);
  if (!descriptor) {
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
  }
  const tail = Buffer.alloc(descriptor);
  if (descriptor) {
    const start = descriptor === 16 ? 4 : 0;
    if (start) tail.writeUInt32LE(0x08074b50);
    tail.writeUInt32LE(crc, start);
    tail.writeUInt32LE(packed.length, start + 4);
    tail.writeUInt32LE(data.length, start + 8);
  }
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50);
  central.writeUInt16LE(descriptor ? 8 : 0, 8);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(packed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt16LE(extra.length, 30);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length + extra.length, 12);
  end.writeUInt32LE(
    local.length + name.length + extra.length + packed.length + tail.length,
    16,
  );
  return Buffer.concat([
    local,
    name,
    extra,
    packed,
    tail,
    central,
    name,
    extra,
    end,
  ]);
}

test("excel_zip_validates_store_deflate_empty_and_both_descriptor_formats", () => {
  for (const data of [
    zip(),
    zip(Buffer.from("synthetic"), 0),
    zip(Buffer.alloc(0)),
    zip(Buffer.from("synthetic"), 8, 12),
    zip(Buffer.from("synthetic"), 8, 16),
    zip(Buffer.from("synthetic"), 8, 0, Buffer.from([0x55, 0x54, 0, 0])),
  ])
    expect(() => validateWorkbookZip(data)).not.toThrow();
});

test("excel_zip_rejects_forged_expansion_unsupported_features_and_corruption", () => {
  const base = zip();
  const end = base.length - 22;
  const cd = base.readUInt32LE(end + 16);
  for (const [offset, value, size] of [
    [0, 0, 4],
    [end + 4, 1, 2],
    [end + 10, 129, 2],
    [cd, 0, 4],
    [cd + 10, 99, 2],
    [cd + 8, 1, 2],
    [cd + 24, 16777217, 4],
    [cd + 20, 999999, 4],
    [cd + 42, 2, 4],
    [14, 0, 4],
    [cd + 16, 0, 4],
    [18, 12, 4],
    [cd + 28, 1, 2],
    [end + 12, 2, 4],
  ] as const) {
    const mutated = Buffer.from(base);
    if (size === 2) mutated.writeUInt16LE(value, offset);
    else mutated.writeUInt32LE(value, offset);
    expect(() => validateWorkbookZip(mutated)).toThrow();
  }
  for (const data of [
    Buffer.alloc(0),
    zip(Buffer.from("x"), 8, 0, Buffer.from([1, 0, 0, 0])),
    zip(Buffer.from("x"), 8, 0, Buffer.from([2, 0, 9, 0])),
    zip(Buffer.alloc(17 * 1024 * 1024)),
  ])
    expect(() => validateWorkbookZip(data)).toThrow();
  const bomb = zip(Buffer.alloc(17 * 1024 * 1024));
  const bombCd = bomb.readUInt32LE(bomb.length - 6);
  bomb.writeUInt32LE(16, bombCd + 24);
  bomb.writeUInt32LE(16, 22);
  expect(() => validateWorkbookZip(bomb)).toThrow();
});
