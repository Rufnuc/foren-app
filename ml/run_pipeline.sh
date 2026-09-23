#!/usr/bin/env bash
# End-to-end model build: merge your data with the seed, validate, train,
# evaluate, vocab-prune, and deploy the pruned model into the app.
#
#   ./run_pipeline.sh [path/to/your-data.jsonl]
#
# Your data must be JSONL rows of {text, lang, tags, severity} (see README /
# data/sample.jsonl). With no argument it just (re)builds from the seed.
# NOTE: evaluate here runs on the training data (optimistic). For a real safety
# read, hold out a hand-labelled eval set and evaluate against that instead.
set -euo pipefail
cd "$(dirname "$0")"
PY=.venv/bin/python
OUT=runs/v1

if [ "${1:-}" != "" ]; then
  echo "== merging $1 + data/seed.jsonl =="
  "$PY" data_tools.py merge "$1" data/seed.jsonl --out data/train.jsonl
else
  echo "== no data given; building from seed only =="
  cp data/seed.jsonl data/train.jsonl
fi

"$PY" data_tools.py validate --data data/train.jsonl
"$PY" data_tools.py stats --data data/train.jsonl
"$PY" train.py --data data/train.jsonl --output "$OUT" --epochs 20
"$PY" evaluate.py --model-dir "$OUT" --data data/train.jsonl
"$PY" prune_vocab.py --model-dir "$OUT" --corpus data/train.jsonl --out-dir runs/pruned

echo "== deploying pruned model to ../public/models/analysis =="
cp runs/pruned/{model.int8.onnx,tokenizer.json,tokenizer_config.json,special_tokens_map.json,labels.json} \
   ../public/models/analysis/
rm -f ../public/models/analysis/vocab.txt
echo "Done — pruned model deployed. Reload the app to use it."
