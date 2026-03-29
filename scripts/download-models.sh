#!/usr/bin/env bash
# Download ONNX models for BPM detection and chord recognition.
# Models are too large for git (~100MB total), so they're downloaded on demand.
#
# Usage: ./scripts/download-models.sh

set -euo pipefail

MODELS_DIR="$(cd "$(dirname "$0")/.." && pwd)/public/models"
mkdir -p "$MODELS_DIR"

echo "Downloading ONNX models to $MODELS_DIR..."

# Beat This! (79MB) — CPJKU ISMIR 2024 SOTA beat/BPM detection
# Source: https://github.com/mosynthkey/beat_this_cpp
BEAT_THIS_URL="https://github.com/mosynthkey/beat_this_cpp/raw/main/onnx/beat_this.onnx"
if [ ! -f "$MODELS_DIR/beat-this.onnx" ]; then
  echo "Downloading Beat This! model (79MB)..."
  curl -L -o "$MODELS_DIR/beat-this.onnx" "$BEAT_THIS_URL"
  echo "  Done: beat-this.onnx ($(du -h "$MODELS_DIR/beat-this.onnx" | cut -f1))"
else
  echo "  beat-this.onnx already exists, skipping"
fi

# consonance-ACE — must be exported from PyTorch checkpoint
# The ONNX file should already exist if you ran the export script.
if [ ! -f "$MODELS_DIR/consonance-ace.onnx" ]; then
  echo ""
  echo "consonance-ace.onnx not found."
  echo "To export it, run:"
  echo "  python scripts/export-consonance-ace.py"
  echo ""
  echo "Or download from the project's release assets (if available)."
else
  echo "  consonance-ace.onnx already exists, skipping"
fi

echo ""
echo "Model files:"
ls -lh "$MODELS_DIR"/*.onnx 2>/dev/null || echo "  (none found)"
