package oncall

import (
	"testing"
	"time"

	commonpb "go.temporal.io/api/common/v1"
	enumspb "go.temporal.io/api/enums/v1"
	historypb "go.temporal.io/api/history/v1"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type ev = historypb.HistoryEvent

func at(t0 time.Time, s int) *timestamppb.Timestamp {
	return timestamppb.New(t0.Add(time.Duration(s) * time.Second))
}

func wfTaskStarted(id int64, t0 time.Time, s int, identity string) *ev {
	return &ev{EventId: id, EventTime: at(t0, s), EventType: enumspb.EVENT_TYPE_WORKFLOW_TASK_STARTED,
		Attributes: &historypb.HistoryEvent_WorkflowTaskStartedEventAttributes{WorkflowTaskStartedEventAttributes: &historypb.WorkflowTaskStartedEventAttributes{Identity: identity}}}
}

func scheduled(id int64, t0 time.Time, s int, name string) *ev {
	return &ev{EventId: id, EventTime: at(t0, s), EventType: enumspb.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED,
		Attributes: &historypb.HistoryEvent_ActivityTaskScheduledEventAttributes{ActivityTaskScheduledEventAttributes: &historypb.ActivityTaskScheduledEventAttributes{ActivityType: &commonpb.ActivityType{Name: name}}}}
}

func started(id, sched int64, t0 time.Time, s int, identity string, attempt int32) *ev {
	return &ev{EventId: id, EventTime: at(t0, s), EventType: enumspb.EVENT_TYPE_ACTIVITY_TASK_STARTED,
		Attributes: &historypb.HistoryEvent_ActivityTaskStartedEventAttributes{ActivityTaskStartedEventAttributes: &historypb.ActivityTaskStartedEventAttributes{ScheduledEventId: sched, Identity: identity, Attempt: attempt}}}
}

func completed(id, sched int64, t0 time.Time, s int) *ev {
	return &ev{EventId: id, EventTime: at(t0, s), EventType: enumspb.EVENT_TYPE_ACTIVITY_TASK_COMPLETED,
		Attributes: &historypb.HistoryEvent_ActivityTaskCompletedEventAttributes{ActivityTaskCompletedEventAttributes: &historypb.ActivityTaskCompletedEventAttributes{ScheduledEventId: sched}}}
}

func signaled(id int64, t0 time.Time, s int) *ev {
	return &ev{EventId: id, EventTime: at(t0, s), EventType: enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_SIGNALED,
		Attributes: &historypb.HistoryEvent_WorkflowExecutionSignaledEventAttributes{WorkflowExecutionSignaledEventAttributes: &historypb.WorkflowExecutionSignaledEventAttributes{SignalName: "decide"}}}
}

// sampleHistory: worker-a reads the model config, calls the model and one tool,
// then waits; a Signal arrives and worker-b picks the Workflow up.
func sampleHistory(t0 time.Time) []*ev {
	return []*ev{
		wfTaskStarted(3, t0, 1, "worker-a"),
		scheduled(5, t0, 1, "strands_get_model_config"),
		started(6, 5, t0, 1, "worker-a", 1),
		completed(7, 5, t0, 1),
		scheduled(11, t0, 2, "invoke_model"),
		started(12, 11, t0, 2, "worker-a", 1),
		completed(13, 11, t0, 4),
		scheduled(17, t0, 5, "read_telemetry"),
		started(18, 17, t0, 5, "worker-a", 2),
		completed(19, 17, t0, 6),
		signaled(23, t0, 600),
		wfTaskStarted(25, t0, 605, "worker-b"),
	}
}

func TestBuildProof(t *testing.T) {
	t0 := time.Date(2026, 11, 23, 12, 0, 0, 0, time.UTC)

	p := buildProof(sampleHistory(t0))

	if p.ModelCalls != 1 || p.ToolCalls != 1 {
		t.Errorf("model %d tool %d, want 1 and 1 (the config read is not a model call)", p.ModelCalls, p.ToolCalls)
	}
	if p.Repeats != 1 {
		t.Errorf("repeats %d, want 1 (the tool ran on attempt 2)", p.Repeats)
	}
	if len(p.Workers) != 2 || p.Workers[0] != "worker-a" || p.Workers[1] != "worker-b" {
		t.Errorf("workers %v", p.Workers)
	}
	var kinds []string
	for _, r := range p.Rows {
		kinds = append(kinds, r.Kind)
	}
	want := []string{"worker", "model", "tool", "signal", "worker"}
	if len(kinds) != len(want) {
		t.Fatalf("rows %v, want %v", kinds, want)
	}
	for i := range want {
		if kinds[i] != want[i] {
			t.Fatalf("rows %v, want %v", kinds, want)
		}
	}
	model := p.Rows[1]
	if model.Status != "completed" || model.Worker != "worker-a" || model.Duration != 2000 {
		t.Errorf("model row %+v", model)
	}
}

func TestBuildProofOfAnEmptyHistory(t *testing.T) {
	p := buildProof(nil)

	if p.Rows == nil || p.Workers == nil || p.ModelCalls != 0 {
		t.Errorf("proof %+v; lists must be empty, not null, for the UI", p)
	}
}
