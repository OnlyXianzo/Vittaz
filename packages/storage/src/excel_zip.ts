import { crc32, inflateRawSync } from "node:zlib";

function check(condition: boolean): void {
  if (!condition) throw new Error("Invalid ZIP container");
}
function extras(zip: Buffer, start: number, size: number): void {
  const end = start + size;
  while (start < end) {
    check(start + 4 <= end && zip.readUInt16LE(start) !== 1);
    start += 4 + zip.readUInt16LE(start + 2);
  }
  check(start === end);
}
/** Strict ZIP32 subset, never a decompressor: bounded Node zlib verifies actual expansion. */
export function validateWorkbookZip(zip: Buffer): void {
  const end = zip.lastIndexOf(Buffer.from([80, 75, 5, 6]));
  check(end >= 0 && end + 22 <= zip.length);
  const count = zip.readUInt16LE(end + 10);
  const central = zip.readUInt32LE(end + 16);
  check(
    zip.readUInt16LE(end + 4) === 0 &&
      zip.readUInt16LE(end + 6) === 0 &&
      zip.readUInt16LE(end + 8) === count &&
      count > 0 &&
      count <= 128 &&
      end + 22 + zip.readUInt16LE(end + 20) === zip.length &&
      central + zip.readUInt32LE(end + 12) === end,
  );
  let pos = central;
  let expanded = 0;
  const spans: { start: number; end: number }[] = [];
  const names = new Set<string>();
  for (let i = 0; i < count; i++) {
    check(pos + 46 <= end && zip.readUInt32LE(pos) === 0x02014b50);
    const flags = zip.readUInt16LE(pos + 8),
      method = zip.readUInt16LE(pos + 10);
    const crc = zip.readUInt32LE(pos + 16),
      packed = zip.readUInt32LE(pos + 20),
      size = zip.readUInt32LE(pos + 24);
    const nameLength = zip.readUInt16LE(pos + 28),
      extra = zip.readUInt16LE(pos + 30),
      comment = zip.readUInt16LE(pos + 32),
      local = zip.readUInt32LE(pos + 42);
    const next = pos + 46 + nameLength + extra + comment;
    check(
      next <= end &&
        !(flags & 0x2041) &&
        (method === 0 || method === 8) &&
        zip.readUInt16LE(pos + 34) === 0 &&
        size <= 16777216 - expanded,
    );
    const name = zip.subarray(pos + 46, pos + 46 + nameLength);
    const key = name.toString("hex");
    check(!names.has(key));
    names.add(key);
    extras(zip, pos + 46 + nameLength, extra);
    check(
      local + 30 <= central &&
        zip.readUInt32LE(local) === 0x04034b50 &&
        zip.readUInt16LE(local + 6) === flags &&
        zip.readUInt16LE(local + 8) === method &&
        zip.readUInt16LE(local + 26) === nameLength,
    );
    const localExtra = zip.readUInt16LE(local + 28);
    const dataStart = local + 30 + nameLength + localExtra;
    let dataEnd = dataStart + packed;
    check(
      dataEnd <= central &&
        zip.subarray(local + 30, local + 30 + nameLength).equals(name),
    );
    extras(zip, local + 30 + nameLength, localExtra);
    if (flags & 8) {
      const offset =
        dataEnd + (zip.readUInt32LE(dataEnd) === 0x08074b50 ? 4 : 0);
      check(
        zip.readUInt32LE(offset) === crc &&
          zip.readUInt32LE(offset + 4) === packed &&
          zip.readUInt32LE(offset + 8) === size,
      );
      dataEnd = offset + 12;
    } else
      check(
        zip.readUInt32LE(local + 14) === crc &&
          zip.readUInt32LE(local + 18) === packed &&
          zip.readUInt32LE(local + 22) === size,
      );
    const data = zip.subarray(dataStart, dataStart + packed);
    const decoded =
      method === 0
        ? data
        : inflateRawSync(data, { maxOutputLength: Math.max(1, size) });
    check(decoded.length === size && crc32(decoded) === crc);
    expanded += decoded.length;
    spans.push({ start: local, end: dataEnd });
    pos = next;
  }
  check(pos === end);
  spans.sort((a, b) => a.start - b.start);
  let cursor = 0;
  for (const span of spans) {
    check(span.start === cursor);
    cursor = span.end;
  }
  check(cursor === central);
}
