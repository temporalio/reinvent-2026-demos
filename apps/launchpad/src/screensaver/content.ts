/**
 * Screensaver copy. Marketing: edit freely. Everything the screensaver says
 * lives here.
 *
 * Each REEL_ITEMS entry fills the blank in "What if your ____ never crashed?".
 * `word` should read naturally in that sentence; `blurb` is shown on the
 * Learn More card for ~8 seconds, so keep it to 1-2 short sentences; `tags`
 * are the Temporal features it relies on (2-3 short chips).
 */

export interface ReelItem {
  word: string
  blurb: string
  tags: string[]
}

export const HEADLINE = { before: 'What if your', after: 'never crashed?' }

export const REEL_ITEMS: ReelItem[] = [
  {
    word: 'code',
    blurb:
      'Temporal runs your code as a durable Workflow. If a server, process or network dies mid-run, it picks up exactly where it left off, with every variable intact.',
    tags: ['Durable execution', 'State survives crashes'],
  },
  {
    word: 'agents',
    blurb:
      'The agent loop is a Workflow and every LLM or tool call is an Activity. Failed calls retry on their own, and a crash never loses the conversation or the agent’s progress.',
    tags: ['Automatic retries', 'Durable agent state'],
  },
  {
    word: 'fulfillment',
    blurb:
      'Pick, pack, ship and notify as one Workflow that can wait days for a warehouse scan. If a carrier API is down, Temporal keeps retrying until it’s back.',
    tags: ['Long waits', 'Automatic retries'],
  },
  {
    word: 'LLM training',
    blurb:
      'Long training and fine-tuning runs keep their place. Each step is an Activity that heartbeats its progress, so a lost GPU node resumes from the last checkpoint instead of starting over.',
    tags: ['Heartbeats', 'Long-running jobs'],
  },
  {
    word: 'data transformation',
    blurb:
      'Each stage of your pipeline is a retryable Activity. A flaky source or a crashed worker means retrying that one step, not re-running the whole batch.',
    tags: ['Automatic retries', 'Visibility'],
  },
  {
    word: 'payments',
    blurb:
      'Charge, record and settle in one Workflow. Idempotency keys mean a retry never charges twice, and if a later step fails, a compensation refunds the charge.',
    tags: ['Idempotency', 'Sagas'],
  },
  {
    word: 'order pipelines',
    blurb:
      'Every order is its own Workflow, from cart to doorstep. You can see which step each order is on, and a stuck payment or inventory call retries instead of dropping the order.',
    tags: ['Visibility', 'Automatic retries'],
  },
  {
    word: 'CI/CD deploys',
    blurb:
      'Build, test, canary and roll out as a Workflow that can pause for a human approval. If the rollout goes wrong, compensation steps roll it back cleanly.',
    tags: ['Human in the loop', 'Sagas'],
  },
  {
    word: 'customer onboarding',
    blurb:
      'Onboarding can take days: verify identity, wait for documents, send reminders. A Workflow can sleep for days at no cost and wake on a timer or when the customer acts.',
    tags: ['Durable timers', 'Signals'],
  },
  {
    word: 'AI workflows',
    blurb:
      'Chain prompts, retrieval and tools as Activities. Rate limits and model timeouts retry with backoff, and results you already paid for are never recomputed after a crash.',
    tags: ['Retries with backoff', 'Event history'],
  },
  {
    word: 'infrastructure provisioning',
    blurb:
      'Create networks, clusters and DNS in order, with retries for flaky cloud APIs. If step 7 fails, a saga tears down steps 1 to 6 so nothing is left half-built.',
    tags: ['Sagas', 'Automatic retries'],
  },
  {
    word: 'money transfers',
    blurb:
      'Debit one account and credit another in a single Workflow. If the credit fails, Temporal runs the compensation to reverse the debit, so money is never stuck in between.',
    tags: ['Sagas', 'Idempotency'],
  },
  {
    word: 'loan approvals',
    blurb:
      'Gather documents, run credit and fraud checks in parallel, then wait as long as it takes for an underwriter’s decision. No application gets lost in someone’s inbox.',
    tags: ['Human in the loop', 'Parallel Activities'],
  },
  {
    word: 'marketing campaigns',
    blurb:
      'A customer journey as a Workflow: send, wait three days, check for a click, branch. Durable timers make “wait a week” one line of code, for millions of customers.',
    tags: ['Durable timers', 'Scale'],
  },
  {
    word: 'document processing',
    blurb:
      'Upload, OCR, classify and extract each document in its own Workflow. If the OCR service hiccups, that one step retries, and you can see every document’s status at a glance.',
    tags: ['Automatic retries', 'Visibility'],
  },
  {
    word: 'subscription billing',
    blurb:
      'Each subscription is a long-lived Workflow that bills every month, retries failed cards on a schedule, and reacts to upgrades and cancellations as they happen.',
    tags: ['Durable timers', 'Signals'],
  },
  {
    word: 'travel bookings',
    blurb:
      'Book the flight, hotel and car together. If the hotel is sold out, Temporal cancels the flight and car for you, so no traveler ends up half-booked.',
    tags: ['Sagas', 'Compensation'],
  },
]

/** Short animated scenes shown between reel rounds. */
export const SCENES = {
  durable: {
    title: 'What Temporal does',
    steps: ['Charge card', 'Reserve stock', 'Ship package', 'Email receipt'],
    captions: [
      'Your code runs as a Workflow. Each step is recorded as it completes.',
      'Each completed step is saved to the Workflow’s event history.',
      'Crash! The server running it goes down mid-order.',
      'Another worker replays the history. Finished steps are not run again.',
      'It picks up at step 3 and finishes, as if nothing happened.',
    ],
  },
  agents: {
    title: 'How Temporal helps AI agents',
    nodes: ['Think', 'Act', 'Observe'],
    nodeSubs: ['LLM call', 'Tool call', 'Update context'],
    captions: [
      'The agent loop is a Temporal Workflow. Every LLM and tool call is an Activity.',
      'The model is rate-limited: 429 Too Many Requests.',
      'Temporal retries with backoff. No retry code to write.',
      'Then the worker crashes mid-task.',
      'The agent resumes at the same turn with its full context. Nothing lost.',
    ],
  },
  agentcore: {
    title: 'Temporal + Amazon Bedrock AgentCore',
    captions: [
      'Temporal is the durable orchestration layer: your agent loop is a Workflow.',
      'Agents run on AgentCore Runtime as Temporal Serverless Workers that scale with load.',
      'Tools sit behind AgentCore Gateway. Every tool call is a retryable Activity.',
      'AgentCore Memory keeps long-term recall. Temporal keeps every step’s state.',
      'Agents that ride out outages, throttling and crashes.',
    ],
  },
} as const

export type SceneId = keyof typeof SCENES
export const SCENE_ORDER: SceneId[] = ['durable', 'agents', 'agentcore']

export const FOOTER = 'Touch anywhere to explore the ship'
