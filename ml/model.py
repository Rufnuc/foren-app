"""Multi-task classifier: shared encoder + tag head (multi-label) + severity head.

Kept as a plain nn.Module so it exports cleanly to ONNX. The loss is computed
inside forward when labels are provided (HuggingFace Trainer picks up the
"loss" key); class weights are stored as buffers so they move with .to(device).
"""

import torch
import torch.nn as nn
from transformers import AutoConfig, AutoModel


class MultiTaskClassifier(nn.Module):
    def __init__(
        self,
        base_model,
        num_tags,
        num_severity,
        tag_pos_weight=None,
        severity_class_weight=None,
        dropout=0.1,
    ):
        super().__init__()
        self.config = AutoConfig.from_pretrained(base_model)
        self.encoder = AutoModel.from_pretrained(base_model)
        hidden = self.config.hidden_size
        self.dropout = nn.Dropout(dropout)
        self.tag_head = nn.Linear(hidden, num_tags)
        self.severity_head = nn.Linear(hidden, num_severity)
        self.num_tags = num_tags
        self.num_severity = num_severity

        if tag_pos_weight is None:
            tag_pos_weight = torch.ones(num_tags)
        if severity_class_weight is None:
            severity_class_weight = torch.ones(num_severity)
        self.register_buffer("tag_pos_weight", tag_pos_weight)
        self.register_buffer("severity_class_weight", severity_class_weight)

    @staticmethod
    def _mean_pool(last_hidden, attention_mask):
        mask = attention_mask.unsqueeze(-1).to(last_hidden.dtype)
        summed = (last_hidden * mask).sum(dim=1)
        counts = mask.sum(dim=1).clamp(min=1e-9)
        return summed / counts

    def forward(self, input_ids, attention_mask, tag_labels=None, severity_labels=None):
        out = self.encoder(input_ids=input_ids, attention_mask=attention_mask)
        pooled = self.dropout(self._mean_pool(out.last_hidden_state, attention_mask))
        tag_logits = self.tag_head(pooled)
        severity_logits = self.severity_head(pooled)

        loss = None
        if tag_labels is not None and severity_labels is not None:
            bce = nn.BCEWithLogitsLoss(pos_weight=self.tag_pos_weight)
            ce = nn.CrossEntropyLoss(weight=self.severity_class_weight)
            loss = bce(tag_logits, tag_labels.float()) + ce(severity_logits, severity_labels.long())

        return {"loss": loss, "tag_logits": tag_logits, "severity_logits": severity_logits}


class InferenceWrapper(nn.Module):
    """Logits-only wrapper for a clean two-output ONNX graph."""

    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, input_ids, attention_mask):
        out = self.model(input_ids=input_ids, attention_mask=attention_mask)
        return out["tag_logits"], out["severity_logits"]
