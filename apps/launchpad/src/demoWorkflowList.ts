/** These filters organize the public UI; they are not an authorization boundary. */
export const demoWorkflowQueries:Record<string,string>={
 tacos:'(WorkflowId STARTS_WITH "spacetacos-" OR WorkflowId STARTS_WITH "order-")',
 'money-transfer':'(WorkflowId STARTS_WITH "moneytransfer-" OR WorkflowId STARTS_WITH "transfer-")',
 'data-pipeline':'(WorkflowId STARTS_WITH "datapipeline-" OR WorkflowId STARTS_WITH "job-")',
 loan:'(WorkflowId STARTS_WITH "loanunderwriting-" OR WorkflowId STARTS_WITH "loan-")',
 'no-roads':'WorkflowType = "DemoWorkflow"',
 'agent-harness':'WorkflowType STARTS_WITH "Ziggy"',
 'agentic-sdlc':'WorkflowType IN ("IssueToProduction", "DependencyRepair", "PullRequestReview", "PlannerAgent", "CoderAgent", "ReviewerAgent")',
 'flight-simulator':'WorkflowType IN ("FlightSessionWorkflow", "LeaderboardWorkflow")',
 'photo-booth':'WorkflowType = "PhotoBoothWorkflow"',
 'agentcore-research':'WorkflowType = "IncidentWorkflow"',
}
/** Scope only list pages. An exact workflow/run URL must remain unchanged. */
export function demoWorkflowList(value:string,demoId:string,origin:string):string {
 const url=new URL(value,origin),scope=demoWorkflowQueries[demoId]
 if(!scope||url.origin!==origin||!/^\/_temporal\/[^/]+\/namespaces\/[^/]+\/workflows\/?$/.test(url.pathname))return url.href
 const existing=url.searchParams.get('query')?.trim()
 if(!existing?.includes(scope))url.searchParams.set('query',existing?`(${scope}) AND (${existing})`:scope)
 return url.href
}
