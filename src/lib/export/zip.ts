/**
 * A tiny ZIP writer (no compression, "stored" entries) - all .docx and .epub
 * need. Pure and dependency-free.
 *
 * Entries are written in the order given; EPUB requires "mimetype" first.
 */

export type ZipFile = { name: string; data: string | Uint8Array };

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export function makeZip(files: ZipFile[], now: Date = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const { time, date } = dosDateTime(now);

  type Entry = { name: Uint8Array; data: Uint8Array; crc: number; offset: number };
  const entries: Entry[] = [];
  const chunks: Uint8Array[] = [];
  let offset = 0;

  const push = (c: Uint8Array) => {
    chunks.push(c);
    offset += c.length;
  };

  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
    const entry: Entry = { name, data, crc: crc32(data), offset };
    entries.push(entry);

    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); // local file header
    h.setUint16(4, 20, true); // version needed
    h.setUint16(6, 0x0800, true); // flags: UTF-8 names
    h.setUint16(8, 0, true); // method: stored
    h.setUint16(10, time, true);
    h.setUint16(12, date, true);
    h.setUint32(14, entry.crc, true);
    h.setUint32(18, data.length, true); // compressed size
    h.setUint32(22, data.length, true); // uncompressed size
    h.setUint16(26, name.length, true);
    h.setUint16(28, 0, true); // extra length
    push(new Uint8Array(h.buffer));
    push(name);
    push(data);
  }

  const centralStart = offset;
  for (const e of entries) {
    const h = new DataView(new ArrayBuffer(46));
    h.setUint32(0, 0x02014b50, true); // central directory header
    h.setUint16(4, 20, true); // version made by
    h.setUint16(6, 20, true); // version needed
    h.setUint16(8, 0x0800, true);
    h.setUint16(10, 0, true);
    h.setUint16(12, time, true);
    h.setUint16(14, date, true);
    h.setUint32(16, e.crc, true);
    h.setUint32(20, e.data.length, true);
    h.setUint32(24, e.data.length, true);
    h.setUint16(28, e.name.length, true);
    h.setUint16(30, 0, true); // extra
    h.setUint16(32, 0, true); // comment
    h.setUint16(34, 0, true); // disk
    h.setUint16(36, 0, true); // internal attrs
    h.setUint32(38, 0, true); // external attrs
    h.setUint32(42, e.offset, true);
    push(new Uint8Array(h.buffer));
    push(e.name);
  }
  const centralSize = offset - centralStart;

  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, centralStart, true);
  push(new Uint8Array(end.buffer));

  const out = new Uint8Array(offset);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}
