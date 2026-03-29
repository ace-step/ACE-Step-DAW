# BPM Detection & Chord Recognition — Research Report

> Date: 2026-03-27 | For: ACE-Step-DAW web-local inference

---

## Executive Summary

**Best deployment strategy: ONNX Runtime Web (WASM + WebGPU) in a Web Worker**

- BPM: **Beat This! (small, 8MB ONNX)** — current SOTA, C++ port exists with ONNX export
- Chord: **consonance-ACE (ISMIR 2025)** — decomposed conformer, SOTA chord estimation
- Feature extraction: **Essentia.js** (WASM) or **Rust (rustfft + mel-spec → WASM)**
- Fallback/lightweight: **Essentia.js** has built-in BPM + chord detection (DSP-based, lower accuracy)

NOT recommended: C++ or Rust standalone — the models are Python/PyTorch, so native compilation means reimplementing inference. ONNX is the universal bridge.

---

## Part 1: BPM Detection

### Model Comparison

| Model | Accuracy | Size | Real-time | Web-ready | License |
|-------|----------|------|-----------|-----------|---------|
| **Beat This! (CPJKU, 2024)** | SOTA (best F1 across 16 datasets) | 8MB (small) / 97MB (full) | Offline | ONNX export exists via beat_this_cpp | MIT |
| Madmom (CPJKU) | Very high | Large (multiple RNNs) | No | No WASM path | BSD |
| BeatNet+ | High (best online method) | Medium | Yes (<50ms) | Needs ONNX export | MIT |
| Essentia RhythmExtractor | Good | ~2.5MB WASM | Yes | **essentia.js ready** | AGPL-3.0 |
| Aubio | Moderate | <1MB | Yes | **aubiojs ready** | GPL-3.0 |

### Recommendation: Beat This! (small variant)

