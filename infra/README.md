# Infrastructure

Terraform for the PDF-to-quiz backend: Cloud Run service, Firestore, a GCS
bucket for uploaded PDFs, a Cloud Tasks queue for the generation job, Artifact
Registry, and Secret Manager.

## Prerequisites

- `gcloud` authenticated against the target project (`gcloud auth application-default login`)
- `terraform` >= 1.5
- Docker

## One-time: create the image repo, then build & push

The Cloud Run service needs an image to exist before `apply`. Bootstrap the
Artifact Registry repo first, then build and push:

```sh
cd infra
cp terraform.tfvars.example terraform.tfvars   # fill in values

# 1. Create just the registry so we have somewhere to push.
terraform init
terraform apply -target=google_artifact_registry_repository.repo

# 2. Build & push the backend image.
REGION=us-central1
PROJECT=$(gcloud config get-value project)
IMAGE="$REGION-docker.pkg.dev/$PROJECT/pca-quiz/backend:v1"
gcloud auth configure-docker "$REGION-docker.pkg.dev"
docker build -t "$IMAGE" ../server
docker push "$IMAGE"

# 3. Set `image = "..."` in terraform.tfvars to the tag you just pushed.

# 4. Apply the rest.
terraform apply
```

`terraform output service_url` prints the backend base URL for the frontend.

## Firebase Auth (one-time, not in Terraform)

Terraform enables the Identity Toolkit API, but the Google sign-in provider and
the web app registration are set up once in the Firebase console:

1. Add the GCP project to Firebase (console.firebase.google.com) if it isn't
   already, then **Authentication → Sign-in method → enable Google**.
2. **Project settings → Your apps → Web app**: register one and copy the config
   (`apiKey`, `authDomain`, `projectId`, `appId`). The frontend uses these to
   sign users in; the backend needs none of them — it verifies ID tokens via
   the runtime service account's Application Default Credentials.
3. Add `authDomain` (e.g. `your-app.firebaseapp.com`) and your hosting origin to
   `allowed_origins`.

Who can actually sign in is controlled by `allowed_emails` / `allowed_domains`
(the invite-only allowlist), enforced in the backend on every request.

## Notes

- **Firestore**: a project can have only one `(default)` database. If yours
  already has one, set `create_firestore = false`.
- **LLM provider**: set exactly one of `gemini_api_key` or `anthropic_api_key`
  (Gemini is much cheaper). Only the key you set is written to Secret Manager and
  wired into Cloud Run; the provider is auto-detected, or force it with
  `llm_provider`. `task_secret` is always created. Keep `terraform.tfvars` and
  state out of git. There is no shared app token — auth is per-user via Firebase.
- **Cost control**: `per_user_daily_cap` and `daily_deck_cap` bound decks/day;
  `max_pages` (900) bounds per-deck size. A full 900-page deck on Claude Opus is
  roughly $3–5 in tokens; on `gemini-2.5-flash` it's a fraction of that. Set
  `billing_account` to also create a budget alert.
- Updating the backend = build/push a new tag, set `image`, `terraform apply`.
