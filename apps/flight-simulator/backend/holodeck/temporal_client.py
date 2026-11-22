"""Shared Temporal client (local dev server or Temporal Cloud)."""

from __future__ import annotations

import asyncio
import dataclasses
from collections.abc import Mapping
from typing import Any

from temporalio.client import Client
from temporalio.contrib.aws.s3driver import S3StorageDriver, S3StorageDriverClient
from temporalio.converter import DataConverter, ExternalStorage, StorageDriver

from .config import settings

_client: Client | None = None


def payload_storage(driver: StorageDriver) -> ExternalStorage:
    """Every payload goes to ``driver``; history keeps only a reference.

    Attendee emails and photo links are in workflow inputs, activity inputs,
    results and query answers. The project's Temporal UI is public, and its
    reader cannot read the bucket, so it shows references instead of them.
    Threshold 0 means no payload is small enough to stay inline. Failure
    messages are not payloads and stay readable: none of ours includes an
    email (SendGrid errors name the URL and status only).
    """
    return ExternalStorage(drivers=[driver], payload_size_threshold=0)


class Boto3S3Client(S3StorageDriverClient):
    """The SDK's S3StorageDriver over a plain boto3 S3 client.

    The SDK ships an adapter for aioboto3 only, whose latest release pins an
    old botocore; this keeps the app's boto3 (the ``aws`` extra) and runs its
    blocking calls in a thread. Payloads are small, so one put_object each.
    """

    def __init__(self, client: Any) -> None:
        self._client = client

    def describe(self) -> Mapping[str, str]:
        region = self._client.meta.region_name
        return {"client_region": region} if region else {}

    async def put_object(self, *, bucket: str, key: str, data: bytes) -> None:
        await asyncio.to_thread(self._client.put_object, Bucket=bucket, Key=key, Body=data)

    async def object_exists(self, *, bucket: str, key: str) -> bool:
        from botocore.exceptions import ClientError

        try:
            await asyncio.to_thread(self._client.head_object, Bucket=bucket, Key=key)
            return True
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
                return False
            raise

    async def get_object(self, *, bucket: str, key: str) -> bytes:
        def read() -> bytes:
            return self._client.get_object(Bucket=bucket, Key=key)["Body"].read()

        return await asyncio.to_thread(read)


async def data_converter() -> DataConverter:
    """The default converter, with payloads in S3 when PAYLOAD_BUCKET is set.

    Every client and worker of these workflows must use the same converter,
    or one cannot read what another stored. The worker shares this client.
    """
    if not settings.payload_bucket:
        return DataConverter.default
    import boto3

    # Region, credentials and AWS_ENDPOINT_URL_S3 come from the standard AWS
    # chain (EKS Pod Identity hosted, Moto locally).
    driver = S3StorageDriver(client=Boto3S3Client(boto3.client("s3")), bucket=settings.payload_bucket)
    return dataclasses.replace(DataConverter.default, external_storage=payload_storage(driver))


async def get_client() -> Client:
    global _client
    if _client is None:
        converter = await data_converter()
        if settings.temporal_api_key:
            _client = await Client.connect(
                settings.temporal_address,
                namespace=settings.temporal_namespace,
                api_key=settings.temporal_api_key,
                tls=True,
                data_converter=converter,
            )
        else:
            _client = await Client.connect(
                settings.temporal_address, namespace=settings.temporal_namespace, data_converter=converter
            )
    return _client


def wf_id(demo: str, suffix: str, station: str | None = None) -> str:
    """Per-station workflow IDs keep stations apart in a shared namespace."""
    return f"holodeck-{station or settings.station}-{demo}-{suffix}"
