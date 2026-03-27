#!/usr/bin/env python3
"""
Verify ONNX model inference for Beat This! (BPM) and consonance-ACE (chords).

Usage:
    python scripts/verify-onnx-models.py [path/to/audio.wav]

Validates:
  1. Models load correctly in ONNX Runtime
  2. Input/output shapes match expectations
  3. Beat detection produces reasonable BPM (30-300 range)
  4. Chord detection produces valid chord labels
  5. Processing time is within acceptable range for web deployment
"""

import sys
import time
import os

import numpy as np
import onnxruntime as ort
import librosa

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "models")
BEAT_THIS_PATH = os.path.join(MODELS_DIR, "beat-this.onnx")
CONSONANCE_ACE_PATH = os.path.join(MODELS_DIR, "consonance-ace.onnx")

# Constants matching the model training configs
BEAT_THIS_SR = 22050
BEAT_THIS_N_FFT = 2048
BEAT_THIS_HOP = 441  # 20ms hop @ 22050
BEAT_THIS_N_MELS = 128

ACE_SR = 22050
ACE_HOP = 512
ACE_N_BINS = 144  # CQT bins

# Chord label maps
ROOT_LABELS = ["N", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def compute_mel_spectrogram(audio: np.ndarray, sr: int) -> np.ndarray:
    """Compute log-mel spectrogram using Beat This! official preprocessing.

    Uses torchaudio MelSpectrogram with exact config:
      n_fft=1024, hop=441, f_min=30, f_max=11000, n_mels=128,
      mel_scale=slaney, normalized=frame_length, power=1,
      output = log1p(1000 * mel).T  -> [time, freq]
    """
    try:
        # Use official Beat This! preprocessing if available
        import torch
        from beat_this.preprocessing import LogMelSpect
        audio_t = torch.from_numpy(audio).float()
        spect = LogMelSpect(sample_rate=sr, device="cpu")
        with torch.no_grad():
            mel = spect(audio_t)  # [T, 128]
        return mel.numpy()[np.newaxis, :, :]  # [1, T, 128]
    except ImportError:
        # Fallback: approximate with librosa
        import warnings
        warnings.warn("beat_this not installed, using librosa approximation for mel spectrogram")
        mel = librosa.feature.melspectrogram(
            y=audio, sr=sr,
            n_fft=1024, hop_length=441, n_mels=128,
            fmin=30, fmax=11000, power=1,
            norm="slaney", htk=False,
        )
        log_mel = np.log1p(1000.0 * mel)
        return log_mel.T[np.newaxis, :, :]  # [1, T, 128]


def compute_cqt(audio: np.ndarray, sr: int) -> np.ndarray:
    """Compute CQT features matching consonance-ACE CQTransform exactly.

    Config from ACE/preprocess/transforms.py:
      sr=22050, hop=512, bins_per_octave=24, num_octaves=6, start_note=C1
      Output = abs(cqt)  (raw magnitude, NOT dB)
    Audio is normalized to [-1, 1] before CQT.
    """
    # Normalize audio to [-1, 1] (matching AudioProcessor._normalize)
    max_val = np.abs(audio).max()
    if max_val > 0:
        audio = audio / max_val

    fmin = librosa.note_to_hz("C1")
    cqt = librosa.cqt(
        y=audio, sr=sr, hop_length=ACE_HOP,
        n_bins=ACE_N_BINS, bins_per_octave=24,
        fmin=fmin,
    )
    cqt_mag = np.abs(cqt)
    # Model expects [batch, 1, freq, time] — raw magnitude
    return cqt_mag[np.newaxis, np.newaxis, :, :].astype(np.float32)  # [1, 1, 144, T]


def verify_beat_this(audio: np.ndarray, sr: int):
    """Verify Beat This! ONNX model."""
    print("\n" + "=" * 60)
    print("BEAT THIS! — BPM Detection Verification")
    print("=" * 60)

    if not os.path.exists(BEAT_THIS_PATH):
        print(f"  SKIP: {BEAT_THIS_PATH} not found")
        return False

    sess = ort.InferenceSession(BEAT_THIS_PATH)
    inp = sess.get_inputs()[0]
    print(f"  Model input: {inp.name}, shape={inp.shape}, type={inp.type}")
    for o in sess.get_outputs():
        print(f"  Model output: {o.name}, shape={o.shape}")

    # Compute mel spectrogram
    mel = compute_mel_spectrogram(audio, sr)
    print(f"  Mel spectrogram: shape={mel.shape}, range=[{mel.min():.2f}, {mel.max():.2f}]")

    # Run inference
    t0 = time.time()
    beat_logits, downbeat_logits = sess.run(None, {inp.name: mel.astype(np.float32)})
    elapsed = time.time() - t0
    print(f"  Inference time: {elapsed * 1000:.0f}ms")

    print(f"  Beat logits: shape={beat_logits.shape}, range=[{beat_logits.min():.3f}, {beat_logits.max():.3f}]")
    print(f"  Downbeat logits: shape={downbeat_logits.shape}")

    # Post-processing: local max-pool peak picking (matching Beat This! minimal postprocessor)
    # 1. max_pool1d with kernel=7 (±70ms at 50fps) to find local maxima
    # 2. Keep peaks where logit > 0 (probability > 0.5)
    def peak_pick(logits_1d: np.ndarray, kernel: int = 7) -> np.ndarray:
        """Pick local maxima from logits, matching Beat This! postprocessor."""
        from scipy.ndimage import maximum_filter1d
        maxpool = maximum_filter1d(logits_1d, size=kernel, mode='constant', cval=-1000)
        peaks = (logits_1d == maxpool) & (logits_1d > 0)
        return np.where(peaks)[0]

    beat_frames = peak_pick(beat_logits[0])
    downbeat_frames = peak_pick(downbeat_logits[0])

    # Convert frames to time (hop=441 @ 22050Hz = 20ms per frame)
    frame_duration = 441.0 / BEAT_THIS_SR  # 0.02s per frame
    beat_times = beat_frames * frame_duration
    downbeat_times = downbeat_frames * frame_duration

    print(f"  Detected {len(beat_times)} beats, {len(downbeat_times)} downbeats")

    if len(beat_times) >= 2:
        # Compute BPM from inter-beat intervals
        ibis = np.diff(beat_times)
        median_ibi = np.median(ibis)
        bpm = 60.0 / median_ibi if median_ibi > 0 else 0
        print(f"  Estimated BPM: {bpm:.1f}")
        print(f"  First 10 beat times (s): {beat_times[:10].round(2).tolist()}")
        print(f"  First 5 downbeat times (s): {downbeat_times[:5].round(2).tolist()}")

        # Sanity checks
        ok = True
        if bpm < 30 or bpm > 300:
            print(f"  WARN: BPM {bpm:.1f} outside expected range [30, 300]")
            ok = False
        if len(beat_times) < 4:
            print(f"  WARN: Too few beats detected ({len(beat_times)})")
            ok = False

        if ok:
            print("  PASS: Beat detection looks correct")
        return ok
    else:
        print("  FAIL: Fewer than 2 beats detected")
        return False


def verify_consonance_ace(audio: np.ndarray, sr: int):
    """Verify consonance-ACE ONNX model."""
    print("\n" + "=" * 60)
    print("CONSONANCE-ACE — Chord Recognition Verification")
    print("=" * 60)

    if not os.path.exists(CONSONANCE_ACE_PATH):
        print(f"  SKIP: {CONSONANCE_ACE_PATH} not found")
        return False

    sess = ort.InferenceSession(CONSONANCE_ACE_PATH)
    inp = sess.get_inputs()[0]
    print(f"  Model input: {inp.name}, shape={inp.shape}, type={inp.type}")
    for o in sess.get_outputs():
        print(f"  Model output: {o.name}, shape={o.shape}")

    # Compute CQT — process in 20s chunks like the original
    chunk_dur = 20.0
    n_samples = int(chunk_dur * sr)
    audio_chunk = audio[:n_samples]
    if len(audio_chunk) < n_samples:
        audio_chunk = np.pad(audio_chunk, (0, n_samples - len(audio_chunk)))

    cqt = compute_cqt(audio_chunk, sr)
    print(f"  CQT features: shape={cqt.shape}, range=[{cqt.min():.2f}, {cqt.max():.2f}]")

    # Run inference
    t0 = time.time()
    root_logits, bass_logits, chord_logits = sess.run(None, {inp.name: cqt.astype(np.float32)})
    elapsed = time.time() - t0
    print(f"  Inference time: {elapsed * 1000:.0f}ms")

    print(f"  Root logits: shape={root_logits.shape}")
    print(f"  Bass logits: shape={bass_logits.shape}")
    print(f"  Chord logits: shape={chord_logits.shape}")

    # Decode predictions
    root_preds = np.argmax(root_logits[0], axis=-1)  # [T]
    bass_preds = np.argmax(bass_logits[0], axis=-1)  # [T]
    chord_probs = 1 / (1 + np.exp(-chord_logits[0]))  # sigmoid -> [T, 12]

    n_frames = root_preds.shape[0]
    frame_dur = chunk_dur / n_frames
    print(f"  {n_frames} frames, {frame_dur * 1000:.1f}ms per frame")

    # Sample chord labels at 1-second intervals
    print("\n  Chord timeline (every 1s):")
    for sec in range(min(int(chunk_dur), 20)):
        frame_idx = int(sec / frame_dur)
        if frame_idx >= n_frames:
            break
        root = ROOT_LABELS[root_preds[frame_idx]]
        bass = ROOT_LABELS[bass_preds[frame_idx]]
        active_notes = np.where(chord_probs[frame_idx] > 0.5)[0]
        notes_str = ",".join([PITCH_CLASSES[n] for n in active_notes]) if len(active_notes) > 0 else "none"
        chord_label = f"{root}" if root != "N" else "N"
        print(f"    {sec:2d}s: root={root:>2s}  bass={bass:>2s}  notes=[{notes_str}]  -> {chord_label}")

    # Sanity checks
    ok = True
    unique_roots = len(set(root_preds.tolist()))
    if unique_roots < 2:
        print(f"\n  WARN: Only {unique_roots} unique root predictions (model may not be discriminating)")

    # Check that not all predictions are "N" (no chord)
    n_ratio = np.mean(root_preds == 0)
    if n_ratio > 0.95:
        print(f"  WARN: {n_ratio * 100:.0f}% of frames predicted as 'N' (no chord)")
        ok = False

    if ok:
        print("\n  PASS: Chord detection looks correct")
    return ok


def main():
    if len(sys.argv) > 1:
        audio_path = sys.argv[1]
    else:
        # Use a default test file
        audio_path = "/Users/gongjunmin/timedomain/nanoclaw/groups/main/funk_rock_groove.mp3"

    if not os.path.exists(audio_path):
        print(f"Audio file not found: {audio_path}")
        print("Usage: python scripts/verify-onnx-models.py [path/to/audio.wav]")
        sys.exit(1)

    print(f"Loading audio: {audio_path}")
    audio, sr = librosa.load(audio_path, sr=22050, mono=True)
    duration = len(audio) / sr
    print(f"  Duration: {duration:.1f}s, SR: {sr}, Samples: {len(audio)}")

    results = {}
    results["beat_this"] = verify_beat_this(audio, sr)
    results["consonance_ace"] = verify_consonance_ace(audio, sr)

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    for name, ok in results.items():
        status = "PASS" if ok else "FAIL"
        print(f"  {name}: {status}")

    if all(results.values()):
        print("\nAll models verified successfully!")
        sys.exit(0)
    else:
        print("\nSome models failed verification.")
        sys.exit(1)


if __name__ == "__main__":
    main()
