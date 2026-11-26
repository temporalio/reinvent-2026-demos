import { NativeConnection, Worker } from "@temporalio/worker";
import { createActivities } from "./activities";
import { temporalSettings } from "./connection-options";
import { BackendClient } from "./backend-client";

async function main() {
  const settings = temporalSettings();
  const temporalAddr = settings.address;
  const taskQueue = settings.taskQueue;
  const backendURL =
    process.env.DEJAVU_BACKEND_URL || "http://localhost:8000";

  const connection = await NativeConnection.connect({
    address: temporalAddr,
    tls: settings.tls,
    apiKey: settings.apiKey,
  });

  const backend = new BackendClient(backendURL);

  const worker = await Worker.create({
    connection,
    namespace: settings.namespace,
    taskQueue,
    workflowsPath: require.resolve("./workflows"),
    activities: createActivities(backend),
  });

  console.log(`TypeScript worker started, listening on task queue: ${taskQueue}`);
  console.log(`Backend URL: ${backendURL}`);
  console.log(`Temporal address: ${temporalAddr}`);

  try { await worker.run(); } finally { await connection.close(); }
}

main().catch((err) => {
  console.error("Worker failed:", err);
  process.exit(1);
});
