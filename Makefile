.DEFAULT_GOAL := help

.PHONY: help up down restart logs ps load load-stop test lint clean

help: ## Show this help message
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-12s %s\n", $$1, $$2}'

up: ## Start the entire lab (creates .env from .env.example if missing)
	@test -f .env || cp .env.example .env
	docker compose up -d --build

down: ## Stop the lab containers
	docker compose down

restart: down up ## Restart the lab

logs: ## Follow logs of all containers
	docker compose logs -f

ps: ## Check containers status
	docker compose ps

load: ## Start the traffic generator container
	docker compose --profile load up -d loadgen

load-stop: ## Stop the traffic generator container
	docker compose stop loadgen

test: ## Run smoke tests against the running lab
	@echo "==> Checking App via Nginx..."
	@curl -fsS http://localhost:8080/ > /dev/null && echo "App is healthy (HTTP 200)"
	@echo "==> Checking Prometheus targets..."
	@curl -fsS http://localhost:9090/api/v1/targets | grep -q '"health":"up"' && echo "Prometheus targets are UP"
	@echo "==> Checking Telegraf metrics export..."
	@curl -fsS http://localhost:9090/api/v1/query?query=up | grep -q 'telegraf:9273' && echo "Telegraf metrics ingested"

lint: ## Validate Compose, Prometheus and Telegraf configurations
	@echo "==> Validating docker-compose.yml..."
	docker compose config -q
	@echo "==> Validating prometheus.yml..."
	docker run --rm --entrypoint promtool -v $(PWD)/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro prom/prometheus:v2.55.1 check config /etc/prometheus/prometheus.yml
	@echo "==> Validating telegraf.conf..."
	docker run --rm -v $(PWD)/telegraf/telegraf.conf:/etc/telegraf/telegraf.conf:ro telegraf:1.33 telegraf config check --config /etc/telegraf/telegraf.conf
	@echo "Configuration valid!"

clean: ## Stop lab and wipe all volumes (pgdata, promdata, grafanadata)
	docker compose down -v
