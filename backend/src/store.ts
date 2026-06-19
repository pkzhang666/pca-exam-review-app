import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Firestore, FieldValue } from "@google-cloud/firestore";
import { Storage } from "@google-cloud/storage";
import { CloudTasksClient } from "@google-cloud/tasks";
import { config } from "./config";
import {
  Deck,
  DeckMeta,
  DeckProgress,
  DeckStatus,
  DeckVisibility,
  Question,
  QuestionProgress,
} from "./types";

const db = new Firestore({ projectId: config.projectId || undefined });
const storage = new Storage({ projectId: config.projectId || undefined });
const tasks = new CloudTasksClient();

const decks = db.collection("decks"); // metadata only — kept light for listing
const progress = db.collection("progress"); // doc id `${uid}__${deckId}`
const quota = db.collection("quota"); // doc id `${day}` and `${day}__${uid}`

// Questions live in a per-deck `pages` subcollection (decks/{id}/pages/{n}),
// each page holding a slice of questions. This keeps every document well under
// Firestore's 1 MiB limit regardless of deck size.
const QUESTIONS_PER_PAGE = 40;
const pagesCol = (deckId: string) => decks.doc(deckId).collection("pages");

interface QuestionPage {
  index: number;
  questions: Question[];
}

// --- Deck metadata ---------------------------------------------------------

export async function createDeck(meta: DeckMeta): Promise<void> {
  await decks.doc(meta.id).set(meta);
}

export async function getDeckMeta(id: string): Promise<DeckMeta | null> {
  const snap = await decks.doc(id).get();
  return snap.exists ? (snap.data() as DeckMeta) : null;
}

export async function setDeckStatus(
  id: string,
  status: DeckStatus,
  extra: Partial<DeckMeta> = {},
): Promise<void> {
  await decks.doc(id).set({ status, ...extra }, { merge: true });
}

export async function setChunkTotal(id: string, total: number): Promise<void> {
  await decks.doc(id).set({ chunksTotal: total, chunksDone: 0 }, { merge: true });
}

export async function incrementChunksDone(id: string): Promise<void> {
  await decks.doc(id).set({ chunksDone: FieldValue.increment(1) }, { merge: true });
}

export async function updateVisibility(id: string, visibility: DeckVisibility): Promise<void> {
  await decks.doc(id).set({ visibility }, { merge: true });
}

const byCreatedDesc = (a: DeckMeta, b: DeckMeta) => b.createdAt.localeCompare(a.createdAt);

export async function listOwnDecks(uid: string): Promise<DeckMeta[]> {
  // Single-field equality filter — no composite index needed; sort in memory.
  const snap = await decks.where("ownerUid", "==", uid).get();
  return snap.docs.map((d) => d.data() as DeckMeta).sort(byCreatedDesc);
}

export async function listSharedDecks(uid: string): Promise<DeckMeta[]> {
  // Shared decks owned by *other* users (your own already appear in listOwnDecks).
  const snap = await decks.where("visibility", "==", "shared").get();
  return snap.docs
    .map((d) => d.data() as DeckMeta)
    .filter((d) => d.ownerUid !== uid)
    .sort(byCreatedDesc);
}

export async function deleteDeck(id: string): Promise<void> {
  const pages = await pagesCol(id).get();
  await Promise.all(pages.docs.map((d) => d.ref.delete()));
  const progSnap = await progress.where("deckId", "==", id).get();
  await Promise.all(progSnap.docs.map((d) => d.ref.delete()));
  await decks.doc(id).delete();
}

// --- Deck content (questions, paged) ---------------------------------------

export async function saveQuestions(id: string, questions: Question[]): Promise<void> {
  const col = pagesCol(id);
  const batch = db.batch();

  // Clear any existing pages first so re-saving (e.g. a retried job or a
  // re-run seed) doesn't leave stale pages behind.
  const existing = await col.get();
  for (const doc of existing.docs) batch.delete(doc.ref);

  let pageIndex = 0;
  for (let i = 0; i < questions.length; i += QUESTIONS_PER_PAGE) {
    const page: QuestionPage = { index: pageIndex, questions: questions.slice(i, i + QUESTIONS_PER_PAGE) };
    batch.set(col.doc(String(pageIndex)), page);
    pageIndex += 1;
  }
  batch.set(decks.doc(id), { questionCount: questions.length, status: "ready" }, { merge: true });
  await batch.commit();
}

export async function getDeck(id: string): Promise<Deck | null> {
  const meta = await getDeckMeta(id);
  if (!meta) return null;
  const snap = await pagesCol(id).get();
  const questions = snap.docs
    .map((d) => d.data() as QuestionPage)
    .sort((a, b) => a.index - b.index)
    .flatMap((p) => p.questions);
  return { ...meta, questions };
}

// --- Study progress (per user per deck) ------------------------------------

const progressId = (uid: string, deckId: string) => `${uid}__${deckId}`;

// Durable on-disk mirror of study progress. The local Firestore emulator is
// in-memory, so its data vanishes on restart — this file is the backup of
// record. Writes mirror here; reads self-heal Firestore from here when empty.
// Keyed by `${uid}__${deckId}`. Gitignored (it's per-user data).
const PROGRESS_BACKUP = resolve(__dirname, "../data/progress-backup.json");

