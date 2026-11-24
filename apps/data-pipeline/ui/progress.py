"""Translate recorded pipeline events into UI progress without simulated work."""
LABELS = {"get_available_task_queue": "Assign worker", "validate": "Validate manifest", "extract": "Copy input to worker", "transform": "Transform JSON to CSV", "load": "Load CSV once per job key", "poll": "Confirm downstream completion"}
PERCENT = {"get_available_task_queue": 0, "validate": 10, "extract": 20, "transform": 40, "load": 60, "poll": 80, "signal": 80, "update": 80, "complete": 100}


def summarize(events, state, scenario):
    scheduled, completed, log = {}, set(), []
    completed_activities = 0
    step, status, progress = "get_available_task_queue", "running", 0
    for event in events:
        # Protobuf enums are integers; use the populated attribute field instead.
        fields = {field.name: value for field, value in event.ListFields()}
        attrs = fields.get("activity_task_scheduled_event_attributes")
        if attrs:
            scheduled[event.event_id] = attrs.activity_type.name
            step = attrs.activity_type.name
            status = "running"
            progress = PERCENT.get(step, progress)
            log.append({"id": str(event.event_id), "text": LABELS.get(step, step) + " scheduled", "status": "running"})
        attrs = fields.get("activity_task_completed_event_attributes")
        if attrs:
            step = scheduled.get(attrs.scheduled_event_id, step)
            completed.add(step)
            completed_activities += 1
            status = "completed"
            log.append({"id": str(event.event_id), "text": LABELS.get(step, step) + " completed", "status": "completed"})
        attrs = fields.get("workflow_task_failed_event_attributes")
        if attrs:
            step, status = "bug", "retrying"
            log.append({"id": str(event.event_id), "text": "Workflow Task failed. Recorded Activities are retained while the code needs a fix.", "status": "retrying"})
    if state == "running" and step == "load" and status == "completed" and scenario in ("HumanInLoopSignal", "HumanInLoopUpdate"):
        step = "signal" if scenario == "HumanInLoopSignal" else "update"
        status, progress = "waiting", 80
    if state != "running":
        status = "completed" if state == "completed" else "failed"
        if state == "completed":
            step, progress = "complete", 100
        log.append({"id": "terminal", "text": "Shipment completed." if state == "completed" else "Job ended: " + state + ". Its history is retained. Start another shipment to try again.", "status": status})
    return {"step": step, "status": status, "state": state, "progress": progress,
            "transformed": "transform" in completed, "loaded": "load" in completed,
            "events": log[-40:], "completed_activities": completed_activities}
