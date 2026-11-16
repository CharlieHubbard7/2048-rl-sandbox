// Reader for the weight bundles written by rl2048/bundle.py: a uint32 header
// length, a JSON header, then 4-byte-aligned arrays, all gzipped.
// Quantised float arrays come back as Float32Array, already rescaled.

const TYPES = {
  int8: Int8Array,
  int16: Int16Array,
  int32: Int32Array,
  uint8: Uint8Array,
  uint16: Uint16Array,
  uint32: Uint32Array,
  float32: Float32Array,
};

export async function loadBundle(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Couldn't download ${url} (${response.status})`);
  // Decompress here rather than relying on the host's Content-Encoding, so
  // the same file works on any static server.
  const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
  return parseBundle(await new Response(stream).arrayBuffer());
}

export function parseBundle(buffer) {
  const headerLength = new DataView(buffer).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, headerLength)));
  const dataStart = 4 + headerLength;
  const arrays = {};
  for (const { name, dtype, offset, length, scale } of header.arrays) {
    const raw = new TYPES[dtype](buffer, dataStart + offset, length);
    arrays[name] = scale === undefined ? raw : Float32Array.from(raw, (v) => v * scale);
  }
  return { meta: header.meta, arrays };
}
