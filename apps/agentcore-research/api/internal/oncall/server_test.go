package oncall

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	commonpb "go.temporal.io/api/common/v1"
	enumspb "go.temporal.io/api/enums/v1"
	historypb "go.temporal.io/api/history/v1"
	"go.temporal.io/api/serviceerror"
	workerpb "go.temporal.io/api/worker/v1"
	workflowpb "go.temporal.io/api/workflow/v1"
	"go.temporal.io/api/workflowservice/v1"
	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/converter"
	"google.golang.org/grpc"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// fakeClient implements the few client.Client methods the API calls. Any other
// method panics through the nil embedded interface, which is how a test would
// notice the API sending a Query.
type fakeClient struct {
	client.Client
	started   []client.StartWorkflowOptions
	startErr  error
	signals   []signal
	workflows map[string]*workflowservice.DescribeWorkflowExecutionResponse
	history   map[string][]*historypb.HistoryEvent
	svc       *fakeService
}

type signal struct {
	wid, name string
	arg       any
}

func (f *fakeClient) ExecuteWorkflow(_ context.Context, o client.StartWorkflowOptions, _ any, _ ...any) (client.WorkflowRun, error) {
	if f.startErr != nil {
		return nil, f.startErr
	}
	f.started = append(f.started, o)
	return fakeRun{}, nil
}

func (f *fakeClient) SignalWorkflow(_ context.Context, wid, _, name string, arg any) error {
	if _, ok := f.workflows[wid]; !ok {
		return serviceerror.NewNotFound("workflow not found")
	}
	f.signals = append(f.signals, signal{wid, name, arg})
	return nil
}

func (f *fakeClient) DescribeWorkflowExecution(_ context.Context, wid, _ string) (*workflowservice.DescribeWorkflowExecutionResponse, error) {
	d, ok := f.workflows[wid]
	if !ok {
		return nil, serviceerror.NewNotFound("workflow not found")
	}
	return d, nil
}

func (f *fakeClient) GetWorkflowHistory(_ context.Context, wid, _ string, _ bool, _ enumspb.HistoryEventFilterType) client.HistoryEventIterator {
	return &fakeIterator{events: f.history[wid]}
}

func (f *fakeClient) WorkflowService() workflowservice.WorkflowServiceClient { return f.svc }

type fakeRun struct{ client.WorkflowRun }

func (fakeRun) GetRunID() string { return "run-1" }

type fakeIterator struct{ events []*historypb.HistoryEvent }

func (it *fakeIterator) HasNext() bool { return len(it.events) > 0 }
func (it *fakeIterator) Next() (*historypb.HistoryEvent, error) {
	e := it.events[0]
	it.events = it.events[1:]
	return e, nil
}

type fakeService struct {
	workflowservice.WorkflowServiceClient
	workers []*workerpb.WorkerHeartbeat
	queries []string
}

func (s *fakeService) ListWorkers(_ context.Context, r *workflowservice.ListWorkersRequest, _ ...grpc.CallOption) (*workflowservice.ListWorkersResponse, error) {
	s.queries = append(s.queries, r.GetQuery())
	resp := &workflowservice.ListWorkersResponse{}
	for _, w := range s.workers {
		resp.Workers = append(resp.Workers, &workerpb.WorkerListInfo{WorkerInstanceKey: w.GetWorkerInstanceKey()})
	}
	return resp, nil
}

func (s *fakeService) DescribeWorker(_ context.Context, r *workflowservice.DescribeWorkerRequest, _ ...grpc.CallOption) (*workflowservice.DescribeWorkerResponse, error) {
	for _, w := range s.workers {
		if w.GetWorkerInstanceKey() == r.GetWorkerInstanceKey() {
			return &workflowservice.DescribeWorkerResponse{WorkerInfo: &workerpb.WorkerInfo{WorkerHeartbeat: w}}, nil
		}
	}
	return nil, serviceerror.NewNotFound("worker")
}

const session = "0123456789abcdef0123456789abcdef"

func newTestServer(t *testing.T, tc *fakeClient) http.Handler {
	t.Helper()
	if tc.svc == nil {
		tc.svc = &fakeService{}
	}
	cfg := Config{TaskQueue: "agentcore-oncall", UIURL: "http://ui", UINamespace: "ns", WorkerLocation: "local"}
	return NewServer(cfg, "default", tc, slog.New(slog.NewTextHandler(io.Discard, nil)))
}

