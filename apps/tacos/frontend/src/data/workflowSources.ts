import python from '../../../workflows/python/src/dejavu_workflows/order_workflow.py?raw'
import go from '../../../workflows/go/workflows/order_workflow.go?raw'
import typescript from '../../../workflows/typescript/src/workflows.ts?raw'
import java from '../../../workflows/java/src/main/java/dejavu/OrderWorkflowImpl.java?raw'
import dotnet from '../../../workflows/dotnet/OrderWorkflow.cs?raw'
import ruby from '../../../workflows/ruby/lib/dejavu/order_workflow.rb?raw'
import php from '../../../workflows/php/src/OrderWorkflow.php?raw'
import rust from '../../../workflows/rust/src/order_workflow.rs?raw'
import type { WorkerLanguage } from '../types'

// Build-time imports keep the displayed source tied to this checkout.
export const workflowSources: Record<WorkerLanguage, string> = { python, go, typescript, java, dotnet, ruby, php, rust }
