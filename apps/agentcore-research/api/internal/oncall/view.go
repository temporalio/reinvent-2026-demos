package oncall

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"time"

	enumspb "go.temporal.io/api/enums/v1"
	historypb "go.temporal.io/api/history/v1"
	"go.temporal.io/api/workflowservice/v1"
	"go.temporal.io/sdk/converter"
)

// View is everything the UI shows, in one response.
type View struct {
	ExecutionAvailable bool          `json:"executionAvailable"`
	ServerTime         time.Time     `json:"serverTime"`
	Scenarios          []Scenario    `json:"scenarios"`
	WorkerLocation     string        `json:"workerLocation"`
	Worker             WorkerStatus  `json:"worker"`
	Incident           *IncidentView `json:"incident,omitempty"`
}

// IncidentView is one incident Workflow, read without a Worker.
type IncidentView struct {
	ID         string   `json:"id"`
	WorkflowID string   `json:"workflowId"`
	RunID      string   `json:"runId"`
	Scenario   Scenario `json:"scenario"`
	// Status is the Workflow's Temporal status; Phase is the demo's own step,
	// from the memo the Workflow keeps up to date.
	Status    string     `json:"status"`
	Phase     string     `json:"phase"`
	Proposal  any        `json:"proposal,omitempty"`
	Decision  any        `json:"decision,omitempty"`
	Steps     []any      `json:"steps"`
	Summary   string     `json:"summary,omitempty"`
	Model     string     `json:"model,omitempty"`
	StartedAt *time.Time `json:"startedAt,omitempty"`
	ClosedAt  *time.Time `json:"closedAt,omitempty"`
	// Waiting is set while Temporal holds a task that no Worker has picked up.
	// With no Worker running, that task is what gets one started.
	Waiting     *Waiting `json:"waiting,omitempty"`
	TemporalURL string   `json:"temporalUrl,omitempty"`
	Proof       *Proof   `json:"proof"`
}

// Waiting describes a task Temporal has scheduled and no Worker has started.
type Waiting struct {
	Since   time.Time `json:"since"`
	Task    string    `json:"task"`
	Attempt int32     `json:"attempt"`
}

// Proof is the Event History, reduced to what shows Durable Execution: every
// model and tool call, the Worker that ran it, and how many times it ran.
type Proof struct {
	Rows       []ProofRow `json:"rows"`
	ModelCalls int        `json:"modelCalls"`
	ToolCalls  int        `json:"toolCalls"`
	// Repeats counts calls that ran more than once (retries). Restarting a
	// Worker adds none: the new one replays the history instead.
	Repeats int      `json:"repeats"`
	Workers []string `json:"workers"`
	Events  int      `json:"events"`
}

// ProofRow is one call or one moment worth naming in the history.
type ProofRow struct {
	Kind     string    `json:"kind"` // model, tool, signal, worker
	Name     string    `json:"name"`
	Worker   string    `json:"worker,omitempty"`
	Attempt  int32     `json:"attempt,omitempty"`
	Status   string    `json:"status"`
	At       time.Time `json:"at"`
	Duration int64     `json:"durationMs,omitempty"`
}

type describeResult struct {
	resp *workflowservice.DescribeWorkflowExecutionResponse
	memo map[string]any
}

// The model Activities the Strands plugin schedules. Every other Activity in
// this Workflow is a tool.
var modelActivities = map[string]bool{"invoke_model": true, "strands_get_model_config": false}

func (s *Server) describe(ctx context.Context, wid string) (*describeResult, error) {
	resp, err := s.tc.DescribeWorkflowExecution(ctx, wid, "")
	if err != nil {
		return nil, err
	}
	memo := map[string]any{}
	if m := resp.GetWorkflowExecutionInfo().GetMemo().GetFields(); m != nil {
		dc := converter.GetDefaultDataConverter()
		for k, p := range m {
			var v any
			if err := dc.FromPayload(p, &v); err != nil {
				return nil, fmt.Errorf("decode memo %q: %w", k, err)
			}
			memo[k] = v
		}
	}
	return &describeResult{resp: resp, memo: memo}, nil
}

