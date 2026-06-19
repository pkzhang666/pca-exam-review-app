import { randomUUID } from "node:crypto";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { z } from "zod";
import { config } from "./config";
import { getUser, requireUser } from "./auth";
import { DeckMeta, QuestionProgress } from "./types";
import { countPages } from "./pdf";
import { runGeneration } from "./job";
import { ensureBuiltinDeck } from "./seed";
import {
  createDeck,
  deleteDeck,
  deletePdf,
  enqueueGeneration,
  ensureBucket,
  getDeck,
  getDeckMeta,
  getProgress,
  listOwnDecks,
  listSharedDecks,
  putProgress,
  setDeckStatus,
  tryReserveQuota,
  updateVisibility,
  uploadPdf,
} from "./store";

const app = express();
app.set("trust proxy", true); // honour X-Forwarded-Proto/-For behind Cloud Run
// This is a JSON API, not an HTML app — a Content-Security-Policy is meaningless
// here and only produces noisy browser/DevTools console warnings. Keep the other
// hardening headers; the frontend sets its own CSP.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: config.allowedOrigins.length > 0 ? config.allowedOrigins : false,
    methods: ["GET", "POST", "PATCH", "DELETE"],
  }),
);
app.use(express.json({ limit: "1mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes },
});

// Per-user rate limit on the API surface (keyed by uid set by requireUser).
const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    try {
      return getUser(req).uid;
    } catch {
      return req.ip ?? "anon";
    }
  },
});

function asyncRoute(
  fn: (req: Request, res: Response) => Promise<unknown>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => fn(req, res).catch(next);
}

// --- health ----------------------------------------------------------------

app.get("/healthz", (_req, res) => res.json({ ok: true }));

// --- authenticated API -----------------------------------------------------

const api = express.Router();
api.use(requireUser, apiLimiter);

api.get(
  "/decks",
  asyncRoute(async (req, res) => {
    const { uid } = getUser(req);
    res.json({ decks: await listOwnDecks(uid) });
  }),
);

api.get(
  "/decks/shared",
  asyncRoute(async (req, res) => {
    const { uid } = getUser(req);
    res.json({ decks: await listSharedDecks(uid) });
  }),
);

api.get(
  "/decks/:id",
  asyncRoute(async (req, res) => {
    const { uid } = getUser(req);
    const deck = await getDeck(req.params.id);
    if (!deck) return res.status(404).json({ error: "not found" });
    if (deck.ownerUid !== uid && deck.visibility !== "shared") {
      return res.status(404).json({ error: "not found" });
    }
    res.json(deck);
  }),
);

const visibilitySchema = z.object({ visibility: z.enum(["private", "shared"]) });

api.patch(
  "/decks/:id",
  asyncRoute(async (req, res) => {
    const { uid } = getUser(req);
    const parsed = visibilitySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid body" });
    const meta = await getDeckMeta(req.params.id);
    if (!meta || meta.ownerUid !== uid) return res.status(404).json({ error: "not found" });
    await updateVisibility(req.params.id, parsed.data.visibility);
    res.json({ ...meta, visibility: parsed.data.visibility });
  }),
);

api.delete(
  "/decks/:id",
  asyncRoute(async (req, res) => {
    const { uid } = getUser(req);
    const meta = await getDeckMeta(req.params.id);
    if (!meta || meta.ownerUid !== uid) return res.status(404).json({ error: "not found" });
    await deleteDeck(req.params.id);
    await deletePdf(req.params.id).catch(() => undefined);
    res.json({ ok: true });
  }),
);

const nameSchema = z.string().trim().min(1).max(120).optional();

