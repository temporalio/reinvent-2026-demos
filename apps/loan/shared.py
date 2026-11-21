"""Shared models and helpers for the loan demo."""

import os
from dataclasses import dataclass
from typing import Optional


def temporal_connect_args() -> tuple[str, dict]:
    """Return (address, kwargs) for Client.connect() based on TEMPORAL_ENV."""
    env = os.environ.get("TEMPORAL_ENV") or ("cloud" if os.environ.get("TEMPORAL_API_KEY") else "local")
    if env == "cloud":
        address = os.environ.get("TEMPORAL_CLOUD_ADDRESS") or os.environ["TEMPORAL_ADDRESS"]
        return address, {
            "namespace": os.environ.get("TEMPORAL_CLOUD_NAMESPACE") or os.environ["TEMPORAL_NAMESPACE"],
            "api_key": os.environ.get("TEMPORAL_CLOUD_API_KEY") or os.environ["TEMPORAL_API_KEY"],
            "tls": True,
        }
    return os.environ.get("TEMPORAL_LOCAL_ADDRESS") or os.environ.get("TEMPORAL_ADDRESS", "localhost:7233"), {
        "namespace": os.environ.get("TEMPORAL_LOCAL_NAMESPACE") or os.environ.get("TEMPORAL_NAMESPACE", "default"),
    }


@dataclass
class LoanApplicant:
    id: str
    name: str
    occupation: str
    loan_amount: float
    loan_purpose: str
    annual_income: float
    credit_score: int
    fun_fact: str


@dataclass
class LoanDecision:
    applicant_name: str
    ai_recommendation: str  # "APPROVE" or "REJECT"
    ai_reasoning: str
    human_decision: Optional[str] = None  # "APPROVED" or "REJECTED"
    human_override: bool = False  # True if human disagreed with AI