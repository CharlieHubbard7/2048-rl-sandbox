"""A tiny binary format for shipping weights to the browser.

Layout: a little-endian uint32 header length, a JSON header, then each array
aligned to 4 bytes. The whole file is gzipped. Float arrays are quantised to
int16 with one scale per array, which halves the size against float32 and
keeps the error far below anything that changes a move. The reader lives in
site/js/ai/bundle.js.
"""

import gzip
import json

import numpy as np

INT16_MAX = 32767


def quantize(values):
    values = np.asarray(values, dtype=np.float32)
    peak = float(np.abs(values).max()) if values.size else 0.0
    scale = peak / INT16_MAX if peak > 0 else 1.0
    return np.round(values / scale).astype(np.int16), scale


def dequantize(q, scale):
    return q.astype(np.float32) * np.float32(scale)


def write_bundle(path, arrays, meta=None):
    """arrays: name -> numpy array. Floats are quantised; ints are stored as-is."""
    entries, blobs, offset = [], [], 0
    for name, array in arrays.items():
        entry = {"name": name, "shape": list(array.shape)}
        if np.issubdtype(array.dtype, np.floating):
            array, entry["scale"] = quantize(array)
        array = np.ascontiguousarray(array).ravel()
        entry["dtype"] = array.dtype.name
        entry["length"] = int(array.size)
        entry["offset"] = offset  # relative to the start of the data section
        blob = array.tobytes()
        blob += b"\0" * (-len(blob) % 4)
        offset += len(blob)
        entries.append(entry)
        blobs.append(blob)

    header = json.dumps({"meta": meta or {}, "arrays": entries}).encode()
    header += b" " * (-len(header) % 4)
    payload = len(header).to_bytes(4, "little") + header + b"".join(blobs)
    with gzip.open(path, "wb", compresslevel=9) as f:
        f.write(payload)


def read_bundle(path):
    """Python twin of the JS reader, used to check what the browser will see."""
    with gzip.open(path, "rb") as f:
        raw = f.read()
    n = int.from_bytes(raw[:4], "little")
    header = json.loads(raw[4 : 4 + n])
    data = raw[4 + n :]
    arrays = {}
    for e in header["arrays"]:
        dtype = np.dtype(e["dtype"])
        a = np.frombuffer(data, dtype=dtype, count=e["length"], offset=e["offset"]).reshape(e["shape"])
        arrays[e["name"]] = dequantize(a, e["scale"]) if "scale" in e else a
    return header["meta"], arrays
