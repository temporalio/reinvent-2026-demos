"""Every payload goes to S3, so attendee emails never reach history or the public UI."""

import dataclasses
import io

import pytest
from botocore.exceptions import ClientError
from temporalio.contrib.aws.s3driver import S3StorageDriver
from temporalio.converter import DataConverter

from holodeck import temporal_client
from holodeck.shared.email import EmailMessage


class FakeS3:
    """The three boto3 calls Boto3S3Client makes, on a dict."""

    class meta:
        region_name = "us-west-1"

    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}

    def put_object(self, *, Bucket, Key, Body):
        self.objects[(Bucket, Key)] = Body

    def head_object(self, *, Bucket, Key):
        if (Bucket, Key) not in self.objects:
            raise ClientError({"Error": {"Code": "404", "Message": "Not Found"}}, "HeadObject")
        return {}

    def get_object(self, *, Bucket, Key):
        return {"Body": io.BytesIO(self.objects[(Bucket, Key)])}


def converter(s3: FakeS3) -> DataConverter:
    driver = S3StorageDriver(client=temporal_client.Boto3S3Client(s3), bucket="payloads")
    return dataclasses.replace(DataConverter.default, external_storage=temporal_client.payload_storage(driver))


async def test_small_payloads_with_an_email_are_stored_in_s3_and_read_back():
    s3 = FakeS3()
    dc = converter(s3)
    msg = EmailMessage(to="visitor@example.com", subject="hi", html="<p>x</p>", idempotency_key="k")
    (payload,) = await dc.encode([msg])
    assert b"visitor@example.com" not in payload.SerializeToString()
    assert payload.metadata["messageType"] == b"temporal.api.sdk.v1.ExternalStorageReference"
    assert [k for (b, k) in s3.objects if b == "payloads"]
    assert any(b"visitor@example.com" in v for v in s3.objects.values())
    (back,) = await dc.decode([payload], [EmailMessage])
    assert back == msg


async def test_missing_object_is_reported_not_silently_empty():
    s3 = FakeS3()
    client = temporal_client.Boto3S3Client(s3)
    assert await client.object_exists(bucket="payloads", key="nope") is False
    await client.put_object(bucket="payloads", key="k", data=b"x")
    assert await client.object_exists(bucket="payloads", key="k") is True
    assert await client.get_object(bucket="payloads", key="k") == b"x"


async def test_without_a_bucket_payloads_stay_inline(monkeypatch):
    monkeypatch.setattr(temporal_client, "settings", dataclasses.replace(temporal_client.settings, payload_bucket=None))
    assert await temporal_client.data_converter() is DataConverter.default


async def test_with_a_bucket_every_payload_is_external(monkeypatch):
    monkeypatch.setattr(temporal_client, "settings", dataclasses.replace(temporal_client.settings, payload_bucket="payloads"))
    monkeypatch.setenv("AWS_REGION", "us-west-1")
    dc = await temporal_client.data_converter()
    assert dc.external_storage is not None
    assert dc.external_storage.payload_size_threshold == 0
