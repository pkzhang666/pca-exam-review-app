import type { Deck, DeckMeta, DeckVisibility, ProgressMap, QuestionProgress } from './types';

const BASE = (
  (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8080'
).replace(/\/$/, '');

// Local dev auth: the backend (DEV_AUTH=true) trusts this header as the signed-in
// user. For production, replace authHeaders() with a Firebase ID token:
//   return { Authorization: `Bearer ${await getIdToken()}` }
const DEV_EMAIL = (import.meta.env.VITE_DEV_EMAIL as string | undefined) ?? 'me@example.com';

async function authHeaders(): Promise<Record<string, string>> {
  return { 'X-Dev-Email': DEV_EMAIL };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = { ...(init.headers ?? {}), ...(await authHeaders()) };
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    let message = `${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

// --- Decks -----------------------------------------------------------------

export async function listDecks(): Promise<DeckMeta[]> {
  return (await request<{ decks: DeckMeta[] }>('/decks')).decks;
}

export async function listSharedDecks(): Promise<DeckMeta[]> {
  return (await request<{ decks: DeckMeta[] }>('/decks/shared')).decks;
}

export async function getDeck(id: string): Promise<Deck> {
  return request<Deck>(`/decks/${id}`);
}

export async function uploadDeck(file: File, name: string): Promise<DeckMeta> {
  const form = new FormData();
  form.append('file', file);
  if (name) form.append('name', name);
  return request<DeckMeta>('/decks', { method: 'POST', body: form });
}

export async function setVisibility(id: string, visibility: DeckVisibility): Promise<DeckMeta> {
  return request<DeckMeta>(`/decks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visibility }),
  });
}

export async function deleteDeck(id: string): Promise<void> {
  await request<{ ok: boolean }>(`/decks/${id}`, { method: 'DELETE' });
}

// --- Progress --------------------------------------------------------------

interface ProgressResponse {
  answers: Record<string, QuestionProgress>;
}

export async function getProgress(deckId: string): Promise<ProgressMap> {
  const data = await request<ProgressResponse>(`/decks/${deckId}/progress`);
  const map: ProgressMap = {};
  for (const [key, value] of Object.entries(data.answers ?? {})) {
    map[Number(key)] = value;
  }
  return map;
}

export async function putProgress(deckId: string, progress: ProgressMap): Promise<void> {
  const answers: Record<string, QuestionProgress> = {};
  for (const [key, value] of Object.entries(progress)) {
    answers[key] = value;
  }
  await request<unknown>(`/decks/${deckId}/progress`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  });
}
