"""Demo eligibility from explicit station policy and source-reviewed requirements.

This module does not probe providers, authenticate users, or stop running demos.
"""
from __future__ import annotations

from copy import deepcopy
from typing import Mapping

DEFAULT_CONTROLS = {
    "internet": "unknown",
    "camera": "unknown",
    "github_login": "unknown",
    "aws": "unknown",
    "models": "unknown",
    "demo_overrides": {},
}


def validate_controls(current: dict, update: dict, demo_ids) -> dict:
    if not isinstance(update, dict) or set(update) - set(DEFAULT_CONTROLS):
        raise ValueError("Unknown station setting")
    result = deepcopy(current)
    for key, value in update.items():
        if key == "demo_overrides":
            if not isinstance(value, dict) or set(value) - set(demo_ids):
                raise ValueError("Unknown demo override")
            if any(v is not None and type(v) is not bool for v in value.values()):
                raise ValueError("Demo overrides must be true, false or null (inherit)")
            result[key].update(value)
        else:
            allowed = {"unknown", "online", "offline"} if key == "internet" else {"unknown", "ready", "unavailable"}
            if not isinstance(value, str) or value not in allowed:
                raise ValueError(f"Invalid {key} setting")
            result[key] = value
    return result


def effective_enabled(default: bool, global_enabled: bool | None, station_override: bool | None) -> bool:
    """A station override wins over the booth policy, including a global disable."""
    return station_override if station_override is not None else global_enabled if global_enabled is not None else default


def availability(demo: dict, capability: dict, controls: dict, mode: str,
                 config: Mapping[str, str], *, installed: bool = True,
                 global_enabled: bool | None = None) -> dict:
    key = demo["id"]
    reasons: list[str] = []
    warnings: list[str] = []
    badges: list[str] = []
    enabled = effective_enabled(capability["default_enabled"], global_enabled, controls["demo_overrides"].get(key))
    if not enabled:
        reasons.append("Disabled for this station" if controls["demo_overrides"].get(key) is False else "Disabled by catalog default" if global_enabled is None else "Disabled by booth policy")
    if not installed:
        reasons.append("Demo source folder is missing")

    needs_internet = capability["internet"] == "required" or mode == "cloud"
    reduced = False
    provider = "mock"
    if key == "no-roads":
        reduced = mode == "local"
        needs_internet = mode == "cloud"
        if mode == "cloud" and not config.get("NO_ROADS_TASK_QUEUE"):
            reasons.append("Configure the deployed No Roads Lambda task queue")
    if key == "loan" and mode == "cloud" and not config.get("LOAN_TASK_QUEUE"):
        reasons.append("Configure the deployed Loan Lambda task queue")
    if key == "photo-booth":
        provider = "mock" if mode == "local" else config.get("HOLODECK_IMAGE_PROVIDER") or ("openai" if config.get("OPENAI_API_KEY") else "mock")
        email = "outbox" if mode == "local" else config.get("HOLODECK_EMAIL_PROVIDER", "outbox")
        needs_internet |= provider != "mock" or email != "outbox"
        reduced = provider == "mock"
        badges.append("Mock images" if reduced else "Live image service")
        badges.append("Local email outbox" if email == "outbox" else "Live email delivery")
        if provider == "openai" and not config.get("OPENAI_API_KEY"):
            reasons.append("Configure the OpenAI image provider key")
        if email == "sendgrid" and not config.get("SENDGRID_API_KEY"):
            reasons.append("Configure the SendGrid email provider key")
        if controls["camera"] == "unavailable":
            reasons.append("Camera unavailable on this station")
        elif controls["camera"] == "unknown":
            warnings.append("Camera not checked; public Photo Booth use needs a working camera")
        badges.append("Camera required")
    if mode == "cloud":
        if not all(config.get(k) for k in ("TEMPORAL_CLOUD_ADDRESS", "TEMPORAL_CLOUD_NAMESPACE", "TEMPORAL_CLOUD_API_KEY")):
            reasons.append("Configure Temporal Cloud credentials")
        badges.append("Temporal Cloud needs internet")
    if needs_internet:
        badges.insert(0, "Internet required")
        if controls["internet"] == "offline":
            reasons.append("Internet is marked offline" + ("; select local Temporal where supported" if mode == "cloud" else ""))
        elif controls["internet"] == "unknown":
            warnings.append("Internet reachability has not been checked")
    else:
        badges.insert(0, "Local execution")
    if reduced:
        badges.append("Reduced experience")
    if key == "agentic-sdlc":
        badges.extend(["GitHub account required", "Model service required"])
        if config.get("ENABLE_AGENTIC_SDLC", "").lower() not in {"1", "true"}:
            reasons.append("Complete setup and set ENABLE_AGENTIC_SDLC=true")
        if not config.get("GITHUB_TOKEN"):
            reasons.append("Configure a booth GitHub token")
        if controls["github_login"] != "ready":
            reasons.append("Check the booth GitHub login and webhook setup on this Mac")
        if not any(config.get(k) for k in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY")):
            reasons.append("Configure a model provider key")
    if key == "agent-harness" and not config.get("GEMINI_API_KEY"):
        reasons.append("Configure Gemini for conversation; scripted preview needs separate setup")
    services = capability.get("services", [])
    needs_aws = ("aws" in services and not (key == "no-roads" and mode == "local")) or (key == "photo-booth" and provider == "bedrock")
    needs_models = "models" in services or (key == "photo-booth" and provider != "mock")
    for requirement, applies in (("aws", needs_aws), ("models", needs_models)):
        if not applies:
            continue
        label = "AWS access" if requirement == "aws" else "Model service"
        badge = label + " required"
        if badge not in badges:
            badges.append(badge)
        if controls[requirement] == "unavailable":
            reasons.append(f"{requirement.upper() if requirement == 'aws' else 'Model service'} unavailable")
        elif controls[requirement] == "unknown":
            warnings.append(f"{requirement.upper() if requirement == 'aws' else 'Model service'} access not checked")
    return {
        "enabled": enabled, "available": not reasons, "reasons": reasons,
        "warnings": warnings, "badges": badges, "requires_internet": needs_internet,
        "experience": "reduced" if reduced else "standard",
        "offline_support": capability["offline"], "offline_verified": False,
        "note": capability["note"],
    }
