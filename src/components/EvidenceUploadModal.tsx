import { useRef, useState } from 'react';
import { Modal } from './Modal';
import { SeverityBadge } from './SeverityBadge';
import { PatternTag } from './PatternTag';
import { LoadingSpinner } from './LoadingSpinner';
import { analyzeText, type AnalysisResult } from '@/lib/analysis';
import { fileToDataUrl, runOcr, runAsr } from '@/lib/media';
import { useAddEvidence } from '@/data/queries';
import type { EvidenceType } from '@/types';

interface EvidenceUploadModalProps {
  caseId: string;
  onClose: () => void;
}

type Tab = 'text' | 'image' | 'audio';
const TAB_TYPE: Record<Tab, EvidenceType> = {
  text: 'message',
  image: 'screenshot',
  audio: 'audio',
};

function nowLocalInput(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

// Add evidence (spec 2.7): paste text, attach an image (OCR stub), or record /
// import audio (ASR stub). The (editable, machine-generated) text is what gets
// analysed and committed; the original media is encrypted alongside it.
export function EvidenceUploadModal({ caseId, onClose }: EvidenceUploadModalProps) {
  const addEvidence = useAddEvidence(caseId);
  const [tab, setTab] = useState<Tab>('text');
  const [content, setContent] = useState('');
  const [machineText, setMachineText] = useState(false); // from OCR/ASR
  const [media, setMedia] = useState<{ dataUrl: string; mimeType: string } | null>(null);
  const [when, setWhen] = useState(nowLocalInput());
  const [processing, setProcessing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const switchTab = (t: Tab) => {
    setTab(t);
    setMedia(null);
    setContent('');
    setMachineText(false);
    setAnalysis(null);
  };

  const handleImage = async (file: File) => {
    setProcessing(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      setMedia({ dataUrl, mimeType: file.type || 'image/png' });
      setContent(await runOcr(dataUrl));
      setMachineText(true);
      setAnalysis(null);
    } finally {
      setProcessing(false);
    }
  };

  const handleAudioBlob = async (blob: Blob) => {
    setProcessing(true);
    try {
      const dataUrl = await fileToDataUrl(blob);
      setMedia({ dataUrl, mimeType: blob.type || 'audio/webm' });
      setContent(await runAsr(dataUrl));
      setMachineText(true);
      setAnalysis(null);
    } finally {
      setProcessing(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        handleAudioBlob(new Blob(chunks.current, { type: 'audio/webm' }));
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      // Mic unavailable/denied — fall back to file import.
      setRecording(false);
    }
  };

  const stopRecording = () => {
    recorder.current?.stop();
    setRecording(false);
  };

  const runAnalysis = async () => {
    if (!content.trim()) return;
    setAnalyzing(true);
    try {
      setAnalysis(await analyzeText(content));
    } finally {
      setAnalyzing(false);
    }
  };

  const save = async () => {
    if (!content.trim()) return;
    const a = analysis ?? (await analyzeText(content));
    addEvidence.mutate(
      {
        caseId,
        type: TAB_TYPE[tab],
        timestamp: new Date(when).getTime(),
        content: content.trim(),
        severity: a.severity,
        severityNumeric: a.severityNumeric,
        patternTags: a.patternTags,
        media: media?.dataUrl,
        mediaType: media?.mimeType,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal
      title="Add evidence"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={!content.trim() || addEvidence.isPending}
            onClick={save}
          >
            {addEvidence.isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* tabs */}
        <div className="flex gap-2 text-xs">
          {(['text', 'image', 'audio'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => switchTab(t)}
              className={`rounded-md px-3 py-1 font-medium capitalize ${
                tab === t ? 'bg-plum text-primary' : 'bg-background text-secondary'
              }`}
            >
              {t === 'text' ? 'Paste text' : t}
            </button>
          ))}
        </div>

        {/* source-specific input */}
        {tab === 'image' && (
          <div className="flex flex-col gap-2">
            <label className="btn-secondary cursor-pointer text-center">
              Choose image
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleImage(e.target.files[0])}
              />
            </label>
            {media && <img src={media.dataUrl} alt="evidence" className="max-h-40 rounded-lg object-contain" />}
          </div>
        )}

        {tab === 'audio' && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary flex-1"
                onClick={recording ? stopRecording : startRecording}
              >
                {recording ? '■ Stop recording' : '● Record'}
              </button>
              <label className="btn-secondary flex-1 cursor-pointer text-center">
                Import file
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleAudioBlob(e.target.files[0])}
                />
              </label>
            </div>
            {media && <audio src={media.dataUrl} controls className="w-full" />}
          </div>
        )}

        {processing && <LoadingSpinner label="Processing…" />}

        <label className="flex flex-col gap-1">
          <span className="text-sm text-secondary">
            {tab === 'text' ? 'Message content' : 'Text'}
            {machineText && ' (machine-generated — may not be accurate)'}
          </span>
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setMachineText(false);
              setAnalysis(null);
            }}
            rows={4}
            placeholder={tab === 'text' ? 'Paste the message here…' : 'Extracted text appears here — edit as needed'}
            className="rounded-xl bg-background px-3 py-3 text-primary placeholder:text-secondary/60"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-secondary">When</span>
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="rounded-xl bg-background px-3 py-3 text-primary"
          />
          <span className="text-xs text-secondary/60">Claimed time; device clock may not be accurate.</span>
        </label>

        <div className="rounded-xl bg-background p-3">
          {analyzing ? (
            <LoadingSpinner label="Analyzing…" />
          ) : analysis ? (
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={analysis.severity} />
              {analysis.patternTags.length > 0 ? (
                analysis.patternTags.map((t) => <PatternTag key={t} tag={t} />)
              ) : (
                <span className="text-xs text-secondary">No patterns detected</span>
              )}
            </div>
          ) : (
            <button type="button" className="btn-secondary w-full" disabled={!content.trim()} onClick={runAnalysis}>
              Analyze
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
