import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';

// Original temporary I monogram. White pixels stay inside radius 0.4 * size.
/** Compute the PNG CRC-32 for a chunk's type and payload bytes. */
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
/** Encode a PNG chunk with its big-endian length and validated-format checksum. */
function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
/** Generate an opaque temporary RGBA monogram PNG inside the maskable safe zone. */
function icon(size) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size,
        v = (y + 0.5) / size;
      const mark =
        (u > 0.44 && u < 0.56 && v > 0.26 && v < 0.74) ||
        (u > 0.32 &&
          u < 0.68 &&
          ((v > 0.26 && v < 0.36) || (v > 0.64 && v < 0.74)));
      const offset = y * (1 + size * 4) + 1 + x * 4;
      raw.set(mark ? [255, 255, 255, 255] : [7, 91, 112, 255], offset);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const directory = new URL('../apps/web/public/icons/', import.meta.url);
await mkdir(directory, { recursive: true });
for (const [name, size] of [
  ['icon-192', 192],
  ['icon-512', 512],
  ['maskable-512', 512],
  ['apple-touch-180', 180],
])
  await writeFile(new URL(`${name}.png`, directory), icon(size));
