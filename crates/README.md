# ACE DSP — Rust WASM Audio Effects Engine

Professional-grade DSP algorithms in Rust, compiled to WebAssembly for the ACE-Step DAW AudioWorklet pipeline.

## Structure

```
crates/
├── ace-dsp-core/    # Pure DSP algorithms (no_std compatible)
│   └── src/
│       ├── biquad.rs   # Biquad filter (all types from Audio EQ Cookbook)
│       ├── delay.rs    # Circular delay line with interpolation
│       └── lib.rs
├── ace-dsp-wasm/    # WASM bindings (wasm-bindgen)
│   └── src/
│       └── lib.rs      # JS-facing API
└── Cargo.toml       # Workspace root
```

## Build

```bash
# Prerequisites (one-time)
rustup target add wasm32-unknown-unknown
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

# Build WASM (output → public/wasm/)
npm run build:wasm          # release
npm run build:wasm:dev      # debug (larger, faster build)

# Run Rust tests
cd crates && cargo test
```

## Architecture

```
React UI (main thread)
  └─ WasmEffectNode.ts
       └─ AudioWorkletNode
            └─ wasm-effect-processor.js (audio thread)
                 └─ ace_dsp_wasm.wasm (Rust DSP)
```

The WASM module runs in an AudioWorkletProcessor on a dedicated real-time audio thread.
Parameter changes flow via MessagePort. Metering data flows back to the UI at 60fps.
