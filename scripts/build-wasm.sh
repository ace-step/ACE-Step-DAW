#!/usr/bin/env bash
# Build the Rust DSP engine to WASM for the DAW.
# Usage: ./scripts/build-wasm.sh [--release]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WASM_CRATE="$ROOT_DIR/crates/ace-dsp-wasm"
OUT_DIR="$ROOT_DIR/public/wasm"

# Check prerequisites
if ! command -v wasm-pack &> /dev/null; then
    echo "❌ wasm-pack not found. Install: curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh"
    exit 1
fi

if ! rustup target list --installed | grep -q wasm32-unknown-unknown; then
    echo "📦 Adding wasm32-unknown-unknown target..."
    rustup target add wasm32-unknown-unknown
fi

# Build
PROFILE="--dev"
if [[ "${1:-}" == "--release" ]]; then
    PROFILE="--release"
    echo "🔧 Building WASM (release)..."
else
    echo "🔧 Building WASM (dev)..."
fi

cd "$WASM_CRATE"
wasm-pack build --target web $PROFILE --out-dir "$OUT_DIR"

# Report size
WASM_FILE="$OUT_DIR/ace_dsp_wasm_bg.wasm"
if [[ -f "$WASM_FILE" ]]; then
    SIZE=$(wc -c < "$WASM_FILE" | tr -d ' ')
    SIZE_KB=$((SIZE / 1024))
    echo "✅ WASM built: ${SIZE_KB}KB ($WASM_FILE)"
fi
