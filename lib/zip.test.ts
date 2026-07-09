import { describe, it, expect } from "vitest";
import { crc32, storeZip } from "@/lib/zip";

const u8 = (s: string) => new TextEncoder().encode(s);

describe("crc32", () => {
  it("matches known CRC-32 values", () => {
    expect(crc32(u8(""))).toBe(0);
    expect(crc32(u8("hello")).toString(16)).toBe("3610a686");
  });
});

describe("storeZip", () => {
  it("empty archive is just a 22-byte EOCD", () => {
    const z = storeZip([]);
    expect(z.length).toBe(22);
    expect(z.readUInt32LE(0)).toBe(0x06054b50); // EOCD signature
    expect(z.readUInt16LE(10)).toBe(0); // total entries
  });

  it("one entry: local header, stored size/crc, filename, EOCD count", () => {
    const z = storeZip([{ name: "a.lrc", data: "hello" }]);
    expect(z.readUInt32LE(0)).toBe(0x04034b50); // local file header
    expect(z.readUInt16LE(8)).toBe(0); // method 0 = store
    expect(z.readUInt32LE(14)).toBe(crc32(u8("hello")));
    expect(z.readUInt32LE(18)).toBe(5); // compressed size
    expect(z.readUInt32LE(22)).toBe(5); // uncompressed size
    expect(z.subarray(30, 35).toString("utf8")).toBe("a.lrc");
    expect(z.subarray(35, 40).toString("utf8")).toBe("hello");
    // EOCD is the last 22 bytes; entry count = 1.
    expect(z.readUInt16LE(z.length - 12)).toBe(1);
  });

  it("two entries → EOCD count 2", () => {
    const z = storeZip([{ name: "1.lrc", data: "a" }, { name: "2.lrc", data: "bb" }]);
    expect(z.readUInt16LE(z.length - 12)).toBe(2);
  });
});