api.post(
  "/decks",
  upload.single("file"),
  asyncRoute(async (req, res) => {
    const { uid, email } = getUser(req);
    const file = req.file;
    if (!file) return res.status(400).json({ error: "missing file" });
    if (file.mimetype !== "application/pdf") {
      return res.status(400).json({ error: "file must be a PDF" });
    }
    const nameParse = nameSchema.safeParse(req.body?.name);
    if (!nameParse.success) return res.status(400).json({ error: "invalid name" });

    let pageCount: number;
    try {
      pageCount = await countPages(file.buffer);
    } catch {
      return res.status(400).json({ error: "could not read PDF" });
    }
    if (pageCount > config.maxPages) {
      return res
        .status(413)
        .json({ error: `PDF has ${pageCount} pages; limit is ${config.maxPages}` });
    }

    const reservation = await tryReserveQuota(uid);
    if (!reservation.ok) return res.status(429).json({ error: reservation.reason });

    const id = randomUUID();
    const meta: DeckMeta = {
      id,
      ownerUid: uid,
      ownerEmail: email,
      name: nameParse.data || file.originalname.replace(/\.pdf$/i, "") || "Untitled deck",
      sourceFilename: file.originalname,
      pageCount,
      status: "processing",
      visibility: "private",
      questionCount: 0,
      chunksDone: 0,
      chunksTotal: 0,
      createdAt: new Date().toISOString(),
    };

    await uploadPdf(id, file.buffer);
    await createDeck(meta);

    if (config.useCloudTasks) {
      await enqueueGeneration(id, `${req.protocol}://${req.get("host")}`);
    } else {
      // Local dev: no Cloud Tasks — run the job in-process, after responding.
      void runGeneration(id).catch((err) => {
        console.error(`local generation failed for ${id}`, err);
        return setDeckStatus(id, "failed", {
          error: err instanceof Error ? err.message : "generation failed",
        });
      });
    }

    res.status(202).json(meta);
  }),
);

// --- study progress --------------------------------------------------------

const progressSchema = z.object({
  answers: z.record(
    z.string(),
    z.object({
      selected: z.array(z.string()),
      status: z.enum(["unanswered", "correct", "wrong"]),
    }),
  ),
});

async function canAccessDeck(uid: string, deckId: string): Promise<boolean> {
  const meta = await getDeckMeta(deckId);
  return !!meta && (meta.ownerUid === uid || meta.visibility === "shared");
}

api.get(
  "/decks/:id/progress",
  asyncRoute(async (req, res) => {
    const { uid } = getUser(req);
    if (!(await canAccessDeck(uid, req.params.id))) {
      return res.status(404).json({ error: "not found" });
    }
    const prog = await getProgress(uid, req.params.id);
    res.json(prog ?? { uid, deckId: req.params.id, answers: {}, updatedAt: null });
  }),
);

api.put(
  "/decks/:id/progress",
  asyncRoute(async (req, res) => {
    const { uid } = getUser(req);
    const parsed = progressSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid body" });
    if (!(await canAccessDeck(uid, req.params.id))) {
      return res.status(404).json({ error: "not found" });
    }
    const answers = parsed.data.answers as Record<string, QuestionProgress>;
    res.json(await putProgress(uid, req.params.id, answers));
  }),
);

// --- internal: Cloud Tasks generation worker -------------------------------

app.post(
  "/tasks/generate",
  asyncRoute(async (req, res) => {
    if (req.header("x-task-secret") !== config.taskSecret) {
      return res.status(401).json({ error: "unauthorized" });
    }
    const deckId = req.body?.deckId as string | undefined;
    if (!deckId) return res.status(400).json({ error: "missing deckId" });

    // Run to completion before acking so Cloud Tasks retries transient failures.
    await runGeneration(deckId);
    res.json({ ok: true });
  }),
);

// Mount the authenticated router last so the public routes above (healthz,
// /tasks/generate) match first and never trigger requireUser.
app.use(api);

// --- error handler ---------------------------------------------------------

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "file too large" });
  }
  console.error(err);
  res.status(500).json({ error: "internal error" });
});

async function start(): Promise<void> {
  // Against the local GCS emulator the bucket isn't pre-created by Terraform.
  if (process.env.STORAGE_EMULATOR_HOST) await ensureBucket();
  // The Firestore emulator is in-memory, so its data is wiped on restart.
  // Re-seed the built-in PCA deck so it survives emulator restarts. In prod
  // (real Firestore), data persists and you seed once via `npm run seed`.
  if (process.env.FIRESTORE_EMULATOR_HOST) await ensureBuiltinDeck();
  if (!config.mockGeneration && config.provider === "none") {
    console.warn(
      "WARNING: no LLM provider configured (set GEMINI_API_KEY or ANTHROPIC_API_KEY). " +
        "Generation will fail until one is set.",
    );
  } else if (!config.mockGeneration) {
    console.log(`generation provider: ${config.provider}`);
  }
  app.listen(config.port, () => {
    console.log(`pca-quiz-backend listening on :${config.port}`);
  });
}

void start();
