// Streaming store-only (no compression) ZIP writer. Unlike lib/zip.ts (which
// buffers the whole archive in memory — fine for a few small lyrics files), this
// emits the archive as a ReadableStream, piping each entry's body through without
// ever holding more than one chunk. That's what lets us bundle a release's audio
// masters/stems (potentially hundreds of MB) without OOMing the server.
//
// It uses ZIP data descriptors (general-purpose flag bit 3), so each entry's CRC
// and size are written AFTER its data — which means an entry body can be a stream
// whose length/CRC aren't known up front (e.g. an S3 object). Bit 11 (UTF-8) is
// set so non-ASCII filenames are handled. Store-only (method 0): no deflate, no
// zip64 (individual entries and the total must stay under 4 GB).

export type ZipStreamEntry = {
  /** Path within the archive, e.g. "Audio/01 Track.mp3". */
  name: string;
  /** File bytes: a stream (S3 object) or an in-memory buffer (synthesized text). */
  body: AsyncIterable<Uint8Array> | Uint8Array;
};

const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** Fold more bytes into a running CRC-32 (seed 0xffffffff; finalize with XOR). */
function crcUpdate(crc: number, bytes: Uint8Array): number {
  let c = crc;
  for (let i = 0; i < bytes.length; i++) {
    c = (c >>> 8) ^ (CRC_TABLE[(c ^ (bytes[i] ?? 0)) & 0xff] ?? 0);
  }
  return c >>> 0;
}

async function* toChunks(body: AsyncIterable<Uint8Array> | Uint8Array): AsyncIterable<Uint8Array> {
  if (body instanceof Uint8Array) {
    if (body.length) yield body;
    return;
  }
  for await (const chunk of body) yield chunk;
}

const SIG_LOCAL = 0x04034b50;
const SIG_DATA_DESC = 0x08074b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const FLAGS = 0x0008 | 0x0800; // bit 3 (data descriptor) + bit 11 (UTF-8 name)

async function* zipChunks(entries: ZipStreamEntry[]): AsyncIterable<Uint8Array> {
  const enc = new TextEncoder();
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name);

    // Local file header — CRC and sizes are 0 here (filled by the data descriptor).
    const lh = new Uint8Array(30 + nameBytes.length);
    const ld = new DataView(lh.buffer);
    ld.setUint32(0, SIG_LOCAL, true);
    ld.setUint16(4, 20, true); // version needed
    ld.setUint16(6, FLAGS, true);
    ld.setUint16(8, 0, true); // method 0 = store
    ld.setUint16(10, 0, true); // mod time
    ld.setUint16(12, 0, true); // mod date
    ld.setUint32(14, 0, true); // crc (deferred)
    ld.setUint32(18, 0, true); // compressed size (deferred)
    ld.setUint32(22, 0, true); // uncompressed size (deferred)
    ld.setUint16(26, nameBytes.length, true);
    ld.setUint16(28, 0, true); // extra length
    lh.set(nameBytes, 30);
    yield lh;

    let size = 0;
    let crc = 0xffffffff;
    for await (const chunk of toChunks(entry.body)) {
      size += chunk.length;
      crc = crcUpdate(crc, chunk);
      yield chunk;
    }
    crc = (crc ^ 0xffffffff) >>> 0;

    // Data descriptor (with signature): CRC + sizes now that the body is streamed.
    const dd = new Uint8Array(16);
    const dv = new DataView(dd.buffer);
    dv.setUint32(0, SIG_DATA_DESC, true);
    dv.setUint32(4, crc, true);
    dv.setUint32(8, size, true);
    dv.setUint32(12, size, true);
    yield dd;

    // Central directory record (buffered; emitted after all entries).
    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, SIG_CENTRAL, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, FLAGS, true);
    cv.setUint16(10, 0, true); // method
    cv.setUint16(12, 0, true); // mod time
    cv.setUint16(14, 0, true); // mod date
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // extra length
    cv.setUint16(32, 0, true); // comment length
    cv.setUint16(34, 0, true); // disk number
    cv.setUint16(36, 0, true); // internal attrs
    cv.setUint32(38, 0, true); // external attrs
    cv.setUint32(42, offset, true); // local header offset
    cd.set(nameBytes, 46);
    central.push(cd);

    offset += lh.length + size + dd.length;
  }

  let centralSize = 0;
  for (const c of central) {
    centralSize += c.length;
    yield c;
  }

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, SIG_EOCD, true);
  ev.setUint16(4, 0, true); // this disk
  ev.setUint16(6, 0, true); // central dir start disk
  ev.setUint16(8, entries.length, true); // entries on this disk
  ev.setUint16(10, entries.length, true); // total entries
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true); // central dir offset
  ev.setUint16(20, 0, true); // comment length
  yield eocd;
}

/** A store-only ZIP of `entries` as a ReadableStream, built lazily one entry at a
 *  time. Manual pull loop (not `ReadableStream.from`) for portability across Node
 *  versions. If a body stream errors mid-entry the stream aborts, so callers that
 *  can't tolerate a truncated archive should pre-validate the sources. */
export function createStoreZipStream(entries: ZipStreamEntry[]): ReadableStream<Uint8Array> {
  const iterator = zipChunks(entries)[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (e) {
        controller.error(e);
      }
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}

/** Exposed for unit tests: fold bytes into a CRC-32 the same way the writer does. */
export function _crc32(bytes: Uint8Array): number {
  return (crcUpdate(0xffffffff, bytes) ^ 0xffffffff) >>> 0;
}
