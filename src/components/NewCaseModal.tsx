import { useState } from 'react';
import { Modal } from './Modal';

interface NewCaseModalProps {
  onClose: () => void;
  onCreate: (input: { title: string; description?: string; startDate: number }) => void;
  saving?: boolean;
}

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

// Create a new case (spec 2.4).
export function NewCaseModal({ onClose, onCreate, saving }: NewCaseModalProps) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayInputValue());
  const [description, setDescription] = useState('');

  const submit = () => {
    if (!title.trim()) return;
    onCreate({
      title: title.trim(),
      description: description.trim() || undefined,
      startDate: new Date(date).getTime(),
    });
  };

  return (
    <Modal
      title="Create a new case"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={!title.trim() || saving}
            onClick={submit}
          >
            {saving ? 'Creating…' : 'Create'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-secondary">Case title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Harassment from…"
            className="rounded-xl bg-background px-3 py-3 text-primary placeholder:text-secondary/60"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-secondary">Start date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xl bg-background px-3 py-3 text-primary"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-secondary">Description (optional)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Private notes…"
            className="rounded-xl bg-background px-3 py-3 text-primary placeholder:text-secondary/60"
          />
        </label>
      </div>
    </Modal>
  );
}
