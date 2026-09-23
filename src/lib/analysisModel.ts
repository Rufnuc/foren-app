import type { SeverityLabel, SeverityLevel } from '@/types';
import type { AnalysisResult } from './analysis';

// On-device evidence classifier (ONNX/int8) — the trained replacement for the
// keyword heuristic in analysis.ts. Runs entirely on the device via WebAssembly
// (onnxruntime-web), like OCR/ASR. The model files live in
// public/models/analysis/ and are loaded lazily on first use; if they are absent
// (the default until a trained model is dropped in) every call returns null and
// analysis.ts falls back to the keyword heuristic. Nothing here ever leaves the
// device.
//
// Model contract (see ml/export_onnx.py): inputs input_ids + attention_mask;
// outputs tag_logits (sigmoid + per-tag threshold → tags) and severity_logits
// (softmax/argmax + 1 → 1..4). Labels + optional thresholds in labels.json.

const MODEL_BASE = '/models/analysis';
const MAX_LEN = 128;

// Recall-favoured defaults (over-flag danger, let the survivor dismiss). Any
// per-tag thresholds in labels.json (from evaluate.py) override these.
const DEFAULT_THRESHOLD = 0.5;
const LOW_THRESHOLD = 0.35;
const DANGER_TAGS = new Set(['threat', 'physical-violence', 'sexual']);

const SEV: SeverityLabel[] = ['low', 'medium', 'high', 'critical'];

interface Labels {
  tags: string[];
  thresholds?: Record<string, number>;
}

let availabilityPromise: Promise<boolean> | null = null;
let labelsPromise: Promise<Labels> | null = null;
let tokenizerPromise: Promise<unknown> | null = null;
let sessionPromise: Promise<unknown> | null = null;

/** True if a model has been placed in public/models/analysis/. Cached. */
export function modelAvailable(): Promise<boolean> {
  if (!availabilityPromise) {
    availabilityPromise = fetch(`${MODEL_BASE}/labels.json`, { method: 'GET' })
      .then((r) => r.ok)
      .catch(() => false);
  }
  return availabilityPromise;
}

function getLabels(): Promise<Labels> {
  if (!labelsPromise) labelsPromise = fetch(`${MODEL_BASE}/labels.json`).then((r) => r.json());
  return labelsPromise;
}

function getTokenizer(): Promise<unknown> {
  if (!tokenizerPromise) {
    tokenizerPromise = (async () => {
      const { AutoTokenizer, env } = await import('@xenova/transformers');
      env.allowLocalModels = true; // load our tokenizer from /models/analysis/
      env.localModelPath = '/models/';
      return AutoTokenizer.from_pretrained('analysis');
    })();
  }
  return tokenizerPromise;
}

function getSession(): Promise<unknown> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort = await import('onnxruntime-web');
      // Serve the WASM from the CDN (consistent with the app's other on-device
      // models); self-host for a fully-offline build.
      ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/';
      return ort.InferenceSession.create(`${MODEL_BASE}/model.int8.onnx`);
    })();
  }
  return sessionPromise;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Classify text with the trained model, or null if the model is unavailable or
 * inference fails (caller falls back to the heuristic). On-device only.
 */
export async function classifyWithModel(text: string): Promise<AnalysisResult | null> {
  if (!text.trim()) return null;
  if (!(await modelAvailable())) return null;
  try {
    const ort = await import('onnxruntime-web');
    const [tokenizer, session, labels] = await Promise.all([getTokenizer(), getSession(), getLabels()]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enc = await (tokenizer as any)(text, { truncation: true, max_length: MAX_LEN });
    const inputIds = new ort.Tensor('int64', enc.input_ids.data, enc.input_ids.dims);
    const attention = new ort.Tensor('int64', enc.attention_mask.data, enc.attention_mask.dims);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await (session as any).run({ input_ids: inputIds, attention_mask: attention });
    const tagLogits = out.tag_logits.data as Float32Array;
    const sevLogits = out.severity_logits.data as Float32Array;

    const patternTags: string[] = [];
    labels.tags.forEach((tag, i) => {
      const p = sigmoid(tagLogits[i]);
      const threshold = labels.thresholds?.[tag] ?? (DANGER_TAGS.has(tag) ? LOW_THRESHOLD : DEFAULT_THRESHOLD);
      if (p >= threshold) patternTags.push(tag);
    });

    let best = 0;
    for (let i = 1; i < sevLogits.length; i++) if (sevLogits[i] > sevLogits[best]) best = i;
    const severityNumeric = (best + 1) as SeverityLevel;

    return { severity: SEV[best], severityNumeric, patternTags };
  } catch (err) {
    console.error('analysis model inference failed, falling back to heuristic:', err);
    return null;
  }
}
