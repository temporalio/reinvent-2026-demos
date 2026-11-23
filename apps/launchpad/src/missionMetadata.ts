type MissionMetadata = {title:string;icon:string;description:string;tags:string[]}

/** Capability labels follow each demo's README; hosted services need their deployed runtime. */
export const missionMetadata:Record<string,MissionMetadata> = {
  tacos: {
    title:'Ziggy Space Taqueria',icon:'order-fulfillment',
    description:'Order tacos in orbit. Cut the kitchen uplink, restore it, and watch the order recover.',
    tags:['Temporal basics','Retries','Signals','Saga compensation'],
  },
  'money-transfer': {
    title:'Money Transfer',icon:'durable-ledger',
    description:'Move credits between accounts. Interrupt a transfer and follow its recovery or compensation.',
    tags:['Temporal basics','Human approval','Saga compensation'],
  },
  'data-pipeline': {
    title:'Data Pipeline',icon:'dag',
    description:'Move mission data through validation, extraction, transformation, and loading without losing progress.',
    tags:['Temporal basics','Signals','Updates','Heartbeats'],
  },
  loan: {
    title:'Loan Underwriting',icon:'humans-in-the-loop',
    description:'Let specialist agents assess an application, then make the final lending decision yourself.',
    tags:['Strands','Bedrock','Lambda · hosted','Human approval'],
  },
  'no-roads': {
    title:'No Roads',icon:'long-running',
    description:'Send a burst of jobs and see durable queues absorb demand while workers process the backlog.',
    tags:['Serverless · hosted','Lambda · hosted','Task queues'],
  },
  'agent-harness': {
    title:'Travel Agent',icon:'agents-mcp-ai',
    description:'Plan a trip with an agent. Review its options and approve durable tool calls along the way.',
    tags:['Agent Harness','AI tools','Human approval'],
  },
  'agentic-sdlc': {
    title:'Agentic SDLC',icon:'ci-cd',
    description:'Follow development agents from a GitHub request through coding, review, and delivery.',
    tags:['Agent Harness','GitHub','Child Workflows'],
  },
  'flight-simulator': {
    title:'Flight Simulator',icon:'long-running',
    description:'Take the controls for a spaceflight mission powered by Temporal Workflows.',
    tags:['Interactive flight','Temporal Workflows'],
  },
  'photo-booth': {
    title:'AI Photo Booth',icon:'customer-acquisition',
    description:'Capture your crew portrait and turn it into a galactic keepsake to take home.',
    tags:['Image generation','Camera','Email delivery'],
  },
}