// maxProofEvents bounds the history read per poll. An incident has well
// under 200 events.
const maxProofEvents = 1000

func (s *Server) proof(ctx context.Context, wid string) (*Proof, error) {
	it := s.tc.GetWorkflowHistory(ctx, wid, "", false, enumspb.HISTORY_EVENT_FILTER_TYPE_ALL_EVENT)
	var events []*historypb.HistoryEvent
	for it.HasNext() && len(events) < maxProofEvents {
		e, err := it.Next()
		if err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return buildProof(events), nil
}

// buildProof is pure: history events in, proof rows out.
func buildProof(events []*historypb.HistoryEvent) *Proof {
	p := &Proof{Rows: []ProofRow{}, Workers: []string{}, Events: len(events)}
	scheduled := map[int64]int{} // scheduled event ID -> row index
	lastWorker := ""
	seenWorker := map[string]bool{}
	noteWorker := func(identity string, at time.Time) {
		if identity == "" || identity == lastWorker {
			return
		}
		if !seenWorker[identity] {
			seenWorker[identity] = true
			p.Workers = append(p.Workers, identity)
		}
		p.Rows = append(p.Rows, ProofRow{Kind: "worker", Name: identity, Status: "completed", At: at})
		lastWorker = identity
	}
	for _, e := range events {
		at := e.GetEventTime().AsTime()
		switch e.GetEventType() {
		case enumspb.EVENT_TYPE_WORKFLOW_TASK_STARTED:
			noteWorker(e.GetWorkflowTaskStartedEventAttributes().GetIdentity(), at)
		case enumspb.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED:
			name := e.GetActivityTaskScheduledEventAttributes().GetActivityType().GetName()
			isModel, known := modelActivities[name]
			if known && !isModel {
				continue // one config read per agent; not a model call
			}
			kind := "tool"
			if isModel {
				kind = "model"
				p.ModelCalls++
			} else {
				p.ToolCalls++
			}
			scheduled[e.GetEventId()] = len(p.Rows)
			p.Rows = append(p.Rows, ProofRow{Kind: kind, Name: name, Status: "pending", At: at})
		case enumspb.EVENT_TYPE_ACTIVITY_TASK_STARTED:
			a := e.GetActivityTaskStartedEventAttributes()
			if i, ok := scheduled[a.GetScheduledEventId()]; ok {
				noteWorker(a.GetIdentity(), at)
				p.Rows[i].Worker = a.GetIdentity()
				p.Rows[i].Attempt = a.GetAttempt()
				p.Rows[i].Status = "active"
				if a.GetAttempt() > 1 {
					p.Repeats++
				}
			}
		case enumspb.EVENT_TYPE_ACTIVITY_TASK_COMPLETED:
			finish(p, scheduled, e.GetActivityTaskCompletedEventAttributes().GetScheduledEventId(), "completed", at)
		case enumspb.EVENT_TYPE_ACTIVITY_TASK_FAILED:
			finish(p, scheduled, e.GetActivityTaskFailedEventAttributes().GetScheduledEventId(), "failed", at)
		case enumspb.EVENT_TYPE_ACTIVITY_TASK_TIMED_OUT:
			finish(p, scheduled, e.GetActivityTaskTimedOutEventAttributes().GetScheduledEventId(), "failed", at)
		case enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_SIGNALED:
			a := e.GetWorkflowExecutionSignaledEventAttributes()
			p.Rows = append(p.Rows, ProofRow{Kind: "signal", Name: a.GetSignalName(), Status: "completed", At: at})
		}
	}
	return p
}

func finish(p *Proof, scheduled map[int64]int, id int64, status string, at time.Time) {
	i, ok := scheduled[id]
	if !ok {
		return
	}
	p.Rows[i].Status = status
	p.Rows[i].Duration = at.Sub(p.Rows[i].At).Milliseconds()
}

func (s *Server) incidentView(incidentID, wid string, d *describeResult, proof *Proof) *IncidentView {
	info := d.resp.GetWorkflowExecutionInfo()
	v := &IncidentView{
		ID:          incidentID,
		WorkflowID:  wid,
		RunID:       info.GetExecution().GetRunId(),
		Status:      statusName(info.GetStatus()),
		Phase:       stringField(d.memo, "phase"),
		Proposal:    d.memo["proposal"],
		Decision:    d.memo["decision"],
		Steps:       listField(d.memo, "steps"),
		Summary:     stringField(d.memo, "summary"),
		Model:       stringField(d.memo, "model"),
		TemporalURL: s.temporalURL(wid),
		Proof:       proof,
	}
	if sc, ok := d.memo["incident"].(map[string]any); ok {
		v.Scenario, _ = scenarioByKey(fmt.Sprint(sc["key"]))
	}
	if t := info.GetStartTime(); t != nil {
		ts := t.AsTime()
		v.StartedAt = &ts
	}
	if t := info.GetCloseTime(); t != nil {
		ts := t.AsTime()
		v.ClosedAt = &ts
	}
	v.Waiting = waitingFrom(d.resp)
	return v
}

// waitingFrom finds a task that Temporal has scheduled and no Worker has
// started: the moment a serverless Worker is being invoked.
func waitingFrom(resp *workflowservice.DescribeWorkflowExecutionResponse) *Waiting {
	if wt := resp.GetPendingWorkflowTask(); wt != nil && wt.GetState() == enumspb.PENDING_WORKFLOW_TASK_STATE_SCHEDULED {
		since := wt.GetOriginalScheduledTime()
		if since == nil {
			since = wt.GetScheduledTime()
		}
		return &Waiting{Since: since.AsTime(), Task: "Workflow Task", Attempt: wt.GetAttempt()}
	}
	for _, a := range resp.GetPendingActivities() {
		if a.GetState() == enumspb.PENDING_ACTIVITY_STATE_SCHEDULED {
			w := &Waiting{Task: a.GetActivityType().GetName(), Attempt: a.GetAttempt()}
			if t := a.GetScheduledTime(); t != nil {
				w.Since = t.AsTime()
			}
			return w
		}
	}
	return nil
}

func (s *Server) temporalURL(wid string) string {
	if s.cfg.UIURL == "" {
		return ""
	}
	ns := s.cfg.UINamespace
	if ns == "" {
		ns = s.namespace
	}
	return strings.TrimRight(s.cfg.UIURL, "/") + "/namespaces/" + url.PathEscape(ns) + "/workflows/" + url.PathEscape(wid)
}

func statusName(st enumspb.WorkflowExecutionStatus) string {
	switch st {
	case enumspb.WORKFLOW_EXECUTION_STATUS_RUNNING:
		return "Running"
	case enumspb.WORKFLOW_EXECUTION_STATUS_COMPLETED:
		return "Completed"
	case enumspb.WORKFLOW_EXECUTION_STATUS_FAILED:
		return "Failed"
	case enumspb.WORKFLOW_EXECUTION_STATUS_CANCELED:
		return "Canceled"
	case enumspb.WORKFLOW_EXECUTION_STATUS_TERMINATED:
		return "Terminated"
	case enumspb.WORKFLOW_EXECUTION_STATUS_TIMED_OUT:
		return "TimedOut"
	case enumspb.WORKFLOW_EXECUTION_STATUS_CONTINUED_AS_NEW:
		return "ContinuedAsNew"
	default:
		return "Unknown"
	}
}

func stringField(m map[string]any, k string) string {
	if s, ok := m[k].(string); ok {
		return s
	}
	return ""
}

func listField(m map[string]any, k string) []any {
	if l, ok := m[k].([]any); ok {
		return l
	}
	return []any{}
}
