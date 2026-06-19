# QuizForge — local dev orchestration
#
# Frontend: Vite (frontend/)       -> http://localhost:5173
# Backend:  Express/tsx watch (backend/) -> http://localhost:8080
#
# Run both with a single command from the project root:
#   make dev
#
# Ctrl+C stops both processes cleanly.

FRONTEND_DIR := frontend
BACKEND_DIR := backend
FRONTEND_PORT := 5173
BACKEND_PORT := 8080

.DEFAULT_GOAL := dev
.PHONY: dev frontend backend kill-ports install install-frontend install-backend build clean help

## dev: run frontend + backend together (Ctrl+C stops both)
dev: kill-ports
	@echo "Starting backend (:$(BACKEND_PORT)) and frontend (:$(FRONTEND_PORT))... Ctrl+C to stop both."
	@trap 'kill 0' INT TERM EXIT; \
	( cd $(BACKEND_DIR) && npm run dev ) & \
	( cd $(FRONTEND_DIR) && npm run dev ) & \
	wait

## kill-ports: free the dev ports by stopping any leftover servers
kill-ports:
	@for p in $(FRONTEND_PORT) $(BACKEND_PORT); do \
		pids=$$(lsof -ti tcp:$$p 2>/dev/null); \
		if [ -n "$$pids" ]; then \
			echo "Freeing port $$p (killing $$pids)"; \
			kill $$pids 2>/dev/null || true; \
		fi; \
	done

## frontend: run only the Vite frontend
frontend:
	cd $(FRONTEND_DIR) && npm run dev

## backend: run only the backend (tsx watch)
backend:
	cd $(BACKEND_DIR) && npm run dev

## install: install dependencies for both frontend and backend
install: install-frontend install-backend

install-frontend:
	cd $(FRONTEND_DIR) && npm install

install-backend:
	cd $(BACKEND_DIR) && npm install

## build: production build for both frontend and backend
build:
	cd $(FRONTEND_DIR) && npm run build
	cd $(BACKEND_DIR) && npm run build

## clean: remove build artifacts
clean:
	rm -rf $(FRONTEND_DIR)/dist $(BACKEND_DIR)/dist

## help: list available targets
help:
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/## /  /'
