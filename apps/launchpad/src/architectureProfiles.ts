export type ArchitectureProfile = {
  entry: [string, string]
  api: [string, string]
  worker: [string, string]
  work: [string, string]
  systems: [string, string]
  explanation: string
  source: string
}

/** Logical flows verified against these repository sources; not a deployment inventory. */
export const architectureProfiles: Record<string, ArchitectureProfile> = {
  tacos: {
    entry:['Order station','Cart and checkout'], api:['Order API','Start and inspect orders'],
    worker:['Order worker','Durable orchestration'], work:['Order activities','Pay · prepare · notify'],
    systems:['Payment + kitchen','Simulated store uplink'],
    explanation:'The order Workflow coordinates payment and kitchen submission. Activities retry a failed kitchen call; compensation handles an order that cannot complete.',
    source:'apps/tacos/README.md',
  },
  'money-transfer': {
    entry:['Banking app','Transfer and approval'], api:['Banking API','Start and inspect transfers'],
    worker:['Transfer worker','Durable orchestration'], work:['Transfer activities','Withdraw · deposit · notify'],
    systems:['Account operations','Demo bank services'],
    explanation:'The Workflow coordinates the transfer and any approval wait. Activities apply account changes, with compensation paths for the configured failure scenarios.',
    source:'apps/money-transfer/README.md',
  },
  'data-pipeline': {
    entry:['Pipeline dashboard','Submit a data job'], api:['Pipeline API','Job status and controls'],
    worker:['Pipeline worker','Durable orchestration'], work:['ETL activities','Extract · transform · load'],
    systems:['Demo data','Validation and processing'],
    explanation:'The Workflow coordinates the data pipeline. Signals and Updates change supported job behavior while Activities report progress and handle retries.',
    source:'apps/data-pipeline/README.md',
  },
  loan: {
    entry:['Loan application','Submit and review'], api:['Underwriting API','Application and decisions'],
    worker:['Underwriting worker','Lambda when hosted'], work:['Specialist agents','Fraud · employment'],
    systems:['Bedrock + tools','Models and credit checks'],
    explanation:'The supervisor runs specialist child Workflows and activity-backed tools. Bedrock powers the agents; a human approves or rejects the final recommendation.',
    source:'apps/loan/README.md',
  },
  'no-roads': {
    entry:['Job dashboard','Submit a burst of work'], api:['Job API','Start jobs and inspect load'],
    worker:['Versioned worker','Lambda when hosted'], work:['Job activities','Process queued work'],
    systems:['Demo work','Backlog and concurrency'],
    explanation:'Temporal retains queued tasks as work arrives. Workers process them as capacity becomes available; the hosted deployment uses Lambda.',
    source:'apps/no-roads/README.md',
  },
  'agent-harness': {
    entry:['Travel conversation','Request and approve trips'], api:['Agent API','Turns and trip state'],
    worker:['Harness worker','Durable agent execution'], work:['Travel tools','Search · approve · book'],
    systems:['Model + travel tools','Simulated travel services'],
    explanation:'The agent runs as a Workflow. Its scripts call travel tools through durable Activities, preserving approvals and trip state across worker restarts.',
    source:'apps/agent-harness/README.md',
  },
  'agentic-sdlc': {
    entry:['GitHub + console','Issues · PRs · approvals'], api:['Webhook API','Verify and route events'],
    worker:['Pipeline workers','Versioned Workflows'], work:['Agent Workflows','Plan · code · review'],
    systems:['GitHub + models','Checks and release gates'],
    explanation:'Verified GitHub webhooks start Workflows and deliver Signals. Agent Workflows perform the development work; GitHub environment approvals gate delivery.',
    source:'apps/agentic-sdlc/README.md',
  },
  'flight-simulator': {
    entry:['Flight controls','Local real-time gameplay'], api:['Flight API','Telemetry + finish Updates'],
    worker:['Flight worker','Durable session state'], work:['Game activities','Record and retry events'],
    systems:['Leaderboard Workflow','Scores + event receipts'],
    explanation:'The browser renders the flight. The backend session Workflow receives telemetry Updates and runs retryable event Activities; Temporal does not drive each animation frame.',
    source:'apps/flight-simulator/backend/holodeck/flight/workflows.py',
  },
  'photo-booth': {
    entry:['Camera + email','Capture, then recipient'], api:['Photo Booth API','Persist photo + recipient'],
    worker:['Photo Booth worker','Durable session pipeline'], work:['Photo activities','4 parallel renders + compose'],
    systems:['Image + email tools','Provider calls and files'],
    explanation:'The Workflow renders scene images in parallel, composes the strip, and sends the email through Activities. The recipient Signal can arrive during rendering; delivery waits durably until an address is saved.',
    source:'apps/photo-booth/backend/holodeck/photobooth/workflows.py',
  },
}
