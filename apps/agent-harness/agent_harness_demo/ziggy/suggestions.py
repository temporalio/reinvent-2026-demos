"""A small helper agent that writes the replies the traveler can tap instead of typing.

At the booth nobody should need the on-screen keyboard. Before the first message, Claude Haiku
on Amazon Bedrock suggests four trip requests to start from; after each of Ziggy's replies, it
suggests up to four answers that move the booking forward. Ziggy's Workflow runs this as an
ordinary Activity and publishes the result as the ``suggestions`` state, so the page gets the
buttons on the same event stream as everything else.

No ``from __future__ import annotations`` here: these models cross Temporal's pydantic converter.
"""

import logging
import os
import random
from datetime import date

from pydantic import BaseModel
from temporalio import activity

from temporal_agent_harness.harness.state import HarnessState

logger = logging.getLogger(__name__)

# The Bedrock model, injected by the DemoProject's aws.bedrock block. Unset (for example in a
# local run without AWS credentials), the opening ideas come from STARTERS and replies are skipped.
MODEL_ENV = "SUGGEST_MODEL_ID"
MAX_SUGGESTIONS = 4


class Suggestions(HarnessState):
    """Messages the traveler can send with one tap, for the conversation as it stands."""

    replies: list[str] = []


class Exchange(BaseModel):
    traveler: str
    ziggy: str


class SuggestRequest(BaseModel):
    today: date
    # Empty before the first message: then the helper suggests whole trips to start from.
    transcript: list[Exchange] = []


# Used when no model is configured, so a local run still opens with something to tap.
STARTERS = [
    "Fly Ada Lovelace from SFO to JFK next Friday, back Sunday, with a hotel near Central Park.",
    "Book me a long weekend in Lisbon from Boston next month. I'm Grace Hopper.",
    "Plan a family trip from Chicago to Orlando over spring break for the Okafor family.",
    "Get Alan Turing from Seattle to Las Vegas for re:Invent, with a hotel near the Venetian.",
    "Find Katherine Johnson a business trip from Atlanta to London, Monday to Thursday next week.",
    "Plan a ski weekend in Denver from Dallas for Linus, flying out Friday morning.",
    "Book Margaret Hamilton a trip from Austin to Tokyo in two weeks, premium economy.",
    "Plan a honeymoon in Honolulu from Los Angeles in June for Sam and Alex Rivera.",
]

# One is picked at random per idea, so two sessions rarely open with the same four trips.
TRIP_KINDS = [
    "a weekend city break", "a business trip", "a family vacation", "a beach getaway",
    "a conference trip", "a ski trip", "an international adventure", "a food and wine trip",
    "a last-minute escape", "a honeymoon", "a trip to see a live sports game",
    "a national park trip",
]

START_PROMPT = """\
Today is {today}. Write {count} different opening messages a traveler might send to Ziggy, a \
travel agent that searches and books flights and hotels. Make them {kinds}, one each.
Each message is one sentence under 110 characters, in the traveler's voice. It names the \
traveler, a US departure city, a destination, and dates relative to today (for example "next \
Friday" or "in two weeks"), so Ziggy can start searching without asking anything."""

REPLY_PROMPT = """\
Here is a conversation between a traveler and Ziggy, a travel agent that searches and books \
flights and hotels. Today is {today}.

{transcript}

Write up to {count} short replies the traveler could send next, each under 60 characters. \
Answer what Ziggy just asked with concrete values (a name, a date, a fare class, a seat, \
"Yes, book it"), and make the replies different from each other so the traveler has a real \
choice. Every reply should move the trip forward. If Ziggy finished the booking, offer next \
steps such as adding a hotel or a return flight."""

OFFER_TOOL = {
    "toolSpec": {
        "name": "offer_replies",
        "description": "Offer the messages the traveler can tap to send.",
        "inputSchema": {
            "json": {
                "type": "object",
                "properties": {
                    "replies": {
                        "type": "array",
                        "items": {"type": "string"},
                        "maxItems": MAX_SUGGESTIONS,
                    }
                },
                "required": ["replies"],
            }
        },
    }
}


def _prompt(request: SuggestRequest) -> str:
    if not request.transcript:
        kinds = random.sample(TRIP_KINDS, MAX_SUGGESTIONS)
        return START_PROMPT.format(today=request.today, count=MAX_SUGGESTIONS, kinds=", ".join(kinds))
    # The last few exchanges are enough to answer what Ziggy just asked.
    lines = []
    for exchange in request.transcript[-3:]:
        lines += [f"Traveler: {exchange.traveler}", f"Ziggy: {exchange.ziggy[-2000:]}"]
    return REPLY_PROMPT.format(today=request.today, count=MAX_SUGGESTIONS, transcript="\n".join(lines))


@activity.defn
async def suggest_replies(request: SuggestRequest) -> list[str]:
    """Ask Claude Haiku for the messages the traveler can tap next."""
    model_id = os.environ.get(MODEL_ENV, "").strip()
    if not model_id:
        return random.sample(STARTERS, MAX_SUGGESTIONS) if not request.transcript else []

    import aioboto3  # installed with temporalio[aioboto3]; imported here to keep it off the workflow path

    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION")
    async with aioboto3.Session().client("bedrock-runtime", region_name=region) as bedrock:
        response = await bedrock.converse(
            modelId=model_id,
            messages=[{"role": "user", "content": [{"text": _prompt(request)}]}],
            toolConfig={"tools": [OFFER_TOOL], "toolChoice": {"tool": {"name": "offer_replies"}}},
            inferenceConfig={"maxTokens": 400},
        )
    for block in response["output"]["message"]["content"]:
        if "toolUse" in block:
            replies = [str(r).strip() for r in block["toolUse"]["input"].get("replies", [])]
            return [r for r in replies if r][:MAX_SUGGESTIONS]
    logger.info("suggest_replies: model returned no replies, leaving the buttons empty")
    return []
