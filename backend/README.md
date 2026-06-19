# PCA quiz backend

Turns an uploaded PDF (up to 900 pages) into a multiple-choice study deck using
Claude, with per-user auth, private/shared decks, and server-side progress.

- Runtime: Node 22, Express, TypeScript
- Storage: Firestore (decks, content, progress, quota) + GCS (uploaded PDFs)
- Async generation: Cloud Tasks → in-process chunked generation
- Auth: Firebase ID tokens + an invite-only allowlist

## Run it locally (no GCP, no Firebase, no API key)

Local mode swaps the cloud dependencies for emulators and stubs: Firebase auth
becomes a trusted header, Cloud Tasks becomes an in-process call, and generation
returns canned questions. You can exercise the whole upload → process → study
flow offline and for free.

```sh
cd backend
npm install
docker compose up -d            # Firestore + GCS emulators
cp .env.local.example .env.local
npm run dev                     # reads .env.local, watches for changes
```

Then drive it with curl (the `X-Dev-Email` header stands in for a signed-in user):

```sh
BASE=http://localhost:8080
HDR='-H X-Dev-Email:me@example.com'

# Upload a PDF -> returns a deck with status "processing"
curl $HDR -F file=@/path/to/notes.pdf -F name="My deck" $BASE/decks

# List your decks (watch status flip to "ready", chunksDone/chunksTotal climb)
curl $HDR $BASE/decks

# Fetch a deck with its questions
curl $HDR $BASE/decks/<id>

# Save / load study progress
curl $HDR -X PUT -H 'Content-Type: application/json' \
  -d '{"answers":{"1":{"selected":["A"],"status":"correct"}}}' \
  $BASE/decks/<id>/progress
curl $HDR $BASE/decks/<id>/progress

# Share / unshare, delete
curl $HDR -X PATCH -H 'Content-Type: application/json' -d '{"visibility":"shared"}' $BASE/decks/<id>
curl $HDR -X DELETE $BASE/decks/<id>
```

To test **real** generation locally, set `MOCK_GENERATION=false` and provide one
LLM key in `.env.local` — either `GEMINI_API_KEY=...` (cheaper) or
`ANTHROPIC_API_KEY=sk-ant-...`. The provider is auto-detected from whichever key
is present (Gemini preferred if both are set; force it with `LLM_PROVIDER`).
Everything else stays on the emulators.

## LLM provider

Generation works with either Google Gemini or Anthropic Claude — set whichever
key you have. Selection order: `LLM_PROVIDER` if set, else Gemini if
`GEMINI_API_KEY` is present, else Anthropic if `ANTHROPIC_API_KEY` is present.
Both providers return the same question schema (validated with the same zod
schema), so decks are identical regardless of provider. Defaults:
`gemini-2.5-flash` / `claude-opus-4-8`.

## Local-mode env switches

| Var | Local | Production |
|-----|-------|------------|
| `DEV_AUTH` | `true` — trust `X-Dev-Email` | unset — verify Firebase tokens + allowlist |
| `MOCK_GENERATION` | `true` — canned questions | unset — call Claude |
| `USE_CLOUD_TASKS` | `false` — run in-process | unset — enqueue Cloud Tasks |
| `FIRESTORE_EMULATOR_HOST` / `STORAGE_EMULATOR_HOST` | set to emulators | unset |

## Deploy

See [`../infra/README.md`](../infra/README.md) for the Terraform + build/push flow.
