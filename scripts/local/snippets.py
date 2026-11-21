"""Export exact native workflow excerpts for the shared booth viewer."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
SOURCES={
 'money-transfer':('apps/money-transfer/workflows/python/src/banking_workflows/account_transfer_workflow.py','Python'),
 'data-pipeline':('apps/data-pipeline/DataPipelineWorkflowHappyPath.py','Python'),
 'loan':('apps/loan/workflow.py','Python'),
 'no-roads':('apps/no-roads/shared/workflows/demo_workflow.go','Go'),
 'agent-harness':('apps/agent-harness/agent_harness_demo/ziggy/workflow.py','Python'),
 'agentic-sdlc':('apps/agentic-sdlc/agentic_sdlc/pipeline/workflow.py','Python'),
 'flight-simulator':('apps/flight-simulator/backend/holodeck/flight/workflows.py','Python'),
 'photo-booth':('apps/photo-booth/backend/holodeck/photobooth/workflows.py','Python'),
}
if __name__=='__main__':
 result={}
 for name,(path,language) in SOURCES.items():
  lines=(ROOT/path).read_text().splitlines()
  result[name]={'path':path,'language':language,'code':'\n'.join(lines[:180]),'truncated':len(lines)>180}
 (ROOT/'apps/launchpad/public/booth/snippets.json').write_text(json.dumps(result,indent=2)+'\n')