func do(t *testing.T, h http.Handler, method, path, body, cookie string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if cookie != "" {
		req.AddCookie(&http.Cookie{Name: sessionCookie, Value: cookie})
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestStartScopesTheWorkflowToTheSession(t *testing.T) {
	tc := &fakeClient{}
	h := newTestServer(t, tc)

	rec := do(t, h, "POST", "/api/incidents", `{"id":"abcd1234","scenario":"bad-deploy"}`, session)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	o := tc.started[0]
	if want := "agentcore-oncall-" + session + "-abcd1234"; o.ID != want {
		t.Errorf("workflow ID %q, want %q", o.ID, want)
	}
	if o.WorkflowIDConflictPolicy != enumspb.WORKFLOW_ID_CONFLICT_POLICY_FAIL {
		t.Errorf("conflict policy %v", o.WorkflowIDConflictPolicy)
	}
	if o.Memo["phase"] != "diagnosing" {
		t.Errorf("memo %v", o.Memo)
	}
	var v View
	if err := json.Unmarshal(rec.Body.Bytes(), &v); err != nil {
		t.Fatal(err)
	}
	// The response is what the screen shows next.
	if v.Incident == nil || v.Incident.Phase != "diagnosing" || v.Incident.TemporalURL != "http://ui/namespaces/ns/workflows/"+o.ID {
		t.Errorf("incident %+v", v.Incident)
	}
}

func TestStartGivesANewBrowserItsOwnSession(t *testing.T) {
	tc := &fakeClient{}
	h := newTestServer(t, tc)

	rec := do(t, h, "POST", "/api/incidents", `{"id":"abcd1234","scenario":"bad-deploy"}`, "")

	cookie := rec.Result().Cookies()
	if len(cookie) != 1 || !cookie[0].HttpOnly || !sessionPattern.MatchString(cookie[0].Value) {
		t.Fatalf("cookie %+v", cookie)
	}
	if !strings.Contains(tc.started[0].ID, cookie[0].Value) {
		t.Errorf("workflow ID %q does not contain the new session", tc.started[0].ID)
	}
}

func TestStartRejectsBadInput(t *testing.T) {
	h := newTestServer(t, &fakeClient{})

	rec := do(t, h, "POST", "/api/incidents", `{"id":"ABC","scenario":"meteor"}`, session)

	if rec.Code != http.StatusBadRequest || rec.Header().Get("Content-Type") != "application/problem+json" {
		t.Fatalf("status %d, type %q", rec.Code, rec.Header().Get("Content-Type"))
	}
	var p struct{ Errors []string }
	_ = json.Unmarshal(rec.Body.Bytes(), &p)
	if len(p.Errors) != 2 {
		t.Errorf("errors %v", p.Errors)
	}
}

func TestStartOfAnExistingIDIsAConflict(t *testing.T) {
	tc := &fakeClient{startErr: serviceerror.NewWorkflowExecutionAlreadyStarted("exists", "", "")}
	h := newTestServer(t, tc)

	rec := do(t, h, "POST", "/api/incidents", `{"id":"abcd1234","scenario":"bad-deploy"}`, session)

	if rec.Code != http.StatusConflict {
		t.Fatalf("status %d", rec.Code)
	}
}

func TestDecisionSignalsOnlyThisSessionsIncident(t *testing.T) {
	wid := "agentcore-oncall-" + session + "-abcd1234"
	tc := &fakeClient{workflows: map[string]*workflowservice.DescribeWorkflowExecutionResponse{wid: {}}}
	h := newTestServer(t, tc)

	other := strings.Repeat("f", 32)
	if rec := do(t, h, "POST", "/api/incidents/abcd1234/decision", `{"approved":true}`, other); rec.Code != http.StatusNotFound {
		t.Fatalf("another session got %d", rec.Code)
	}
	rec := do(t, h, "POST", "/api/incidents/abcd1234/decision", `{"approved":true,"note":"go"}`, session)

	if rec.Code != http.StatusAccepted {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	if len(tc.signals) != 1 || tc.signals[0].wid != wid || tc.signals[0].name != "decide" {
		t.Fatalf("signals %+v", tc.signals)
	}
	if d := tc.signals[0].arg.(map[string]any); d["approved"] != true || d["approver"] != "local presenter" || d["note"] != "go" {
		t.Errorf("decision %v", d)
	}
}

func TestViewReadsMemoHistoryAndWorkersWithoutAQuery(t *testing.T) {
	wid := "agentcore-oncall-" + session + "-abcd1234"
	now := time.Now()
	tc := &fakeClient{
		workflows: map[string]*workflowservice.DescribeWorkflowExecutionResponse{wid: {
			WorkflowExecutionInfo: &workflowpb.WorkflowExecutionInfo{
				Execution: &commonpb.WorkflowExecution{WorkflowId: wid, RunId: "run-1"},
				Status:    enumspb.WORKFLOW_EXECUTION_STATUS_RUNNING,
				StartTime: timestamppb.New(now.Add(-time.Minute)),
				Memo: &commonpb.Memo{Fields: map[string]*commonpb.Payload{
					"phase":    payload(t, "awaiting_approval"),
					"incident": payload(t, map[string]any{"key": "bad-deploy"}),
					"proposal": payload(t, map[string]any{"service": "checkout-api", "action": "rollback"}),
					"steps":    payload(t, []any{map[string]any{"kind": "thought", "text": "Looking"}}),
				}},
			},
			PendingWorkflowTask: &workflowpb.PendingWorkflowTaskInfo{
				State: enumspb.PENDING_WORKFLOW_TASK_STATE_SCHEDULED, ScheduledTime: timestamppb.New(now), Attempt: 1,
			},
		}},
		history: map[string][]*historypb.HistoryEvent{wid: sampleHistory(now)},
		svc: &fakeService{workers: []*workerpb.WorkerHeartbeat{
			// Killed: its last record still says running, but the heartbeat is old.
			{WorkerInstanceKey: "dead", WorkerIdentity: "worker-a", HeartbeatTime: timestamppb.New(now.Add(-time.Minute))},
		}},
	}
	h := newTestServer(t, tc)

	rec := do(t, h, "GET", "/api/view?incident=abcd1234", "", session)

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	var v View
	if err := json.Unmarshal(rec.Body.Bytes(), &v); err != nil {
		t.Fatal(err)
	}
	inc := v.Incident
	if inc.Phase != "awaiting_approval" || inc.Scenario.Service != "checkout-api" || len(inc.Steps) != 1 {
		t.Errorf("incident %+v", inc)
	}
	if inc.Waiting == nil || inc.Waiting.Task != "Workflow Task" {
		t.Errorf("waiting %+v", inc.Waiting)
	}
	if !v.Worker.Known || v.Worker.Running {
		t.Errorf("a worker with an old heartbeat counted as running: %+v", v.Worker)
	}
	if q := tc.svc.queries; len(q) != 1 || q[0] != "TaskQueue = 'agentcore-oncall' AND Status = 'Running'" {
		t.Errorf("ListWorkers queries %q", q)
	}
	if inc.Proof.ModelCalls != 1 || inc.Proof.ToolCalls != 1 {
		t.Errorf("proof %+v", inc.Proof)
	}
}

func TestViewOfAnotherSessionsIncidentIsNotFound(t *testing.T) {
	h := newTestServer(t, &fakeClient{})

	rec := do(t, h, "GET", "/api/view?incident=abcd1234", "", session)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status %d", rec.Code)
	}
}

func TestLiveWorkerCountsAFreshHeartbeat(t *testing.T) {
	now := time.Now()
	svc := &fakeService{workers: []*workerpb.WorkerHeartbeat{
		{WorkerInstanceKey: "old", WorkerIdentity: "worker-a", HeartbeatTime: timestamppb.New(now.Add(-30 * time.Second))},
		{WorkerInstanceKey: "new", WorkerIdentity: "worker-b", HeartbeatTime: timestamppb.New(now.Add(-5 * time.Second))},
	}}

	st, err := LiveWorker(context.Background(), svc, "default", "q", now)

	if err != nil || !st.Running || st.Identity != "worker-b" {
		t.Fatalf("got %+v, %v", st, err)
	}
}

func TestLoadConfig(t *testing.T) {
	env := func(m map[string]string) func(string) string { return func(k string) string { return m[k] } }

	if _, err := LoadConfig(env(nil)); err == nil || !strings.Contains(err.Error(), "TEMPORAL_TASK_QUEUE") {
		t.Errorf("missing task queue: %v", err)
	}
	if _, err := LoadConfig(env(map[string]string{"TEMPORAL_TASK_QUEUE": "q", "WORKER_LOCATION": "mars"})); err == nil {
		t.Error("bad WORKER_LOCATION accepted")
	}
	cfg, err := LoadConfig(env(map[string]string{"TEMPORAL_TASK_QUEUE": "q"}))
	if err != nil || cfg.Addr != ":8080" || cfg.WorkerLocation != "agentcore" {
		t.Errorf("defaults %+v, %v", cfg, err)
	}
}

func payload(t *testing.T, v any) *commonpb.Payload {
	t.Helper()
	p, err := converter.GetDefaultDataConverter().ToPayload(v)
	if err != nil {
		t.Fatal(err)
	}
	return p
}
