import { describe, it, expect } from "vitest";
import { createStoreZipStream, _crc32, type ZipStreamEntry } from "@/lib/zip-stream";

const u8 = (s: string) => new TextEncoder().encode(s);

async function collect(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) parts.push(value);
  }
  return Buffer.concat(parts.map((p) => Buffer.from(p)));
}

// A body that arrives in several chunks — proves the incremental CRC/size accounting.
async function* chunked(...pieces: string[]): AsyncIterable<Uint8Array> {
  for (const p of pieces) yield u8(p);
}

describe("_crc32", () => {
  it("matches known CRC-32 values", () => {
    expect(_crc32(u8(""))).toBe(0);
    expect(_crc32(u8("hello")).toString(16)).toBe("3610a686");
  });
});

describe("createStoreZipStream", () => {
  it("single entry: local header, deferred crc, data descriptor, EOCD count", async () => {
    const z = await collect(createStoreZipStream([{ name: "a.txt", body: u8("hello") }]));
    expect(z.readUInt32LE(0)).toBe(0x04034b50); // local file header
    expect(z.readUInt16LE(6)).toBe(0x0808); // flags: data descriptor + UTF-8
    expect(z.readUInt16LE(8)).toBe(0); // store
    expect(z.readUInt32LE(14)).toBe(0); // crc deferred to the data descriptor
    expect(z.readUInt32LE(18)).toBe(0); // size deferred
    expect(z.subarray(30, 35).toString("utf8")).toBe("a.txt");
    expect(z.subarray(35, 40).toString("utf8")).toBe("hello");
    // data descriptor immediately after the 5 body bytes
    expect(z.readUInt32LE(40)).toBe(0x08074b50);
    expect(z.readUInt32LE(44)).toBe(_crc32(u8("hello")));
    expect(z.readUInt32LE(48)).toBe(5); // compressed size
    expect(z.readUInt32LE(52)).toBe(5); // uncompressed size
    // EOCD is the final 22 bytes; total-entries at len-12
    expect(z.readUInt32LE(z.length - 22)).toBe(0x06054b50);
    expect(z.readUInt16LE(z.length - 12)).toBe(1);
  });

  it("streamed multi-chunk body: descriptor records the full size + CRC", async () => {
    const z = await collect(createStoreZipStream([{ name: "b.txt", body: chunked("foo", "bar", "baz") }]));
    // body starts at 30 + name(5) = 35, length 9
    expect(z.subarray(35, 44).toString("utf8")).toBe("foobarbaz");
    expect(z.readUInt32LE(44)).toBe(0x08074b50); // descriptor right after 9 bytes
    expect(z.readUInt32LE(48)).toBe(_crc32(u8("foobarbaz")));
    expect(z.readUInt32LE(52)).toBe(9);
  });

  it("empty archive is just a 22-byte EOCD with 0 entries", async () => {
    const z = await collect(createStoreZipStream([]));
    expect(z.length).toBe(22);
    expect(z.readUInt32LE(0)).toBe(0x06054b50);
    expect(z.readUInt16LE(10)).toBe(0);
  });

  it("multiple entries → EOCD count matches", async () => {
    const entries: ZipStreamEntry[] = [
      { name: "1.txt", body: u8("a") },
      { name: "2.txt", body: u8("bb") },
      { name: "3.txt", body: u8("ccc") },
    ];
    const z = await collect(createStoreZipStream(entries));
    expect(z.readUInt16LE(z.length - 12)).toBe(3);
  });
});
