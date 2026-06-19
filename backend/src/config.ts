// Load .env.local for local development. Absent in production (and ignored
// there) — keeps secrets out of the image.
try {
  (process as NodeJS.Process & { loadEnvFile?: (p: string) => void }).loadEnvFile?.(
    ".env.local",
  );
} catch {
  /* no .env.local present — fine */
}

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) throw new Error(`Env var ${name} must be an integer`);
  return n;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw === "true" || raw === "1";
}

export type Provider = "anthropic" | "gemini" | "none";

function resolveProvider(): Provider {
  const explicit = (process.env.LLM_PROVIDER ?? "").toLowerCase();
  if (explicit === "anthropic" || explicit === "gemini") return explicit;
  if ((process.env.GEMINI_API_KEY ?? "") !== "") return "gemini";
  if ((process.env.ANTHROPIC_API_KEY ?? "") !== "") return "anthropic";
  return "none";
}

function csvEnv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export const config = {
  port: intEnv("PORT", 8080),

  // GCP wiring
  projectId: env("GOOGLE_CLOUD_PROJECT", ""),
  location: env("LOCATION", "us-central1"),
  bucket: env("UPLOAD_BUCKET", ""),
  tasksQueue: env("TASKS_QUEUE", "deck-generation"),
  // Optional override for the Cloud Tasks callback base URL; normally derived
  // from the incoming request.
  serviceUrl: env("SERVICE_URL", ""),

  // LLM provider keys — set whichever you have. Provider is auto-selected from
  // whichever key is present (Gemini preferred when both are set), or forced
  // with LLM_PROVIDER=anthropic|gemini.
  anthropicApiKey: env("ANTHROPIC_API_KEY", ""),
  geminiApiKey: env("GEMINI_API_KEY", ""),
  provider: resolveProvider(),
  taskSecret: env("TASK_SECRET", ""), // shared secret Cloud Tasks presents on callback

  // Access control: invite-only allowlist of Google accounts.
  allowedEmails: csvEnv("ALLOWED_EMAILS"),
  allowedDomains: csvEnv("ALLOWED_DOMAINS"),
  // CORS: exact origins the browser app is served from.
  allowedOrigins: csvEnv("ALLOWED_ORIGINS"),

  // Generation tuning
  model: env("MODEL", "claude-opus-4-8"), // Anthropic model
  geminiModel: env("GEMINI_MODEL", "gemini-2.5-flash"),
  maxPages: intEnv("MAX_PAGES", 900),
  // Smaller chunks let the model extract every question on its pages without
  // hitting output limits. <= 100 (Claude PDF page limit).
  pagesPerChunk: intEnv("PAGES_PER_CHUNK", 10),
  questionsPerChunk: intEnv("QUESTIONS_PER_CHUNK", 5), // mock mode only

  genConcurrency: intEnv("GEN_CONCURRENCY", 4),

  // Answer grading: a second, independent Claude pass re-derives each question's
  // answer and flags (does not change) any that disagree with the generated key.
  // Off by default; requires ANTHROPIC_API_KEY regardless of the generation provider.
  verifyAnswers: boolEnv("VERIFY_ANSWERS", false),
  verifyModel: env("VERIFY_MODEL", "claude-opus-4-8"),
  verifyBatchSize: intEnv("VERIFY_BATCH_SIZE", 5), // questions graded per LLM call
  verifyConcurrency: intEnv("VERIFY_CONCURRENCY", 3),
  dailyDeckCap: intEnv("DAILY_DECK_CAP", 50), // global decks/day
  perUserDailyCap: intEnv("PER_USER_DAILY_CAP", 5), // decks/day per user
  maxUploadBytes: intEnv("MAX_UPLOAD_BYTES", 150 * 1024 * 1024),

  // Local development switches (all default to production behaviour)
  devAuth: boolEnv("DEV_AUTH", false), // skip Firebase; trust X-Dev-Email header
  mockGeneration: boolEnv("MOCK_GENERATION", false), // canned questions, no API call
  useCloudTasks: boolEnv("USE_CLOUD_TASKS", true), // false → run the job in-process
};

export type Config = typeof config;
