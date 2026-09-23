# Foren — analysis model training

Trains the on-device evidence classifier (multi-label **pattern tags** + ordinal
**severity**) and exports it to ONNX/int8 for the app's transformers.js runtime.
Design and taxonomy: [`../docs/analysis-model.md`](../docs/analysis-model.md).

This is dev-time tooling — it is **not** bundled into the mobile app. Only the
exported `model.int8.onnx` + tokenizer ship (into `public/models/analysis/`).

## Setup

```bash
cd ml
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

## Pipeline

```bash
# 1. Train (sample data → proves the pipeline; overfits, numbers meaningless)
python train.py --data data/sample.jsonl --output runs/exp1 --epochs 5

# 2. Evaluate: per-tag, per-language, threshold suggestions
python evaluate.py --model-dir runs/exp1 --data data/sample.jsonl

# 3. Export to ONNX + int8 (drops into the app)
python export_onnx.py --model-dir runs/exp1 --out-dir ../public/models/analysis
```

Base model defaults to `distilbert-base-multilingual-cased` (WordPiece; en/fr/es/
ar/cy covered). WordPiece is required because the SentencePiece MiniLM tokenizer
does not round-trip through transformers.js in the browser (verified). On Apple
Silicon it uses MPS automatically; add `CUDA_VISIBLE_DEVICES` on a GPU box, or it
falls back to CPU.

## Data format (`data/*.jsonl`)

```json
{"text": "...", "lang": "en", "tags": ["threat", "surveillance"], "severity": 3, "source": "..."}
```

- `tags` ⊆ `taxonomy.TAGS` (may be empty for benign text)
- `severity` ∈ 1..4 (low/medium/high/critical)
- `lang` drives per-language evaluation; `source` tracks provenance

`taxonomy.py` is the single source of truth for labels — edit it there, nowhere else.

## The real work is data, not this code

The sample set is 27 fabricated placeholders — enough to run the pipeline, not to
learn anything. A usable model needs:

1. **Seed** from adjacent public datasets (Jigsaw `threat`/toxicity, cyberbullying)
   mapped onto the taxonomy.
2. **Synthetic augmentation** per language with an offline LLM — fabricated
   training text only, never real evidence; de-duplicated and **expert-reviewed**.
   Never train on synthetic alone.
3. A **hand-labelled eval set**, ideally reviewed by DV advocates, in the real
   message styles of en/fr/es/ar/cy. This is the asset that tells you the model is
   safe. **ar** (dialect + Arabizi) and **cy** (low-resource) are the scarce ones —
   plan for uneven coverage and heavier human review there.

## Data pipeline tooling

Four scripts turn the above into an actual dataset. Everything ends up as the
same `{text,lang,tags,severity,source}` JSONL and passes through `data_tools`.

```bash
# Bootstrap: template-based synthetic data — no downloads, labels correct by construction.
# Low diversity (overfits templates); use it to prove the pipeline, not as the real dataset.
python seed_gen.py --per-template 6 --out data/seed.jsonl

# Seed real threat/degradation + negatives from Jigsaw (download the Kaggle CSV first)
python map_public.py jigsaw --csv train.csv --out data/jigsaw.jsonl --limit 4000 --negatives 4000

# Fill the blind spots (IPV-specific tags, ar/cy) with an LLM. Labels come from a
# fixed plan, not the model. Default provider is 'mock'; wire a real one via FOREN_LLM_*.
python synth.py plan --per-cell 60 --from data/jigsaw.jsonl --out plan.json
python synth.py generate --plan plan.json --out data/synth.jsonl --provider openai

# Hand-label the gold eval set (the safety asset — held out from training)
python eval_set.py template --texts candidates.txt --lang ar --out review.csv
python eval_set.py import --csv review.csv --out data/eval.jsonl

# Merge training sources, dedup, and inspect coverage before training
python data_tools.py merge --data data/jigsaw.jsonl data/synth.jsonl --out data/train.jsonl
python data_tools.py stats --data data/train.jsonl     # watch the tag×language blind-spot report
python data_tools.py validate --data data/train.jsonl  # CI-safe: non-zero exit on bad rows
```

`data_tools.py` (validate/stats/dedup/merge) is the gate every source flows
through; `map_public.py` seeds from public data; `synth.py` fills gaps; and
`eval_set.py` runs the human-labelling round-trip for the gold set. Keep
`source="gold-eval"` rows out of training and evaluate against them only.

## Safety (baked into the metrics)

Training/eval report **threat recall** and **high-severity recall**, not just F1 —
missing danger is the failure that matters. `evaluate.py` suggests per-tag
thresholds that favour recall (bias lower for threat/violence/sexual). Keep the
in-app outputs editable and labelled machine-generated.

## Vocab pruning (`prune_vocab.py`, ~3× smaller)

The `distilbert-base-multilingual-cased` int8 is ~135 MB — most of it the 119k
WordPiece embedding matrix. `prune_vocab.py` slices that to the vocab a corpus
actually uses, remaps ids, and rebuilds the tokenizer (preserving normalisation),
cutting the model to ~40–60 MB with **identical predictions** on covered text.

```bash
# Pass your FULL training data as the corpus — tokens absent from it become [UNK].
python prune_vocab.py --model-dir runs/v1 --corpus data/train.jsonl --out-dir runs/pruned
cp runs/pruned/{model.int8.onnx,tokenizer*.json,special_tokens_map.json,labels.json} \
   ../public/models/analysis/
```

Verified end-to-end: the seed model pruned 135 MB → **44 MB** with byte-for-byte
the same tags/severity as the unpruned model, and it runs correctly in-browser.
Gotcha handled: the tokenizer's TemplateProcessing post-processor hardcodes the
`[CLS]`/`[SEP]` ids, so those must be remapped too or the embedding lookup breaks.
