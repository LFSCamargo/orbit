#!/usr/bin/env python3
"""Inspect Tauri assets in a local GameHub Mach-O executable.

Requires the optional `brotli` Python package. Writes only selected frontend
modules to a caller-supplied temporary directory; never changes GameHub data.
"""
import argparse
import hashlib
import pathlib
import re
import struct

import brotli


def inspect(binary: pathlib.Path, output: pathlib.Path) -> int:
    raw = binary.read_bytes()
    if raw[:4] != b"\xcf\xfa\xed\xfe":
        raise ValueError("Expected a 64-bit little-endian Mach-O executable")
    segments = []
    cursor = 32
    for _ in range(struct.unpack_from("<I", raw, 16)[0]):
        command, size = struct.unpack_from("<II", raw, cursor)
        if command == 25:
            name = raw[cursor + 8 : cursor + 24].rstrip(b"\0").decode()
            _, _, file_offset, file_size = struct.unpack_from("<QQQQ", raw, cursor + 24)
            segments.append((name, file_offset, file_size))
        cursor += size
    data_const = next((x for x in segments if x[0] == "__DATA_CONST"), None)
    if data_const is None:
        raise ValueError("No __DATA_CONST segment found")
    _, offset, size = data_const
    output.mkdir(parents=True, exist_ok=True)
    count = 0
    for pos in range(offset, offset + size - 32, 8):
        key_ptr, key_len, value_ptr, value_len = struct.unpack_from("<QQQQ", raw, pos)
        key_pos = key_ptr & 0xFFFFFFFFF
        value_pos = value_ptr & 0xFFFFFFFFF
        if not (
            1 < key_len < 200
            and 0 < value_len < 20_000_000
            and key_pos + key_len < len(raw)
            and value_pos + value_len < len(raw)
        ):
            continue
        key = raw[key_pos : key_pos + key_len]
        if not re.fullmatch(rb"/js/[A-Za-z0-9_.-]+\.js", key):
            continue
        try:
            content = brotli.decompress(raw[value_pos : value_pos + value_len])
        except brotli.error:
            continue
        target = output / key.decode().removeprefix("/")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        count += 1
    print(f"sha256={hashlib.sha256(raw).hexdigest()} modules={count} output={output}")
    return count


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("binary", type=pathlib.Path)
    parser.add_argument("output", type=pathlib.Path)
    args = parser.parse_args()
    inspect(args.binary, args.output)
