locals {
  services = [
    "run.googleapis.com",
    "cloudtasks.googleapis.com",
    "firestore.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "storage.googleapis.com",
    "identitytoolkit.googleapis.com", # Firebase Auth (Google sign-in)
  ]
}

resource "google_project_service" "enabled" {
  for_each           = toset(local.services)
  service            = each.value
  disable_on_destroy = false
}

# --- Artifact Registry (holds the backend image) ---------------------------

resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = "pca-quiz"
  format        = "DOCKER"
  description   = "PCA quiz backend images"
  depends_on    = [google_project_service.enabled]
}

# --- GCS bucket for uploaded source PDFs -----------------------------------

resource "google_storage_bucket" "uploads" {
  name                        = "${var.project_id}-pca-quiz-uploads"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = true

  lifecycle_rule {
    condition { age = var.upload_retention_days }
    action { type = "Delete" }
  }
  depends_on = [google_project_service.enabled]
}

# --- Firestore (deck + question + quota documents) -------------------------

resource "google_firestore_database" "default" {
  count       = var.create_firestore ? 1 : 0
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"
  depends_on  = [google_project_service.enabled]
}

# --- Cloud Tasks queue (runs the long generation job off the request path) -

resource "google_cloud_tasks_queue" "gen" {
  name     = "deck-generation"
  location = var.region

  rate_limits {
    max_dispatches_per_second = 5
    max_concurrent_dispatches = 10
  }
  retry_config {
    max_attempts = 3
    min_backoff  = "30s"
    max_backoff  = "300s"
  }
  depends_on = [google_project_service.enabled]
}

# --- Runtime service account -----------------------------------------------

resource "google_service_account" "run" {
  account_id   = "pca-quiz-run"
  display_name = "PCA quiz backend runtime"
}

resource "google_project_iam_member" "firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.run.email}"
}

resource "google_project_iam_member" "tasks_enqueuer" {
  project = var.project_id
  role    = "roles/cloudtasks.enqueuer"
  member  = "serviceAccount:${google_service_account.run.email}"
}

resource "google_storage_bucket_iam_member" "uploads_rw" {
  bucket = google_storage_bucket.uploads.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.run.email}"
}

# --- Secrets ----------------------------------------------------------------
# Only create the LLM key(s) you actually provide; task-secret is always made.

locals {
  llm_secrets = merge(
    var.anthropic_api_key == "" ? {} : { "anthropic-api-key" = var.anthropic_api_key },
    var.gemini_api_key == "" ? {} : { "gemini-api-key" = var.gemini_api_key },
  )
  all_secrets = merge(local.llm_secrets, { "task-secret" = var.task_secret })

  # Maps each created secret to its Cloud Run env var name.
  secret_env_name = {
    "anthropic-api-key" = "ANTHROPIC_API_KEY"
    "gemini-api-key"    = "GEMINI_API_KEY"
    "task-secret"       = "TASK_SECRET"
  }
}

resource "google_secret_manager_secret" "this" {
  for_each  = local.all_secrets
  secret_id = each.key
  replication {
    auto {}
  }
  depends_on = [google_project_service.enabled]
}

resource "google_secret_manager_secret_version" "this" {
  for_each    = local.all_secrets
  secret      = google_secret_manager_secret.this[each.key].id
  secret_data = each.value
}

resource "google_secret_manager_secret_iam_member" "accessor" {
  for_each  = google_secret_manager_secret.this
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.run.email}"
}

# --- Cloud Run service ------------------------------------------------------

resource "google_cloud_run_v2_service" "backend" {
  name     = "pca-quiz-backend"
  location = var.region

  template {
    service_account                  = google_service_account.run.email
    timeout                          = "1800s"
    max_instance_request_concurrency = 20

    scaling {
      min_instance_count = 0
      max_instance_count = 4
    }

    containers {
      image = var.image
      ports { container_port = 8080 }

      resources {
        limits = {
          cpu    = "2"
          memory = "2Gi"
        }
        startup_cpu_boost = true
      }

      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "LOCATION"
        value = var.region
      }
      env {
        name  = "UPLOAD_BUCKET"
        value = google_storage_bucket.uploads.name
      }
      env {
        name  = "TASKS_QUEUE"
        value = google_cloud_tasks_queue.gen.name
      }
      env {
        name  = "MODEL"
        value = var.model
      }
      env {
        name  = "GEMINI_MODEL"
        value = var.gemini_model
      }
      env {
        name  = "LLM_PROVIDER"
        value = var.llm_provider
      }
      env {
        name  = "MAX_PAGES"
        value = tostring(var.max_pages)
      }
      env {
        name  = "PAGES_PER_CHUNK"
        value = tostring(var.pages_per_chunk)
      }
      env {
        name  = "QUESTIONS_PER_CHUNK"
        value = tostring(var.questions_per_chunk)
      }
      env {
        name  = "DAILY_DECK_CAP"
        value = tostring(var.daily_deck_cap)
      }
      env {
        name  = "PER_USER_DAILY_CAP"
        value = tostring(var.per_user_daily_cap)
      }
      env {
        name  = "ALLOWED_EMAILS"
        value = join(",", var.allowed_emails)
      }
      env {
        name  = "ALLOWED_DOMAINS"
        value = join(",", var.allowed_domains)
      }
      env {
        name  = "ALLOWED_ORIGINS"
        value = join(",", var.allowed_origins)
      }

      # One secret env var per created secret (whichever keys were provided).
      dynamic "env" {
        for_each = google_secret_manager_secret.this
        content {
          name = local.secret_env_name[env.key]
          value_source {
            secret_key_ref {
              secret  = env.value.secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  lifecycle {
    precondition {
      condition     = var.anthropic_api_key != "" || var.gemini_api_key != ""
      error_message = "Set at least one of anthropic_api_key or gemini_api_key."
    }
  }

  depends_on = [
    google_secret_manager_secret_iam_member.accessor,
    google_project_iam_member.firestore,
    google_project_iam_member.tasks_enqueuer,
  ]
}

# Public at the network edge; Firebase ID tokens + the allowlist gate every
# real route inside the app (and TASK_SECRET gates the internal task route).
resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.backend.name
  location = google_cloud_run_v2_service.backend.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# --- Optional monthly budget alert -----------------------------------------
# Created only when billing_account is set (needs billing.budgets perms).

resource "google_project_service" "billingbudgets" {
  count              = var.billing_account == "" ? 0 : 1
  service            = "billingbudgets.googleapis.com"
  disable_on_destroy = false
}

resource "google_billing_budget" "monthly" {
  count           = var.billing_account == "" ? 0 : 1
  billing_account = var.billing_account
  display_name    = "pca-quiz monthly budget"

  budget_filter {
    projects = ["projects/${var.project_id}"]
  }
  amount {
    specified_amount {
      currency_code = "USD"
      units         = tostring(var.monthly_budget_usd)
    }
  }
  threshold_rules { threshold_percent = 0.5 }
  threshold_rules { threshold_percent = 0.9 }
  threshold_rules { threshold_percent = 1.0 }

  depends_on = [google_project_service.billingbudgets]
}
