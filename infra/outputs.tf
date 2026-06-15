output "service_url" {
  value       = google_cloud_run_v2_service.backend.uri
  description = "Base URL of the backend. Set this as the API base in the frontend."
}

output "image_repository" {
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.repo.repository_id}"
  description = "Push backend images here."
}

output "upload_bucket" {
  value = google_storage_bucket.uploads.name
}
