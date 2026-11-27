export type BusinessStory = {headline:string;summary:string;detail:string;bullets:string[]}

/** Demo-specific use cases grounded in the application runbooks and implemented flows. */
export const businessStories:Record<string,BusinessStory> = {
  tacos: {
    headline:'Deliver every order, even through a failure.',
    summary:'Coordinate checkout, payment and fulfillment as one recoverable process.',
    detail:'Try a kitchen outage, restore the connection, and follow the same order as it continues.',
    bullets:[
      'Order fulfillment across checkout, payment and kitchen or delivery systems.',
      'Service recovery that keeps an order alive when a dependency is temporarily unavailable.',
      'Human checkpoints, such as waiting for staff to mark an order ready.',
      'Compensating actions, such as releasing a payment hold when fulfillment fails.',
      'Customer-support investigations backed by the order’s recorded execution history.',
    ],
  },
  'money-transfer': {
    headline:'Move credits with confidence.',
    summary:'Coordinate account changes, approval and notification across a transfer.',
    detail:'Compare the failure scenarios and inspect recovery or compensation in the Workflow history.',
    bullets:[
      'Payments and account transfers that coordinate changes across multiple services.',
      'Transfers that need employee review or approval before they continue.',
      'Recovery from partner-service outages, with application idempotency keys protecting retryable operations.',
      'Defined reversal and compensation steps when a transfer cannot complete.',
      'Operational troubleshooting with a recorded history of the transfer’s steps.',
    ],
  },
  'data-pipeline': {
    headline:'Keep the cargo pipeline moving.',
    summary:'Run data ingestion, validation and processing without throwing away completed work.',
    detail:'Try a Signal, Update or recoverable failure, then inspect the same job as it continues.',
    bullets:[
      'ETL pipelines, data ingestion and multi-stage batch-processing jobs.',
      'Job recovery that resumes after a failed stage instead of starting the pipeline over.',
      'Long-running processes that wait for a human checkpoint or corrected code.',
      'Progress reporting and failure detection during long-running processing steps.',
      'Repeatable data loads protected against duplicates by an application-level job key.',
    ],
  },
  loan: {
    headline:'Coordinate a decision from application to review.',
    summary:'Bring specialist AI assessments and a final human decision into one process.',
    detail:'Follow LENNY’s specialist assessments, then approve or reject the recommendation.',
    bullets:[
      'AI-assisted application review across fraud, identity, employment and income checks.',
      'Multi-agent processes that combine findings from parallel specialists.',
      'Recoverable assessments that retain completed model and tool results after interruption.',
      'Human oversight that keeps the final decision with the responsible reviewer.',
      'Review of the recorded steps behind an application’s recommendation.',
    ],
  },
  'no-roads': {
    headline:'Absorb work when demand changes.',
    summary:'Separate durable work from the compute that processes it.',
    detail:'Hosted mode demonstrates Lambda workers; local mode demonstrates real queue backlog with a conventional worker.',
    bullets:[
      'Bursty background workloads that need a durable queue while workers catch up.',
      'Long-running processes that outlive individual serverless invocations.',
      'On-demand processing with Lambda workers in the hosted deployment.',
      'Capacity planning informed by queue backlog and worker throughput.',
      'Failed-job recovery without building a separate recovery service.',
    ],
  },
  'agent-harness': {
    headline:'Keep an agent’s journey durable.',
    summary:'Coordinate an AI conversation, tool calls and human approvals across a trip.',
    detail:'Travel bookings in this demo are simulated; approving a tool does not reserve a real flight or hotel.',
    bullets:[
      'Travel assistants and copilots that coordinate several tools to complete a request.',
      'Customer conversations that retain context and completed work through a worker restart.',
      'Human approval before an assistant performs a gated action.',
      'Agent recovery when a model or tool fails, without discarding the entire trip.',
      'Inspection of the recorded tool calls behind an agent’s plan.',
    ],
  },
  'agentic-sdlc': {
    headline:'Carry a change through the delivery process.',
    summary:'Coordinate coding agents, automated checks and human release gates.',
    detail:'This demo works in the dedicated GitHub sandbox; staff approvals happen through GitHub.',
    bullets:[
      'Issue-to-PR automation across planning, coding, testing and review.',
      'Dependency maintenance and agent-generated changes verified by automated tests.',
      'Delivery pipelines that retain progress through rate limits and provider outages.',
      'Human-gated review and release steps.',
      'Coordinated canary checks and rollback when a demonstration release fails.',
    ],
  },
  'agentcore-research': {
    headline:'Let the worker stop while the agent waits.',
    summary:'Use AgentCore for on-demand compute and Temporal for durable agent execution.',
    detail:'Investigate an alarm, let the worker drain, then approve the repair and watch a new worker resume it.',
    bullets:[
      'AI on-call assistants that investigate incidents across models and operational tools.',
      'Recorded model and tool results that can be reused during recovery.',
      'Approval waits that do not require the agent worker to remain running.',
      'On-demand compute that resumes an investigation without repeating completed calls.',
      'Progress inspection from recorded history without waking the agent worker.',
    ],
  },
  'flight-simulator': {
    headline:'Your flight survives a worker restart.',
    summary:'Keep a real-time experience responsive while its backend work remains recoverable.',
    detail:'The browser renders the flight; inspect the last flight’s telemetry Updates and event Activities below.',
    bullets:[
      'Durable session state for interactive customer experiences.',
      'Session recovery from the last accepted snapshot after a browser interruption.',
      'Retryable backend processing for game and application events.',
      'A shared leaderboard that coordinates results from multiple stations.',
      'Responsive local rendering backed by recoverable server-side work.',
    ],
  },
  'photo-booth': {
    headline:'Four adventures. One durable Workflow.',
    summary:'Coordinate parallel AI generation, image processing and delivery as one customer experience.',
    detail:'The Workflow records completed steps so a failed provider call does not restart the whole strip.',
    bullets:[
      'AI-powered event experiences and personalized media keepsakes.',
      'Parallel media pipelines that retain completed outputs when one provider call fails.',
      'Long-running customer journeys that wait for input without discarding completed work.',
      'Multi-step delivery from generated images to a composed strip and email attachment.',
      'Operational visibility across generation, processing and delivery in one execution history.',
    ],
  },
}
