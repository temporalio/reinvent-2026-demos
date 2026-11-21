# Dependency compatibility

This update is separate from the portrait/local-preview implementation. Both branches start from the repository's main branch; neither PR is merged automatically.

## Updates and code adaptations

- Tacos TypeScript uses aligned Temporal SDK 1.26.0 packages, a current supported compiler configuration, explicit namespace/TLS/key settings, and a locked Docker install. Real happy-path and compensation Workflows pass against Temporal OSS.
- Frontend lockfiles are updated within their declared ranges. All ten npm dependency trees audit with zero vulnerabilities after these updates. This is not a claim about every Python/Go package or about GitHub's default branch before merging.
- Python lock updates address the reported AnyIO, certifi, Pillow, aiohttp, cryptography, protobuf, FastAPI/Starlette, DNS, and ASN.1 advisories. Pillow 13 photo-strip generation was exercised through the real local mock Photo Booth Workflow. Banking uses HTTPX2 for the updated Starlette TestClient. Pipeline has declared test tooling and real authenticated codec round-trip/tamper tests.
- Go worker modules use patched gRPC 1.83.1, refreshed checksums, and a matching build compiler. All five module checks pass; the combined local No Roads worker also completes a real Workflow.
- SDLC uses Agent with TemporalDurability instead of the deprecated TemporalAgent wrapper. Tests preserve Activity names, retry/heartbeat settings, inline tool dispatch, and event-handler wiring. A synthetic TestModel executed through a real Worker and produced an actual model-request Activity in history. No provider/GitHub calls occurred; retained production-history replay is not claimed.
- Loan's missing lockfile is included so its Python web image is reproducible. The portrait branch supplies the matching locked Lambda packaging.

The existing Harness/Google SDK compatibility bound remains deliberate: that Harness release imports a private Gemini API removed in later Google SDK versions. Package consistency/import checks pass at its supported versions. A full Agent Kit/framework migration is separate from the patched dependency updates here.

- Loan assessment markdown uses pinned local Marked/DOMPurify bundles, a restricted formatting/table/link policy, and regression tests for active content. The renderer no longer depends on an unversioned CDN script. Asset provenance/licenses are retained and CI verifies bundles against the lockfile before rebuilding.

## CI

The dependency workflow discovers affected npm projects, Python lock/workspace roots, Go modules and local consumers, and Docker builds from the single DemoProject. Tooling changes exercise the full matrix. It preserves sibling source imports, verifies vendor assets before rebuilding them, runs available type/build/test scripts, and rejects high npm audit findings. Python checks run package consistency, source compilation, and explicitly provider-free tests without network. Dedicated jobs execute Tacos TypeScript Workflows and a synthetic SDLC durable agent against isolated Temporal OSS. This is not full model/provider, Lambda, camera, or booth readiness testing.

The six-hour Codex dependency watch is read-only. It reports new dependency PRs/CI failures; it cannot merge, deploy, or autonomously modify code.
