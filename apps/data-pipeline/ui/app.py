import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
import uuid
from urllib.parse import quote, urlsplit

from flask import Flask, jsonify, render_template, request
from flask.wrappers import Response

from client import get_client
from dataobjects import DataPipelineParams

app = Flask(__name__)
from werkzeug.middleware.proxy_fix import ProxyFix
app.wsgi_app = ProxyFix(app.wsgi_app, x_prefix=1)

# Scenario choices dropdown
scenarios = [
    "HappyPath",
    "AdvancedVisibility",
    "HumanInLoopSignal",
    "HumanInLoopUpdate",
    "Idempotency",
    "APIFailure",
    "RecoverableFailure",
    "NonRecoverableFailure",
]

data = {
    "input_filename": "info.json",
    "foldername": "./demodata",
    "poll_or_wait": "poll",
    "validation": "orange",
}


SCENARIO_DESCRIPTIONS = {
    "HappyPath": "Validate the manifest, copy it to a worker, turn its namespace entries into CSV, and load the result. A polling Activity confirms completion.",
    "AdvancedVisibility": "Run the same pipeline while recording its current Step as a Search Attribute. Follow validation, extraction, transformation, loading, and completion in Temporal UI.",
    "HumanInLoopSignal": "Load the CSV, then wait up to 60 seconds for you to send a completion Signal. Missing that deadline fails this job; its history remains available.",
    "HumanInLoopUpdate": "Load the CSV, then wait up to 60 seconds for a completion Update. The Update returns an acknowledgement; missing the deadline fails this job.",
    "Idempotency": "Call the load Activity twice with the same job key. The second call recognizes the key and skips the duplicate load.",
    "APIFailure": "Make completion polling fail on its first nine attempts. Temporal retries every two seconds and the tenth attempt succeeds without repeating extraction or transformation.",
    "RecoverableFailure": "Raise an intentional workflow-code bug after transformation. Temporal keeps retrying the Workflow Task; fixing and redeploying the code lets the recorded work resume.",
    "NonRecoverableFailure": "Reject the manifest during validation and fail the Workflow before extraction. Temporal retains the failure and history; this input needs correction rather than more retries.",
}


def manifest():
    source = Path(__file__).resolve().parents[1] / "demodata/source/info.json"
    payload = json.loads(source.read_text())
    return {"filename": "info.json", "objects": len(payload["namespaces"]),
            "lines": len(source.read_text().splitlines()), "preview": json.dumps(payload, indent=2)}


def temporal_workflow_url(workflow_id: str, run_id: str) -> str | None:
    """Link to the run in the Temporal UI, from the UI base and qualified namespace Fieldkit injects
    (the local preview sets both too). TEMPORAL_NAMESPACE is not used: it can differ from the UI's namespace.

    The run ID matters: without one the UI finds the run through a list query, and Temporal Cloud's
    list results trail a new start by a moment, so a link followed right away shows a 404."""
    base = os.getenv("TEMPORAL_UI_URL")
    namespace = os.getenv("TEMPORAL_UI_NAMESPACE")
    if not base or not namespace:
        return None
    if urlsplit(base).path.startswith("/_temporal/"):
        base = urlsplit(base).path
    workflow_path = f"{quote(workflow_id, safe='')}/{quote(run_id, safe='')}"
    return f"{base.rstrip('/')}/namespaces/{quote(namespace, safe='')}/workflows/{workflow_path}/timeline"


@app.route("/", methods=["GET", "POST"])
async def main_order_page() -> str:
    job_id = uuid.uuid4().hex[:12]

    return render_template("index.html", data=data, scenarios=scenarios, descriptions=SCENARIO_DESCRIPTIONS, manifest=manifest(), job_id=job_id)


@app.route("/run_job")
async def run_job() -> str | tuple[str, int]:
    selected_scenario = request.args.get("scenario")
    job_id = request.args.get("job_id")

    if selected_scenario not in scenarios:
        return "Error: select a supported scenario", 400
    if not job_id:
        return "Error: job_id parameter is required", 400

    client = await get_client()

    input = DataPipelineParams(
        input_filename=data["input_filename"],
        foldername=data["foldername"],
        poll_or_wait=data["poll_or_wait"],
        validation=data["validation"],
        scenario=selected_scenario,
        key=job_id,
    )

    workflow_id = f"job-{job_id}"
    if selected_scenario == "HappyPath":
        handle = await client.start_workflow(
            "DataPipelineWorkflowHappyPath",
            input,
            id=workflow_id,
            task_queue=os.getenv("TEMPORAL_TASK_QUEUE", "worker_specific_task_queue-distribution-queue"),
        )
    else:
        handle = await client.start_workflow(
            "DataPipeline" + selected_scenario,
            input,
            id=workflow_id,
            task_queue=os.getenv("TEMPORAL_TASK_QUEUE", "worker_specific_task_queue-distribution-queue"),
        )

    return render_template(
        "job_progress.html",
        selected_scenario=selected_scenario,
        job_id=job_id,
        workflow_url=temporal_workflow_url(workflow_id, handle.first_execution_run_id),
        run_id=handle.first_execution_run_id,
        manifest=manifest(),
        scenario_description=SCENARIO_DESCRIPTIONS[selected_scenario],
    )


