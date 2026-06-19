import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../api';
import type { DeckMeta } from '../types';

interface DecksScreenProps {
  onOpen: (deckId: string) => void;
}

export function DecksScreen({ onOpen }: DecksScreenProps) {
  const [decks, setDecks] = useState<DeckMeta[]>([]);
  const [shared, setShared] = useState<DeckMeta[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [own, sh] = await Promise.all([api.listDecks(), api.listSharedDecks()]);
      setDecks(own);
      setShared(sh);
      setLoadError(null);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'failed to load decks');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll while any deck is still processing.
  const anyProcessing = decks.some((d) => d.status === 'processing');
  useEffect(() => {
    if (!anyProcessing) return;
    const t = setInterval(() => void refresh(), 2500);
    return () => clearInterval(t);
  }, [anyProcessing, refresh]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      await api.uploadDeck(file, name.trim());
      setFile(null);
      setName('');
      if (fileInput.current) fileInput.current.value = '';
      await refresh();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleShareToggle = async (deck: DeckMeta) => {
    await api
      .setVisibility(deck.id, deck.visibility === 'shared' ? 'private' : 'shared')
      .then(refresh)
      .catch(() => {});
  };

  const handleDelete = async (deck: DeckMeta) => {
    if (!window.confirm(`Delete “${deck.name}”? This cannot be undone.`)) return;
    await api.deleteDeck(deck.id).then(refresh).catch(() => {});
  };

  return (
    <div className="decks-screen">
      <header className="decks-header">
        <h1>Study decks</h1>
        <p className="subtitle">Upload a PDF and turn it into multiple-choice questions.</p>
      </header>

      <form className="upload-card" onSubmit={handleUpload}>
        <div className="upload-row">
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <input
            type="text"
            placeholder="Deck name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="primary-button" disabled={!file || uploading}>
            {uploading ? 'Uploading…' : 'Generate deck'}
          </button>
        </div>
        {uploadError && <p className="error-text">{uploadError}</p>}
        <p className="hint">PDF up to 900 pages. Generation runs in the background.</p>
      </form>

      {loadError && <p className="error-text">Couldn’t load decks: {loadError}</p>}

      <section>
        <h2 className="section-title">Your decks</h2>
        {decks.length === 0 && <p className="muted">No decks yet — upload a PDF above.</p>}
        <ul className="deck-list">
          {decks.map((deck) => (
            <DeckCard
              key={deck.id}
              deck={deck}
              owned
              onOpen={onOpen}
              onShareToggle={handleShareToggle}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      </section>

      {shared.length > 0 && (
        <section>
          <h2 className="section-title">Shared with everyone</h2>
          <ul className="deck-list">
            {shared.map((deck) => (
              <DeckCard key={deck.id} deck={deck} owned={false} onOpen={onOpen} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

interface DeckCardProps {
  deck: DeckMeta;
  owned: boolean;
  onOpen: (deckId: string) => void;
  onShareToggle?: (deck: DeckMeta) => void;
  onDelete?: (deck: DeckMeta) => void;
}

function DeckCard({ deck, owned, onOpen, onShareToggle, onDelete }: DeckCardProps) {
  const pct =
    deck.chunksTotal > 0 ? Math.round((deck.chunksDone / deck.chunksTotal) * 100) : 0;

  return (
    <li className="deck-card">
      <div className="deck-card-main">
        <span className="deck-name">{deck.name}</span>
        <span className="deck-meta">
          {deck.pageCount > 0 ? `${deck.pageCount} pages` : 'built-in'}
          {owned && deck.visibility === 'shared' ? ' · shared' : ''}
          {!owned ? ` · by ${deck.ownerEmail}` : ''}
        </span>

        {deck.status === 'processing' && (
          <div className="deck-progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="deck-meta">
              Generating… {deck.chunksDone}/{deck.chunksTotal || '?'} sections
            </span>
          </div>
        )}
        {deck.status === 'ready' && (
          <span className="deck-meta">{deck.questionCount} questions</span>
        )}
        {deck.status === 'failed' && (
          <span className="error-text">Failed: {deck.error ?? 'unknown error'}</span>
        )}
      </div>

      <div className="deck-card-actions">
        <button
          type="button"
          className="primary-button"
          disabled={deck.status !== 'ready'}
          onClick={() => onOpen(deck.id)}
        >
          Study
        </button>
        {owned && onShareToggle && (
          <button type="button" className="ghost-button" onClick={() => onShareToggle(deck)}>
            {deck.visibility === 'shared' ? 'Unshare' : 'Share'}
          </button>
        )}
        {owned && onDelete && (
          <button type="button" className="ghost-button danger" onClick={() => onDelete(deck)}>
            Delete
          </button>
        )}
      </div>
    </li>
  );
}
