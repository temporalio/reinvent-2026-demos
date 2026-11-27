export type BusinessPoint = {label:string;text:string}
export type BusinessStory = {headline:string;summary:string;detail:string;bullets:BusinessPoint[]}

/** Adapted from Ian’s supplied Booth Certification screenshots; details follow each demo’s implemented flow. */
export const businessStories:Record<string,BusinessStory> = {
  tacos: {
    headline:'Keep the order moving when a service fails.',
    summary:'Deliver reliable business processes with less coordination and recovery code for your team to maintain.',
    detail:'Try a kitchen outage, restore the connection, and follow the same order as it continues.',
    bullets:[
      {label:'One business process',text:'Coordinate payment, preparation and fulfillment across the services you already have.'},
      {label:'Recover interrupted work',text:'Retry the unavailable kitchen step using recorded progress, without restarting the whole order.'},
      {label:'People stay in the process',text:'Wait for staff to mark an order ready; continue when their approval arrives.'},
      {label:'See what needs attention',text:'Inspect completed, failed and waiting steps to investigate a stuck order.'},
      {label:'Customer example',text:'Yum! Brands rebuilt order management with Temporal and reported using 10 times less code.'},
    ],
  },
  'money-transfer': {
    headline:'Keep payments moving across services.',
    summary:'Give your team one recoverable transfer process, with less supporting infrastructure to build and maintain.',
    detail:'Activities retry failed calls; application idempotency keys protect retryable operations against duplicate account changes.',
    bullets:[
      {label:'One business process',text:'Coordinate account validation, withdrawal, deposit and notification as one transfer.'},
      {label:'Recover interrupted work',text:'Retain completed steps when a partner service fails; continue when it recovers.'},
      {label:'Keep people in control',text:'Pause for review when required and run defined compensation steps if the transfer cannot complete.'},
      {label:'Understand a stuck transfer',text:'See what finished, what failed and what is waiting in its execution history.'},
      {label:'Customer example',text:'JPMorgan Chase uses Temporal to coordinate payment workflows.'},
    ],
  },
  'data-pipeline': {
    headline:'Recover the pipeline. Keep completed work.',
    summary:'Get reliable data processes into production while your team spends less effort building recovery machinery.',
    detail:'Try “Fix code and resume” on the recoverable-failure scenario, or use a Signal or Update at a human checkpoint.',
    bullets:[
      {label:'One business process',text:'Coordinate data ingestion, validation, extraction, transformation and loading in application code.'},
      {label:'Recover interrupted work',text:'Use recorded results to continue the same job after a failed stage or corrected code.'},
      {label:'Keep existing systems',text:'Call your APIs and processing tools as steps; Temporal coordinates how they work together.'},
      {label:'See what is waiting',text:'Inspect stage progress, retries and human checkpoints to investigate a delayed data shipment.'},
      {label:'Control duplicate loads',text:'An application-level job key protects the load step when it runs again.'},
    ],
  },
  loan: {
    headline:'Move AI-assisted reviews into a business process.',
    summary:'Coordinate specialist agents, business checks and human decisions on one durable execution foundation.',
    detail:'LENNY recommends a decision; you make the final call. Applicant checks in this demo use simulated data.',
    bullets:[
      {label:'More than a model call',text:'Combine fraud, identity, employment and income assessments into one application review.'},
      {label:'Keep people accountable',text:'Wait durably for a reviewer to approve or reject the recommendation.'},
      {label:'Recover interrupted work',text:'Use recorded specialist results when execution resumes, instead of repeating the entire assessment.'},
      {label:'Less infrastructure to maintain',text:'Temporal handles progress tracking and retries so your team can focus on review logic.'},
      {label:'Understand the process',text:'Inspect the recorded model and tool steps behind a recommendation.'},
    ],
  },
  'no-roads': {
    headline:'Handle bursts without losing the business process.',
    summary:'Keep work durable as compute starts and stops, with a common foundation for coordination and recovery.',
    detail:'Hosted mode demonstrates Lambda workers; local mode demonstrates real queue backlog with a conventional worker. Lambda Serverless Workers are in Public Preview.',
    bullets:[
      {label:'Absorb changing demand',text:'Queue incoming jobs durably while available workers process the backlog.'},
      {label:'Separate progress from compute',text:'A business process can outlive an individual serverless invocation.'},
      {label:'Work with AWS Lambda',text:'Run Temporal Worker code on Lambda in the hosted demo, with work retained between invocations.'},
      {label:'Less recovery infrastructure',text:'Use Temporal’s progress tracking and retries instead of building a separate failed-job recovery service.'},
      {label:'See where work waits',text:'Compare queue backlog and worker throughput as the burst is processed.'},
    ],
  },
  'agent-harness': {
    headline:'Turn an AI request into a completed journey.',
    summary:'Building an AI product takes more than calling a model: tools, services and people need to work together.',
    detail:'Travel bookings in this demo are simulated; approving a tool does not reserve a real flight or hotel.',
    bullets:[
      {label:'One customer request',text:'Coordinate trip research, tool calls and itinerary decisions as one process.'},
      {label:'Keep people in control',text:'Wait for approval before a gated action, while retaining the work already completed.'},
      {label:'Recover interrupted work',text:'Continue using recorded model and tool results after a worker restart or provider interruption.'},
      {label:'Keep your choice of model',text:'Your code defines agent behavior; Temporal tracks progress and coordinates execution.'},
      {label:'More time for the product',text:'Build the travel experience on shared retry and recovery infrastructure.'},
    ],
  },
  'agentic-sdlc': {
    headline:'Ship agent-built changes with human oversight.',
    summary:'Coordinate agents across the delivery process so engineers can focus on the product and its release decisions.',
    detail:'The demo uses the dedicated GitHub sandbox. Staff review and release approvals happen through GitHub.',
    bullets:[
      {label:'One delivery process',text:'Connect planning, coding, tests, review and release across agents and existing tools.'},
      {label:'Recover interrupted work',text:'Retain progress through rate limits, worker restarts and model-provider interruptions.'},
      {label:'Keep people accountable',text:'Wait for human review and release approvals; coordinate canary checks and rollback.'},
      {label:'Less infrastructure to maintain',text:'Use Temporal for scheduling, retries and recovery around the coding agents.'},
      {label:'Customer example',text:'Cursor uses Temporal to coordinate cloud coding agents through infrastructure and model-provider interruptions.'},
    ],
  },
  'agentcore-research': {
    headline:'Let the agent wait without keeping compute running.',
    summary:'Bring AI incident response, operational tools and human approval into one recoverable process.',
    detail:'Strands integration is in Public Preview; AgentCore Runtime support is pre-release. Watch the worker drain, then approve the repair.',
    bullets:[
      {label:'Tools that work together',text:'Strands defines agent behavior, AgentCore Runtime supplies compute, and Temporal coordinates progress and recovery.'},
      {label:'Keep people in control',text:'Wait for repair approval without keeping a dedicated agent worker running.'},
      {label:'Recover interrupted work',text:'A new worker resumes using recorded model and tool results, without repeating completed calls.'},
      {label:'Less infrastructure to maintain',text:'Build incident-response logic on Temporal’s scheduling, progress tracking and recovery foundation.'},
      {label:'See what is waiting',text:'Read execution history to inspect the investigation without waking the agent worker.'},
    ],
  },
  'flight-simulator': {
    headline:'Keep the experience responsive and progress durable.',
    summary:'Separate an interactive experience from its recoverable backend process, so temporary interruptions do not erase accepted progress.',
    detail:'The browser renders the flight. Workflow Updates record snapshots; Activities process events and submit leaderboard results.',
    bullets:[
      {label:'One session process',text:'Coordinate flight events, repairs, score snapshots and the final leaderboard submission.'},
      {label:'Recover interrupted work',text:'Restore a session from its last accepted snapshot after a browser interruption.'},
      {label:'Keep your application code',text:'Render the game locally while Temporal coordinates durable backend work.'},
      {label:'Less supporting infrastructure',text:'Use recorded execution and retryable event processing instead of a separate recovery system.'},
      {label:'See what happened',text:'Inspect the last flight’s recorded Updates and Activities in the panel below.'},
    ],
  },
  'photo-booth': {
    headline:'Deliver the AI experience, from photo to inbox.',
    summary:'Coordinate model calls, image processing and customer input as one business process, with less recovery infrastructure to build.',
    detail:'Four image-generation Activities run in parallel. The Workflow waits for an email address, composes the strip and sends the attachment.',
    bullets:[
      {label:'More than a model call',text:'Connect portrait analysis, image generation, strip composition and email delivery.'},
      {label:'Recover interrupted work',text:'Retry a failed provider call while retaining the images that already completed.'},
      {label:'People stay in the process',text:'Keep completed work while waiting for the attendee’s email address.'},
      {label:'See what is waiting',text:'Inspect generation, processing and delivery steps in one execution history.'},
      {label:'Customer example',text:'OpenAI uses Temporal for multi-step AI workflows, including ChatGPT image generation.'},
    ],
  },
}
