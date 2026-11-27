"""Retain hosted station decks across pod replacements using the existing table."""
from __future__ import annotations

import json
import os

from .rotation import next_strip


class DynamoDecks:
    def __init__(self, client, table: str) -> None:
        self.client, self.table = client, table

    def reserve(self, station: str, session_id: str) -> list[str]:
        """Compare-and-swap the small station deck; retrying a capture is stable."""
        key = {"pk": {"S": f"photobooth#scene-deck#{station}"}}
        for _ in range(16):
            item = self.client.get_item(TableName=self.table, Key=key, ConsistentRead=True).get("Item")
            payload = json.loads(item["payload"]["S"]) if item else {}
            reservations = payload.get("reservations", {})
            if session_id in reservations:
                return list(reservations[session_id])
            selected, deck = next_strip(payload.get("deck"))
            reservations[session_id] = selected
            # Only scene IDs and opaque capture IDs; never attendee data.
            reservations = dict(list(reservations.items())[-128:])
            revision = int(item["revision"]["N"]) if item else 0
            condition = {"ConditionExpression": "revision = :old", "ExpressionAttributeValues": {":old": {"N": str(revision)}}} if item else {"ConditionExpression": "attribute_not_exists(pk)"}
            try:
                self.client.put_item(TableName=self.table, Item={**key, "revision": {"N": str(revision+1)},
                    "payload": {"S": json.dumps({"deck": deck, "reservations": reservations})}}, **condition)
                return selected
            except Exception as error:
                if getattr(error, "response", {}).get("Error", {}).get("Code") != "ConditionalCheckFailedException":
                    raise
        raise RuntimeError("station scene deck remained busy; retry the capture")


def configured_decks() -> DynamoDecks | None:
    """Local mode uses SQLite; hosted mode uses Fieldkit's existing pod role/table."""
    table = os.getenv("CONTROL_TABLE", "").strip()
    if not table:
        return None
    import boto3
    from botocore.config import Config
    client = boto3.client("dynamodb", config=Config(connect_timeout=2, read_timeout=3, retries={"max_attempts": 1}))
    return DynamoDecks(client, table)
