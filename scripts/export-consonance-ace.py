#!/usr/bin/env python3
"""
Export consonance-ACE conformer_decomposed model to ONNX.

Prerequisites:
  pip install torch torchaudio librosa lightning gin-config torchmetrics

  git clone https://github.com/andreamust/consonance-ACE /tmp/consonance-ACE
  cd /tmp/consonance-ACE && pip install -r requirements.txt

Usage:
  python scripts/export-consonance-ace.py

Output:
  public/models/consonance-ace.onnx (~20MB)
"""

import sys
import os

# Add consonance-ACE to path
ACE_REPO = "/tmp/consonance-ACE"
if not os.path.isdir(ACE_REPO):
    print(f"ERROR: Clone consonance-ACE first:")
    print(f"  git clone https://github.com/andreamust/consonance-ACE {ACE_REPO}")
    sys.exit(1)

sys.path.insert(0, ACE_REPO)

import torch
import numpy as np

from ACE.models.conformer_decomposed import ConformerDecomposedModel


class ACEWrapper(torch.nn.Module):
    """Wraps ConformerDecomposedModel to return tuple (ONNX-compatible)."""
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, x):
        out = self.model(x)
        return out["root"], out["bass"], out["onehot"]


def main():
    ckpt = os.path.join(ACE_REPO, "ACE/checkpoints/conformer_decomposed_smooth.ckpt")
    if not os.path.exists(ckpt):
        print(f"ERROR: Checkpoint not found: {ckpt}")
        sys.exit(1)

    print(f"Loading model from {ckpt}...")
    model = ConformerDecomposedModel.load_from_checkpoint(
        ckpt,
        vocabularies={"root": 13, "bass": 13, "onehot": 12},
        map_location="cpu",
        loss="consonance_decomposed",
        vocab_path=os.path.join(ACE_REPO, "ACE/chords_vocab.joblib"),
        strict=False,
    )
    model.eval()
    print(f"  Parameters: {sum(p.numel() for p in model.parameters()):,}")

    wrapper = ACEWrapper(model)
    wrapper.eval()

    # Dummy input: [batch=1, channels=1, freq=144, time=862]
    # 862 frames = 20s at sr=22050, hop=512
    dummy = torch.randn(1, 1, 144, 862)

    output_dir = os.path.join(os.path.dirname(__file__), "..", "public", "models")
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "consonance-ace.onnx")

    print(f"Exporting to {output_path}...")
    torch.onnx.export(
        wrapper, dummy, output_path,
        input_names=["cqt_features"],
        output_names=["root_logits", "bass_logits", "chord_logits"],
        dynamic_axes={
            "cqt_features": {3: "n_frames"},
            "root_logits": {1: "n_frames"},
            "bass_logits": {1: "n_frames"},
            "chord_logits": {1: "n_frames"},
        },
        opset_version=17,
        do_constant_folding=True,
    )

    size_mb = os.path.getsize(output_path) / 1024 / 1024
    print(f"Exported: {output_path} ({size_mb:.1f} MB)")

    # Verify
    import onnxruntime as ort
    sess = ort.InferenceSession(output_path)
    result = sess.run(None, {"cqt_features": dummy.numpy()})

    with torch.no_grad():
        pt_r, pt_b, pt_c = wrapper(dummy)

    diff = max(
        np.abs(result[0] - pt_r.numpy()).max(),
        np.abs(result[1] - pt_b.numpy()).max(),
        np.abs(result[2] - pt_c.numpy()).max(),
    )
    print(f"Max PyTorch vs ONNX diff: {diff:.6f}")
    print("PASS" if diff < 0.001 else "WARN: large diff")


if __name__ == "__main__":
    main()