- **Why**: SOTA accuracy without needing DBN post-processing; 8MB small model is web-friendly
- **How**: C++ port already exists at [mosynthkey/beat_this_cpp](https://github.com/mosynthkey/beat_this_cpp)
  - Uses ONNX Runtime for inference
  - 97MB ONNX model (full) — small variant is ~8MB
  - Pipeline: audio → mel spectrogram → transformer → beat/downbeat positions
- **Web path**: Export small model to ONNX → run via `onnxruntime-web` (WASM or WebGPU)

### Fallback: Essentia.js

- Already works in browser, zero additional work
- `RhythmExtractor2013` gives BPM + beat positions
- Lower accuracy but production-ready today

---

## Part 2: Chord Recognition

### Model Comparison

| Model | Accuracy | Vocabulary | Architecture | Web Path | License |
|-------|----------|------------|--------------|----------|---------|
| **consonance-ACE (ISMIR 2025)** | SOTA | 170 classes | Conformer (decomposed) | PyTorch → ONNX → ort-web | MIT |
| BTC | ~80-86% majmin | 25 classes | Transformer | PyTorch → ONNX → ort-web | — |
| CREMA | ~75-80% | 602 classes | CNN+RNN | TF → ONNX → ort-web | — |
| Chordino | ~70-75% | maj/min/7th | NNLS+HMM | C++ → WASM | GPL |
| Essentia ChordsDetection | ~65-70% | maj/min | HPCP+template | **essentia.js ready** | AGPL |

### Recommendation: consonance-ACE

- **Why**: ISMIR 2025 SOTA, decomposed output (root + bass + pitch activations), 170 chord vocabulary, MIT license
- **Repo**: [andreamust/consonance-ACE](https://github.com/andreamust/consonance-ACE)
- **Paper**: [arxiv.org/abs/2509.01588](https://arxiv.org/abs/2509.01588)
- **Architecture**: Conformer with decomposed heads — separately estimates root, bass, and note activations, then reconstructs chord labels
- **Key innovation**: Consonance-based label smoothing handles annotator subjectivity and class imbalance
- **Input**: Audio (WAV) → 20s chunks
- **Output**: `.lab` format (start_time, end_time, chord_label e.g. `E:maj`)
- **Pipeline**: audio → conformer → decomposed heads (root/bass/notes) → chord label
- **Web path**: PyTorch checkpoint → `torch.onnx.export()` → ONNX → `onnxruntime-web`
- **Training data**: Isophonics, McGill Billboard (via ChoCo corpus)

### Beat-synchronous chord detection (DAW integration)

1. Run BPM/beat detection first (Beat This!)
2. Segment audio at beat boundaries
3. Run consonance-ACE per segment (or on full audio, then snap to beats)
4. Post-processing: merge short segments, snap chord changes to nearest beat/bar
5. Output: chord track aligned to DAW grid

### Fallback: Essentia.js ChordsDetectionBeats

- Already works in browser
- Beat-synchronous chord detection built-in
- Lower accuracy (~65-70%) but zero integration work

---

## Part 3: Web Deployment Architecture

### Recommended Stack

```
┌─────────────────────────────────────────────────┐
│                  Main Thread (React)              │
│  - UI rendering                                   │
│  - Receives results via postMessage               │
└─────────────┬───────────────────────────────────┘
              │ postMessage(audioBuffer)
              ▼
┌─────────────────────────────────────────────────┐
│               Web Worker                          │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │  Feature Extraction (WASM)                   │ │
│  │  Option A: essentia.js (C++ → WASM)          │ │
│  │  Option B: Rust (rustfft + mel-spec → WASM)  │ │
│  │  - Mel spectrogram for BPM model             │ │
│  │  - CQT / chromagram for chord model          │ │
│  └──────────────┬──────────────────────────────┘ │
│                 │ Float32Array                     │
│                 ▼                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │  Model Inference                             │ │
│  │  onnxruntime-web (WASM CPU or WebGPU)        │ │
│  │  - Beat This! small (8MB ONNX) → beats/BPM  │ │
│  │  - consonance-ACE (ONNX) → chord labels     │ │
│  └──────────────┬──────────────────────────────┘ │
│                 │ results                          │
│                 ▼                                  │
│  Post-processing: Viterbi smoothing, beat snap    │
└─────────────────────────────────────────────────┘
```

### Runtime Options Comparison

| Runtime | Pros | Cons | Best For |
|---------|------|------|----------|
| **onnxruntime-web** | Best operator coverage, INT8 quant, WebGPU support | Larger WASM binary (~5MB) | Production deployment |
| Tract (Rust → WASM) | Pure Rust, single binary, lightweight | Less operator coverage | Simple models |
| Candle (HF Rust) | Self-contained WASM, proven with Whisper | Need to reimplement model in Candle | Custom models |
| TensorFlow.js WASM | Mature ecosystem | Heavier, ecosystem moving to ONNX | Legacy TF models |

### Performance Expectations

| Operation | Latency (WASM, M2 MacBook) |
|-----------|---------------------------|
| Mel spectrogram (5s clip) | 5-15ms |
| ONNX model inference (small CNN) | 8-12ms |
| ONNX model inference (transformer, 8MB) | 50-200ms |
| WebGPU inference (same transformer) | 5-20ms |
| Total pipeline (5s clip → BPM + chords) | ~100-500ms (WASM) / ~30-100ms (WebGPU) |

---

## Part 4: Implementation Roadmap

### Phase 1: Quick Win (essentia.js)
- Install `essentia.js` npm package
- Use `RhythmExtractor2013` for BPM + beats
- Use `ChordsDetectionBeats` for beat-synced chords
- Run in Web Worker
- Accuracy: ~70% for both — usable but not great
- **Effort: 1-2 days**

### Phase 2: High-Accuracy BPM (Beat This! ONNX)
- Clone [beat_this_cpp](https://github.com/mosynthkey/beat_this_cpp), get ONNX model
- Use small variant (8MB) or quantize full model to INT8
- Implement mel spectrogram in WASM (essentia.js or Rust `mel-spec`)
- Run ONNX inference via `onnxruntime-web`
- Beat-synced output → snap to DAW grid
- **Effort: 3-5 days**

### Phase 3: High-Accuracy Chords (consonance-ACE ONNX)
- Export consonance-ACE conformer_decomposed model to ONNX from PyTorch
- Model outputs decomposed root/bass/note activations → reconstruct chord labels
- Run ONNX inference via `onnxruntime-web`
- Use beat positions from Phase 2 for beat-synchronous snapping
- 170 chord vocabulary — rich enough for DAW display

### Phase 4: Optimization
- INT8 quantization of both models (2-3x faster WASM)
- WebGPU acceleration for devices that support it
- Streaming/chunked analysis for long files
- Cache results in IndexedDB

---

## Part 5: Key Repos & Links

### BPM
- Beat This!: https://github.com/CPJKU/beat_this (Python) | https://github.com/mosynthkey/beat_this_cpp (C++ ONNX)
- BeatNet: https://github.com/mjhydri/BeatNet
- Essentia.js: https://github.com/mtg/essentia.js/

### Chords
- consonance-ACE: https://github.com/andreamust/consonance-ACE (ISMIR 2025, MIT)
- BTC: https://github.com/jayg996/BTC-ISMIR19
- CREMA: https://github.com/bmcfee/crema

### Inference Runtimes
- onnxruntime-web: https://www.npmjs.com/package/onnxruntime-web
- Tract (Rust ONNX): https://github.com/sonos/tract
- Candle (Rust ML): https://github.com/huggingface/candle

### Audio Preprocessing
- essentia.js: https://github.com/mtg/essentia.js/
- rust-melspec-wasm: https://github.com/nicolvisser/rust-melspec-wasm
- mel_spec crate: https://crates.io/crates/mel_spec
- spectrograms crate: https://docs.rs/spectrograms/latest/spectrograms/

### Reference Implementations
- basicpitch.cpp (ONNX + WASM): https://github.com/sevagh/basicpitch.cpp
- Candle Whisper WASM: https://huggingface.co/spaces/lmz/candle-whisper

---

## Decision: Why NOT Pure C++ or Rust?

| Approach | Problem |
|----------|---------|
| Rewrite model in C++ | Models are defined in PyTorch; reimplementing transformer/RNN in C++ is months of work |
| Rewrite model in Rust (candle/burn) | Same problem — must port architecture + load weights |
| Compile Python + PyTorch to WASM | Not feasible |
| **Export to ONNX + run via ort-web** | **Universal bridge: any PyTorch model → ONNX → browser. This is the answer.** |

C++ and Rust are excellent for the **preprocessing** pipeline (FFT, mel spectrogram, CQT), but for **model inference**, ONNX is the standard interchange format and ort-web is the best runtime for browsers.
