// Media helpers for image/audio evidence.
//
// OCR (image→text) and ASR (audio→transcript) both run ENTIRELY ON-DEVICE via
// WebAssembly — Tesseract for OCR, a local Whisper model (transformers.js) for
// ASR. The evidence bytes never leave the device; only the model files are
// fetched (once, then cached by the browser). Both libraries are dynamically
// imported so they stay out of the main bundle and only load on first use.
//
// The extracted text is machine-generated and editable: the user corrects it
// before saving, and the saved text is what gets analysed + committed.

export function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const OCR_FALLBACK =
  '[Could not read text from this image automatically. Type or correct the text here.]';
const ASR_FALLBACK =
  '[Could not transcribe this audio automatically. Type or correct the transcript here.]';

/** Local OCR via Tesseract (WASM). Returns recognised text, or a fallback. */
export async function runOcr(dataUrl: string): Promise<string> {
  try {
    const mod = await import('tesseract.js');
    const recognize = (mod as { recognize?: typeof import('tesseract.js').recognize }).recognize
      ?? mod.default.recognize;
    const { data } = await recognize(dataUrl, 'eng');
    const text = data.text.trim();
    return text || OCR_FALLBACK;
  } catch (err) {
    console.error('OCR failed:', err);
    return OCR_FALLBACK;
  }
}

// Cache the ASR pipeline — loading the Whisper model is expensive, so reuse it
// across calls within a session.
let asrPipelinePromise: Promise<unknown> | null = null;

async function getAsrPipeline() {
  if (!asrPipelinePromise) {
    asrPipelinePromise = (async () => {
      const { pipeline, env } = await import('@xenova/transformers');
      env.allowLocalModels = false; // fetch the model from the HF hub
      return pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
    })();
  }
  return asrPipelinePromise;
}

/** Decode an audio data URL to mono 16 kHz PCM (what Whisper expects). */
async function decodeToPcm16k(dataUrl: string): Promise<Float32Array> {
  const buf = await (await fetch(dataUrl)).arrayBuffer();
  const Ctx: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx({ sampleRate: 16000 });
  try {
    const audio = await ctx.decodeAudioData(buf);
    return audio.getChannelData(0);
  } finally {
    void ctx.close();
  }
}

/** Local ASR via Whisper (WASM/ONNX). Returns transcript, or a fallback. */
export async function runAsr(dataUrl: string): Promise<string> {
  try {
    const pcm = await decodeToPcm16k(dataUrl);
    const transcriber = (await getAsrPipeline()) as (
      input: Float32Array,
    ) => Promise<{ text: string }>;
    const out = await transcriber(pcm);
    const text = out.text.trim();
    return text || ASR_FALLBACK;
  } catch (err) {
    console.error('ASR failed:', err);
    return ASR_FALLBACK;
  }
}
