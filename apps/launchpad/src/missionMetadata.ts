type MissionMetadata = {title:string;icon:string;description:string;tags:string[];previewImage?:string;previewAlt?:string}

/** Capability labels follow each demo's README; hosted services need their deployed runtime. */
export const missionMetadata:Record<string,MissionMetadata> = {
  tacos: {
    title:'Ziggy Space Taqueria',icon:'taco',
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
    previewImage:'/assets/missions/loan.png',previewAlt:'Loan Underwriting demo interface',
    description:'Let specialist agents assess an application, then make the final lending decision yourself.',
    tags:['Strands','Bedrock','Lambda · hosted','Human approval'],
  },
  'no-roads': {
    title:'No Roads',icon:'long-running',
    previewImage:'/assets/missions/no-roads.png',previewAlt:'No Roads demo interface',
    description:'Send a burst of jobs and see durable queues absorb demand while workers process the backlog.',
    tags:['Serverless · hosted','Lambda · hosted','Task queues'],
  },
  'agent-harness': {
    title:'Travel Agent',icon:'agents-mcp-ai',
    previewImage:'/assets/missions/agent-harness.png',previewAlt:'Travel Agent demo interface',
    description:'Plan a trip with an agent. Review its options and approve durable tool calls along the way.',
    tags:['Agent Harness','AI tools','Human approval'],
  },
  'agentic-sdlc': {
    title:'Agentic SDLC',icon:'ci-cd',
    previewImage:'/assets/missions/agentic-sdlc.png',previewAlt:'Agentic SDLC demo interface',
    description:'Follow development agents from a GitHub request through coding, review, and delivery.',
    tags:['Agent Harness','GitHub','Child Workflows'],
  },
  'agentcore-video': {
    title:'AgentCore Demo',icon:'agents-mcp-ai',
    description:'Watch Cornelia Davis demonstrate AgentCore. Silent video, with touch playback controls.',
    tags:['AgentCore','Cornelia Davis','Video'],
    previewImage:'/agentcore-video/poster.jpg',previewAlt:'Cornelia Davis’s AgentCore demo video',
  },
  'agentcore-research': {
    title:'AgentCore Research Agent',icon:'agents-mcp-ai',
    description:'Shubham’s upcoming AgentCore demo. Research topics with an AI agent. Coming soon.',
    tags:['AgentCore','Research agent','Coming soon'],
  },
  'flight-simulator': {
    title:'Flight Simulator',icon:'long-running',
    previewImage:'/assets/holodeck/flight-simulator.png',previewAlt:'Spaceflight cockpit navigating an asteroid field',
    description:'Take the controls for a spaceflight mission powered by Temporal Workflows.',
    tags:['Interactive flight','Temporal Workflows'],
  },
  'photo-booth': {
    title:'AI Photo Booth',icon:'customer-acquisition',
    previewImage:'/assets/holodeck/photo-booth.png',previewAlt:'Photo booth showing a sample galactic portrait strip',
    description:'Capture your crew portrait and turn it into a galactic keepsake to take home.',
    tags:['Image generation','Camera','Email delivery'],
  },
}
