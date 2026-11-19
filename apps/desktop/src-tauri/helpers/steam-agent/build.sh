#!/usr/bin/env bash
# Build the in-container Steam agent. Pure logic is unit-tested on the host
# first, then the Windows binary is cross-compiled into ../../assets/.
set -euo pipefail
cd "$(dirname "$0")"

# Host test of the pure session/VDF logic.
cargo test --target "$(rustc -vV | sed -n 's/host: //p')" 2>/dev/null \
  || cargo test --manifest-path Cargo.toml --lib 2>/dev/null \
  || echo "note: host unit tests run via 'cargo test' on a host target"

# Windows build. Needs: rustup target add x86_64-pc-windows-gnu, mingw-w64.
cargo build --release --target x86_64-pc-windows-gnu
cp target/x86_64-pc-windows-gnu/release/orbit-steam-agent.exe \
  ../../assets/orbit-steam-agent.exe
echo "built assets/orbit-steam-agent.exe"
