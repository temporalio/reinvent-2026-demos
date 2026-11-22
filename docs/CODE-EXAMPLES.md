# Booth code examples

The launchpad code tab reads `apps/launchpad/public/booth/code-examples.json`. Each of the nine demos has a focused example for Python, Go, Java, TypeScript, .NET/C#, PHP, Ruby, and Rust. Switching languages changes the displayed example; it does not switch the running worker.

Each demo identifies its native language, source file, symbol, and line range. Its native example is a literal, dedented excerpt from that range. The other seven examples are labeled **Illustrative equivalent**. They show the same orchestration concept with SDK calls, with imports, registrations, domain types, and surrounding logic omitted. They are teaching fragments, not complete programs, and have not been compiled or executed across all eight SDKs.

The examples focus on compensation, durable waits, worker routing, human review, worker backlog, durable travel tools, tested agent repairs, telemetry Updates, and photo delivery. They omit unrelated setup so the critical steps fit the booth display. The current Tacos implementation proceeds after either its kitchen Signal or its one-hour timeout; its example preserves that behavior.

The Loan and Travel demos use Python-specific agent integrations. Their other-language examples show ordinary Workflow/Activity orchestration boundaries. They do not claim that Strands or Code Mode has been ported to those SDKs. Domain Activity names in illustrative examples describe responsibilities; they are not promised registered Activity names or wire-compatible replacements.

The Rust examples follow the 1.1.2 API pinned by the existing demo workers, including `WorkflowContext`, `ActivityOptions`, and deterministic concurrency helpers. No SDK dependencies are added by this asset.

When a native Workflow changes, update its excerpt and source line range together. Run `python -m unittest discover -s tests -p test_code_examples.py -v`; the source correspondence test catches stale excerpts. Runtime tests for the actual workers remain separate from these editorial coverage checks.

SDK API references: [Python](https://docs.temporal.io/develop/python), [Go](https://docs.temporal.io/develop/go), [Java](https://docs.temporal.io/develop/java), [TypeScript](https://docs.temporal.io/develop/typescript), [.NET](https://docs.temporal.io/develop/dotnet), [PHP](https://docs.temporal.io/develop/php), [Ruby](https://github.com/temporalio/sdk-ruby), and [Rust 1.1.2 source](https://docs.rs/crate/temporalio-workflow/1.1.2/source/).
