variable "project_id" {
  type        = string
  description = "GCP project ID."
}

variable "region" {
  type        = string
  default     = "us-central1"
  description = "Region for Cloud Run, Cloud Tasks, Artifact Registry, and the bucket."
}

variable "image" {
  type        = string
  description = "Full container image URI for the backend (e.g. us-central1-docker.pkg.dev/PROJECT/pca-quiz/backend:TAG). Build & push before apply."
}

variable "create_firestore" {
  type        = bool
  default     = true
  description = "Create the (default) Firestore database. Set false if the project already has one — a project can only have one."
}

variable "anthropic_api_key" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Anthropic API key (optional). Set this OR gemini_api_key. Stored in Secret Manager only if non-empty."
}

variable "gemini_api_key" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Google Gemini API key (optional). Set this OR anthropic_api_key. Stored in Secret Manager only if non-empty."
}

variable "llm_provider" {
  type        = string
  default     = ""
  description = "Force the provider: 'anthropic' or 'gemini'. Empty = auto-detect from whichever key is set (Gemini preferred)."
  validation {
    condition     = contains(["", "anthropic", "gemini"], var.llm_provider)
    error_message = "llm_provider must be empty, 'anthropic', or 'gemini'."
  }
}

variable "allowed_emails" {
  type        = list(string)
  default     = []
  description = "Invite-only allowlist: individual Google account emails permitted to sign in."
}

variable "allowed_domains" {
  type        = list(string)
  default     = []
  description = "Invite-only allowlist: email domains permitted to sign in (e.g. example.com)."
}

variable "allowed_origins" {
  type        = list(string)
  default     = []
  description = "CORS allowlist: exact origins the browser app is served from (e.g. https://app.example.com)."
}

variable "task_secret" {
  type        = string
  sensitive   = true
  description = "Shared secret Cloud Tasks presents on the internal /tasks/generate callback."
}

variable "model" {
  type        = string
  default     = "claude-opus-4-8"
  description = "Anthropic model used when provider is anthropic."
}

variable "gemini_model" {
  type        = string
  default     = "gemini-2.5-flash"
  description = "Gemini model used when provider is gemini."
}

variable "max_pages" {
  type        = number
  default     = 900
  description = "Reject PDFs longer than this."
}

variable "pages_per_chunk" {
  type        = number
  default     = 10
  description = "Pages per generation chunk (must be <= 100, Claude's PDF page limit). Smaller = more complete extraction of existing questions."
}

variable "questions_per_chunk" {
  type        = number
  default     = 5
  description = "Questions generated per chunk."
}

variable "daily_deck_cap" {
  type        = number
  default     = 50
  description = "Max decks generated per UTC day across all users (global)."
}

variable "per_user_daily_cap" {
  type        = number
  default     = 5
  description = "Max decks generated per UTC day per user."
}

variable "billing_account" {
  type        = string
  default     = ""
  description = "Billing account ID for the optional budget alert. Leave empty to skip."
}

variable "monthly_budget_usd" {
  type        = number
  default     = 50
  description = "Monthly budget amount (USD) for the alert, when billing_account is set."
}

variable "upload_retention_days" {
  type        = number
  default     = 2
  description = "Lifecycle age (days) after which uploaded source PDFs are deleted from GCS."
}
