"""Data loading, label encoding, splits, and class-weight computation.

Data format: JSONL, one object per line:
    {"text": "...", "lang": "en", "tags": ["threat", "surveillance"], "severity": 3, "source": "..."}
- tags: subset of taxonomy.TAGS (may be empty)
- severity: 1..4 (see taxonomy.SEVERITY_NAMES)
- lang, source: metadata (lang is used for per-language evaluation)
"""

import json
import random

import numpy as np
import torch

from taxonomy import TAG_TO_IDX, NUM_TAGS, NUM_SEVERITY


def load_jsonl(path):
    rows = []
    with open(path, encoding="utf-8") as f:
        for i, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as e:
                raise ValueError(f"{path}:{i}: bad JSON: {e}") from e
    return rows


def encode_labels(row):
    """Return (multi_hot_tags: list[float], severity_idx: int in 0..3)."""
    multi = [0.0] * NUM_TAGS
    for t in row.get("tags", []):
        if t not in TAG_TO_IDX:
            raise ValueError(f"Unknown tag {t!r}; must be one of taxonomy.TAGS")
        multi[TAG_TO_IDX[t]] = 1.0
    sev = int(row["severity"])
    if not 1 <= sev <= NUM_SEVERITY:
        raise ValueError(f"severity must be 1..{NUM_SEVERITY}, got {sev}")
    return multi, sev - 1


def build_datasets(path, tokenizer, max_len=128, seed=42, val_frac=0.15, test_frac=0.15):
    """Tokenise + split into HuggingFace datasets. Returns dict with train/validation/test."""
    from datasets import Dataset

    rows = load_jsonl(path)
    random.Random(seed).shuffle(rows)

    texts, tag_labels, sev_labels, langs = [], [], [], []
    for r in rows:
        multi, sev = encode_labels(r)
        texts.append(r["text"])
        tag_labels.append(multi)
        sev_labels.append(sev)
        langs.append(r.get("lang", "?"))

    enc = tokenizer(texts, truncation=True, max_length=max_len)
    ds = Dataset.from_dict(
        {
            "input_ids": enc["input_ids"],
            "attention_mask": enc["attention_mask"],
            "tag_labels": tag_labels,
            "severity_labels": sev_labels,
            "lang": langs,
        }
    )

    n = len(ds)
    n_test = max(1, int(n * test_frac))
    n_val = max(1, int(n * val_frac))
    test = ds.select(range(n_test))
    val = ds.select(range(n_test, n_test + n_val))
    train = ds.select(range(n_test + n_val, n))
    return {"train": train, "validation": val, "test": test}


def compute_weights(train_ds):
    """Class weights to fight imbalance: pos_weight per tag (BCE), class weight per severity (CE)."""
    tags = np.array(train_ds["tag_labels"], dtype=np.float32)  # (N, T)
    pos = tags.sum(0)
    neg = len(tags) - pos
    pos_weight = np.clip(neg / np.clip(pos, 1.0, None), 1.0, 50.0)

    sev = np.array(train_ds["severity_labels"])
    counts = np.bincount(sev, minlength=NUM_SEVERITY).astype(np.float32)
    sev_weight = counts.sum() / np.clip(counts, 1.0, None)
    sev_weight = sev_weight / sev_weight.mean()

    return (
        torch.tensor(pos_weight, dtype=torch.float32),
        torch.tensor(sev_weight, dtype=torch.float32),
    )


class MultiTaskCollator:
    """Pads inputs and stacks the two label tensors."""

    def __init__(self, tokenizer):
        self.tok = tokenizer

    def __call__(self, features):
        tag_labels = torch.tensor([f["tag_labels"] for f in features], dtype=torch.float32)
        sev_labels = torch.tensor([f["severity_labels"] for f in features], dtype=torch.long)
        batch = self.tok.pad(
            [{"input_ids": f["input_ids"], "attention_mask": f["attention_mask"]} for f in features],
            return_tensors="pt",
        )
        batch["tag_labels"] = tag_labels
        batch["severity_labels"] = sev_labels
        return batch
