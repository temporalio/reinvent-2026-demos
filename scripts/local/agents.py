"""Local presentation adapters for demos that require real AI/GitHub providers.

These run the actual web applications against Temporal OSS. They intentionally do
not start provider workers or report a successful agent run without credentials.
"""


def apply(services, spec, root, apps, port):
    """Add provider-limited web services; return launchpad capability metadata."""
    selected = set(apps)
    notices = {}
    common = {
        "TEMPORAL_ADDRESS": "temporal:7233",
        "TEMPORAL_ENDPOINT": "temporal:7233",
        "TEMPORAL_NAMESPACE": "default",
        "TEMPORAL_API_KEY": "",
        "TEMPORAL_TLS": "false",
        "TEMPORAL_UI_URL": f"http://localhost:{port}/_temporal/primary",
        "TEMPORAL_UI_NAMESPACE": "default",
        "LOCAL_PREVIEW": "1",
        "UV_NO_SYNC": "1",
        "AWS_EC2_METADATA_DISABLED": "true",
    }

    def web(component_name):
        component = spec["components"][component_name]
        recipe = spec["builds"][component["build"]]
        service = {
            "build": {"context": str(root / recipe["context"]), "dockerfile": str(root / recipe["dockerfile"])},
            "init": True,
            "environment": dict(common),
            "depends_on": {"temporal-init": {"condition": "service_completed_successfully"}},
        }
        if component.get("args"):
            service["command"] = component["args"]
        if component.get("command"):
            service["entrypoint"] = component["command"]
        return service

    if "agent-harness" in selected:
        service = web("travel-web")
        service["environment"].update({
            "TEMPORAL_TASK_QUEUE": "ri26-travel", "TRUST_AUTH_HEADERS": "false",
            "BOOTH_STATION_SCOPING": "true",
            "PAYLOAD_DIR": "/tmp/preview-payloads", "PAYLOAD_BUCKET": "",
            "GEMINI_API_KEY": "", "GOOGLE_API_KEY": "",
        })
        service["healthcheck"] = {"test": ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')"], "interval": "3s", "timeout": "5s", "retries": 30}
        services["travel-web"] = service
        notices["agent-harness"] = "Presentation preview: Gemini inference is disabled."

    if "agentic-sdlc" in selected:
        services["redis"] = {
            "image": f"redis:{spec['redis']['version']}",
            "healthcheck": {"test": ["CMD", "redis-cli", "ping"], "interval": "3s", "timeout": "3s", "retries": 30},
        }
        service = web("sdlc-web")
        service["environment"].update({
            "TEMPORAL_TASK_QUEUE": "ri26-sdlc", "BASE_TASK_QUEUE": "ri26-sdlc",
            "REDIS_URL": "redis://redis:6379/0", "GITHUB_TOKEN": "",
            "GITHUB_SANDBOX_REPO": "local/preview-unconfigured",
            "GITHUB_WEBHOOK_SECRET": "local-preview-not-a-provider-credential",
            "ENABLED_PROVIDERS": "openai", "OPENAI_API_KEY": "",
            "PUBLIC_URL": f"http://localhost:{port}/agentic-sdlc",
        })
        service["depends_on"]["redis"] = {"condition": "service_healthy"}
        service["healthcheck"] = {"test": ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/healthz')"], "interval": "3s", "timeout": "5s", "retries": 30}
        services["sdlc-web"] = service
        notices["agentic-sdlc"] = "Presentation preview: GitHub actions and model inference are disabled."

    return {"availableDemos": list(notices), "notices": notices}
