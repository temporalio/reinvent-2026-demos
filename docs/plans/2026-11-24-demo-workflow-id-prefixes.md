# Demo Workflow ID prefixes

New attendee runs use these labels before their existing unique station, session, queue, or application identifiers:

| Demo | Prefix |
| --- | --- |
| Ziggy's Tacos | spacetacos- |
| Money Transfer | moneytransfer- |
| Data Pipeline | datapipeline- |
| Loan Underwriting | loanunderwriting- |
| No Roads | noroads- |
| Travel Agent | travelagent- |
| Agentic SDLC | agenticsdlc- |
| AgentCore On-Call | agentcore- |
| Flight Simulator | flightsim- |
| Photo Booth | photobooth- |

Workflow types and task queues retain their names. Existing histories are not renamed or deleted. The shared-namespace demo filters include older IDs too. Internal SDLC slot leases retain their stable identifiers; new runs and their child agents use the demo prefix.

Tacos can signal old orders. Pipeline controls and bookmarked jobs retain their exact legacy or new ID and run. Photo Booth retrieves saved sessions by the ID already recorded in its spool. Flight sessions resolve only the same station's old or new ID. Travel ownership still includes the same queue and owner hash. AgentCore lookups remain scoped to the same cookie and queue.

SDLC visibility, reset, run limits, webhook routing and cancellation handle both ID forms. A completed legacy run cannot be restarted by redelivering its GitHub event under a renamed ID. Existing workflows keep their old environment ID during replay; new workflows use the new environment prefix. No provider tokens or namespace configuration change.

Synced Michael's landed Travel Agent changes (ab3e951) and earlier AgentCore changes before this migration.

Validation: 35 repository tests; 12 Money Transfer tests and ruff; 14 Travel Agent tests; AgentCore Go vet/race tests; seven pipeline tests before the additional ID validation case; Photo Booth's Python test target; two tacos ready-Signal tests; 16 flight tests; 53 SDLC webhook/session tests and two old/new-ID orchestration tests. SDK integration tests use isolated local Temporal servers and fake outside services. No paid provider calls or real emails were made for these checks.