@app.route("/confirmation")
async def order_confirmation() -> str | tuple[str, int]:
    job_id = request.args.get("job_id")

    if not job_id:
        return "Error: job_id parameter is required", 400

    client = await get_client()
    pipeline_workflow = client.get_workflow_handle(f"job-{job_id}", run_id=request.args.get("run_id"))
    desc = await pipeline_workflow.describe()
    scenario = "HappyPath" if desc.workflow_type == "DataPipelineWorkflowHappyPath" else desc.workflow_type.removeprefix("DataPipeline")
    return render_template("job_progress.html", job_id=job_id, run_id=desc.run_id,
                           selected_scenario=scenario, scenario_description=SCENARIO_DESCRIPTIONS.get(scenario, "Follow the recorded job."),
                           manifest=manifest(), workflow_url=temporal_workflow_url(f"job-{job_id}", desc.run_id))


@app.route("/get_progress")
async def get_progress() -> Response | tuple[Response, int]:
    job_id = request.args.get("job_id")

    if not job_id:
        return jsonify({"error": "job_id parameter is required"}), 400

    try:
        client = await get_client()
        handle = client.get_workflow_handle(f"job-{job_id}", run_id=request.args.get("run_id"))
        desc = await handle.describe()
        state = desc.status.name.lower()
        history = await handle.fetch_history()
        from ui.progress import summarize
        result = summarize(history.events, state, request.args.get("scenario", "HappyPath"))
        result["workflow_url"] = temporal_workflow_url(f"job-{job_id}", desc.run_id)
        if state == "running":
            try:
                result["progress"] = await handle.query("progress", rpc_timeout=timedelta(seconds=3))
            except Exception:
                result["notice"] = "Worker is not answering the progress query. Last recorded history is shown."
        if desc.raw_description.pending_activities:
            result["attempt"] = max(activity.attempt for activity in desc.raw_description.pending_activities)
            if result["attempt"] > 1:
                result["status"] = "retrying"
        result["elapsed_seconds"] = round(((desc.close_time or datetime.now(timezone.utc)) - desc.start_time).total_seconds(), 1)
        result["manifest"] = manifest()
        return jsonify(result)
    except Exception:
        return jsonify({"error": "Could not reach Temporal. Your recorded job is retained; reconnecting."}), 503


@app.route("/signal", methods=["POST"])
async def signal() -> tuple[str, int] | tuple[Response, int]:
    job_id = request.args.get("job_id")

    if not job_id:
        return jsonify({"error": "job_id parameter is required"}), 400

    try:
        client = await get_client()
        pipeline_workflow = client.get_workflow_handle(f"job-{job_id}", run_id=request.args.get("run_id"))
        if (await pipeline_workflow.describe()).status.name != "RUNNING":
            return jsonify({"error": "This job has ended. Start another shipment to try again."}), 409
        await pipeline_workflow.signal("load_complete_signal", "complete")
    except Exception as e:
        print(f"Error sending signal: {str(e)}")
        return jsonify({"error": str(e)}), 500

    return "Signal received successfully", 200


@app.route("/update", methods=["POST"])
async def update() -> Response:
    job_id = request.args.get("job_id")

    if not job_id:
        return jsonify({"error": "job_id parameter is required"})

    update_result = None
    try:
        client = await get_client()
        pipeline_workflow = client.get_workflow_handle(f"job-{job_id}", run_id=request.args.get("run_id"))
        if (await pipeline_workflow.describe()).status.name != "RUNNING":
            return jsonify({"error": "This job has ended. Start another shipment to try again."}), 409
        update_result = await pipeline_workflow.execute_update(
            update="load_complete_update",
            arg="complete",
        )
    except Exception as e:
        result = f"Update for job_id {job_id} rejected, not valid! {str(e)}"
        return jsonify(result=result)

    result = f"Update for job_id {job_id} accepted: {update_result}"

    return jsonify(result=result)


if __name__ == "__main__":
    app.run(debug=True, port=8080)