function loadProgressBackup(): Record<string, DeckProgress> {
  try {
    if (!existsSync(PROGRESS_BACKUP)) return {};
    return JSON.parse(readFileSync(PROGRESS_BACKUP, "utf8")) as Record<string, DeckProgress>;
  } catch {
    return {};
  }
}

function saveProgressBackup(data: Record<string, DeckProgress>): void {
  try {
    mkdirSync(dirname(PROGRESS_BACKUP), { recursive: true });
    writeFileSync(PROGRESS_BACKUP, JSON.stringify(data, null, 2));
  } catch (err) {
    console.warn(
      `progress backup write failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export async function getProgress(uid: string, deckId: string): Promise<DeckProgress | null> {
  const id = progressId(uid, deckId);
  const snap = await progress.doc(id).get();
  if (snap.exists) return snap.data() as DeckProgress;

  // Firestore has nothing (e.g. the emulator was wiped). Restore from the
  // durable file backup if we have it, repopulating Firestore as we go.
  const backup = loadProgressBackup()[id];
  if (backup) {
    await progress.doc(id).set(backup).catch(() => undefined);
    return backup;
  }
  return null;
}

export async function putProgress(
  uid: string,
  deckId: string,
  answers: Record<string, QuestionProgress>,
): Promise<DeckProgress> {
  const id = progressId(uid, deckId);
  const doc: DeckProgress = {
    uid,
    deckId,
    answers,
    updatedAt: new Date().toISOString(),
  };
  await progress.doc(id).set(doc);

  // Mirror to the durable on-disk backup so progress survives emulator wipes.
  const backup = loadProgressBackup();
  backup[id] = doc;
  saveProgressBackup(backup);
  return doc;
}

// --- Quota: global + per-user daily caps -----------------------------------

export async function tryReserveQuota(uid: string): Promise<{ ok: boolean; reason?: string }> {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const globalRef = quota.doc(day);
  const userRef = quota.doc(`${day}__${uid}`);

  return db.runTransaction(async (tx) => {
    const [g, u] = await tx.getAll(globalRef, userRef);
    const globalCount = (g.exists ? (g.data()?.count as number) : 0) ?? 0;
    const userCount = (u.exists ? (u.data()?.count as number) : 0) ?? 0;

    if (userCount >= config.perUserDailyCap) {
      return { ok: false, reason: "per-user daily limit reached" };
    }
    if (globalCount >= config.dailyDeckCap) {
      return { ok: false, reason: "service daily limit reached" };
    }
    tx.set(globalRef, { count: FieldValue.increment(1) }, { merge: true });
    tx.set(userRef, { count: FieldValue.increment(1) }, { merge: true });
    return { ok: true };
  });
}

// --- Uploaded PDF in GCS ----------------------------------------------------

const pdfObject = (id: string) => `uploads/${id}.pdf`;

/** Create the upload bucket if missing. Used against the local GCS emulator,
 *  where the bucket isn't pre-provisioned by Terraform. The SDK's createBucket
 *  can 404 against fake-gcs-server, so hit its JSON API directly. */
export async function ensureBucket(): Promise<void> {
  const emulator = process.env.STORAGE_EMULATOR_HOST;
  if (emulator) {
    try {
      await fetch(`${emulator}/storage/v1/b?project=${config.projectId || "local-dev"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: config.bucket }),
      });
    } catch {
      /* emulator may be unreachable yet; uploads will surface the error */
    }
    return;
  }
  await storage.createBucket(config.bucket).catch(() => undefined);
}

export async function uploadPdf(id: string, bytes: Buffer): Promise<void> {
  await storage.bucket(config.bucket).file(pdfObject(id)).save(bytes, {
    contentType: "application/pdf",
    resumable: false,
  });
}

export async function downloadPdf(id: string): Promise<Uint8Array> {
  const emulator = process.env.STORAGE_EMULATOR_HOST;
  if (emulator) {
    // The SDK's media-download path doesn't match fake-gcs-server; use its JSON
    // media endpoint directly. Real GCS uses the SDK path below.
    const url = `${emulator}/storage/v1/b/${config.bucket}/o/${encodeURIComponent(
      pdfObject(id),
    )}?alt=media`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`emulator download failed: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  const [contents] = await storage.bucket(config.bucket).file(pdfObject(id)).download();
  return contents;
}

export async function deletePdf(id: string): Promise<void> {
  await storage
    .bucket(config.bucket)
    .file(pdfObject(id))
    .delete({ ignoreNotFound: true });
}

// --- Cloud Tasks: enqueue the generation job -------------------------------

export async function enqueueGeneration(deckId: string, baseUrl: string): Promise<void> {
  const parent = tasks.queuePath(config.projectId, config.location, config.tasksQueue);
  const target = (config.serviceUrl || baseUrl).replace(/\/$/, "");
  await tasks.createTask({
    parent,
    task: {
      httpRequest: {
        httpMethod: "POST",
        url: `${target}/tasks/generate`,
        headers: {
          "Content-Type": "application/json",
          "X-Task-Secret": config.taskSecret,
        },
        body: Buffer.from(JSON.stringify({ deckId })).toString("base64"),
      },
      dispatchDeadline: { seconds: 1800 },
    },
  });
}
