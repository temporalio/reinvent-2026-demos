# Every target wraps Compose, so the host needs only Docker, Compose and make (guide 00).
# `temporal` CLI calls pass --disable-config-file so a developer's default profile can't point
# the demo at a real Cloud namespace (guide 01).
COMPOSE ?= docker compose
TEMPORAL ?= $(COMPOSE) exec temporal temporal --disable-config-file --address 127.0.0.1:7233

.PHONY: demo test e2e invoke kill-agent arm64 reset workflows logs down

demo: ## Build the images and start the whole stack (offline, stub model)
	$(COMPOSE) up --build --detach
	@echo "Demo:        http://localhost:8080"
	@echo "Temporal UI: http://localhost:8233"

test: ## Run the Python and Go tests inside containers
	$(COMPOSE) --profile test run --rm --build test-agent
	$(COMPOSE) --profile test run --rm --build test-api

e2e: ## Run the whole story against `make demo` through the published ports
	./scripts/e2e.sh

invoke: ## POST /invocations to the agent, as Temporal Cloud does on AgentCore
	curl -sS -X POST -H 'Content-Type: application/json' -d '{}' http://localhost:8081/invocations; echo

kill-agent: ## Kill the agent's process and start an empty one, like a new AgentCore session
	$(COMPOSE) kill agent
	$(COMPOSE) start agent

arm64: ## Build the agent image for linux/arm64, the only architecture AgentCore runs
	docker buildx build --platform linux/arm64 --target runtime -t agentcore-oncall-agent:arm64 agent

reset: ## Return the local demo to its starting state (the hosted copy has no state to reset)
	$(COMPOSE) down --volumes
	$(COMPOSE) up --detach

workflows: ## List running Workflows on the local dev server
	$(TEMPORAL) workflow list --query 'ExecutionStatus="Running"'

logs:
	$(COMPOSE) logs --follow

down:
	$(COMPOSE) down --volumes
