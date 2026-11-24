package oncall

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	enumspb "go.temporal.io/api/enums/v1"
	"go.temporal.io/api/serviceerror"
	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/temporal"
	"golang.org/x/sync/errgroup"

	"github.com/temporal-sa/temporal-demo-agentcore-oncall/api/web"
)

const (
	workflowType = "IncidentWorkflow"
	signalDecide = "decide"
)

var phaseKey = temporal.NewSearchAttributeKeyKeyword("OncallPhase")

// Server holds the API's dependencies. NewServer returns its handler.
type Server struct {
	cfg       Config
	namespace string
	tc        client.Client
	log       *slog.Logger
}

// NewServer returns the API and UI as one handler. Every route is in routes().
func NewServer(cfg Config, namespace string, tc client.Client, logger *slog.Logger) http.Handler {
	s := &Server{cfg: cfg, namespace: namespace, tc: tc, log: logger}
	return withSession(s.routes())
}

func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.handleHealth)
	mux.HandleFunc("GET /api/view", s.handleView)
	mux.HandleFunc("POST /api/incidents", s.handleStart)
	mux.HandleFunc("POST /api/incidents/{id}/decision", s.handleDecision)
	mux.Handle("GET /", web.Handler())
	return mux
}

// handleHealth is the smoke check: the server is up and Temporal answers.
// It changes nothing.
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	if _, err := s.tc.CheckHealth(ctx, &client.CheckHealthRequest{}); err != nil {
		s.problem(w, http.StatusServiceUnavailable, "Temporal is not reachable", err.Error())
		return
	}
	w.Header().Set("Content-Type", "text/plain")
	_, _ = w.Write([]byte("ok\n"))
}

// handleView is the one read the UI polls. Its Temporal calls run together and
// none of them needs a Worker: Describe (memo, Search Attributes, the pending
// Workflow Task), the Event History, and the Worker list. None is a billable
// Action, and none wakes the AgentCore Worker.
func (s *Server) handleView(w http.ResponseWriter, r *http.Request) {
	incidentID := r.URL.Query().Get("incident")
	if incidentID != "" && !incidentPattern.MatchString(incidentID) {
		s.problem(w, http.StatusBadRequest, "Invalid incident ID", "An incident ID is 8 lowercase hex characters.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	view := View{ServerTime: time.Now().UTC(), Scenarios: scenarios, WorkerLocation: s.cfg.WorkerLocation}
	g, gctx := errgroup.WithContext(ctx)
	g.Go(func() error {
		view.Worker = s.workerStatus(gctx)
		return nil
	})
	if incidentID != "" {
		wid := s.existingWorkflowID(ctx, incidentID)
		var desc *describeResult
		var proof *Proof
		g.Go(func() (err error) {
			desc, err = s.describe(gctx, wid)
			return err
		})
		g.Go(func() (err error) {
			proof, err = s.proof(gctx, wid)
			return err
		})
		if err := g.Wait(); err != nil {
			s.temporalError(w, err)
			return
		}
		view.Incident = s.incidentView(incidentID, wid, desc, proof)
	} else {
		_ = g.Wait()
	}
	writeJSON(w, http.StatusOK, view)
}

type startRequest struct {
	ID       string `json:"id"`
	Scenario string `json:"scenario"`
}

// handleStart starts an incident. The browser chooses the ID, so it can show
// the incident before this returns and retry safely: a repeat of the same ID
// gets 409, which the browser treats as its own earlier start.
func (s *Server) handleStart(w http.ResponseWriter, r *http.Request) {
	var req startRequest
	if !s.decode(w, r, &req) {
		return
	}
	var problems []string
	if !incidentPattern.MatchString(req.ID) {
		problems = append(problems, "id must be 8 lowercase hex characters")
	}
	sc, ok := scenarioByKey(req.Scenario)
	if !ok {
		problems = append(problems, "scenario must be one of bad-deploy, memory-leak, traffic-surge")
	}
	if len(problems) > 0 {
		s.problem(w, http.StatusBadRequest, "Invalid incident", problems...)
		return
	}

	wid := s.existingWorkflowID(r.Context(), req.ID)
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	// Starting records the Workflow and its first task with the server. No
	// Worker needs to be running: on AgentCore, this task is what makes
	// Temporal Cloud invoke one.
	run, err := s.tc.ExecuteWorkflow(ctx, client.StartWorkflowOptions{
		ID:                       wid,
		TaskQueue:                s.cfg.TaskQueue,
		WorkflowIDConflictPolicy: enumspb.WORKFLOW_ID_CONFLICT_POLICY_FAIL,
		WorkflowIDReusePolicy:    enumspb.WORKFLOW_ID_REUSE_POLICY_REJECT_DUPLICATE,
		// Set at start, the memo and the Search Attribute cost no extra Action.
		Memo:                  map[string]any{"incident": sc, "phase": "diagnosing"},
		TypedSearchAttributes: temporal.NewSearchAttributes(phaseKey.ValueSet("diagnosing")),
	}, workflowType, map[string]string{"incident_id": req.ID, "scenario": sc.Key})
	if err != nil {
		var started *serviceerror.WorkflowExecutionAlreadyStarted
		if errors.As(err, &started) {
			s.problem(w, http.StatusConflict, "Incident already started", "An incident with this ID exists in this session.")
			return
		}
		s.temporalError(w, err)
		return
	}
	s.log.Info("incident started", "workflow_id", wid, "scenario", sc.Key)
	now := time.Now().UTC()
	writeJSON(w, http.StatusCreated, View{
		ServerTime:     now,
		Scenarios:      scenarios,
		WorkerLocation: s.cfg.WorkerLocation,
		Incident: &IncidentView{
			ID: req.ID, WorkflowID: wid, RunID: run.GetRunID(), Scenario: sc,
			Status: "Running", Phase: "diagnosing", StartedAt: &now,
			Waiting:     &Waiting{Since: now, Attempt: 1},
			TemporalURL: s.temporalURL(wid),
			Proof:       &Proof{Rows: []ProofRow{}},
		},
	})
}

type decisionRequest struct {
	Approved bool   `json:"approved"`
	Note     string `json:"note"`
}

// handleDecision sends the approval or rejection as a Signal. The server
// records it at once, with no Worker running; recording it is what makes
// Temporal start one. An Update would hold this request open until that
// Worker had cold-started.
func (s *Server) handleDecision(w http.ResponseWriter, r *http.Request) {
	incidentID := r.PathValue("id")
	if !incidentPattern.MatchString(incidentID) {
		s.problem(w, http.StatusBadRequest, "Invalid incident ID", "An incident ID is 8 lowercase hex characters.")
		return
	}
	var req decisionRequest
	if !s.decode(w, r, &req) {
		return
	}
	if len(req.Note) > 200 {
		s.problem(w, http.StatusBadRequest, "Note too long", "Keep the note under 200 characters.")
		return
	}
	decision := map[string]any{"approved": req.Approved, "approver": approver(r), "note": req.Note}
	wid := s.existingWorkflowID(r.Context(), incidentID)
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	if err := s.tc.SignalWorkflow(ctx, wid, "", signalDecide, decision); err != nil {
		s.temporalError(w, err)
		return
	}
	s.log.Info("decision sent", "workflow_id", wid, "approved", req.Approved)
	writeJSON(w, http.StatusAccepted, map[string]any{"decision": decision, "sentAt": time.Now().UTC()})
}

func (s *Server) decode(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 4<<10)
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		s.problem(w, http.StatusBadRequest, "Invalid JSON body", err.Error())
		return false
	}
	return true
}

// temporalError maps a Temporal error to a response without leaking its text
// for anything but the cases the UI handles.
func (s *Server) temporalError(w http.ResponseWriter, err error) {
	var notFound *serviceerror.NotFound
	switch {
	case errors.As(err, &notFound):
		s.problem(w, http.StatusNotFound, "No such incident", "This session has no incident with that ID.")
	case errors.Is(err, context.DeadlineExceeded):
		s.problem(w, http.StatusGatewayTimeout, "Temporal did not answer in time", "Try again in a moment.")
	default:
		if errors.As(err, new(*serviceerror.Unavailable)) {
			s.problem(w, http.StatusServiceUnavailable, "Temporal is not reachable", "The API will reconnect on its own.")
			return
		}
		s.log.Error("temporal call failed", "error", err)
		s.problem(w, http.StatusBadGateway, "Temporal call failed", "See the API log for details.")
	}
}

// problem writes an RFC 9457 problem details response.
func (s *Server) problem(w http.ResponseWriter, status int, title string, details ...string) {
	body := map[string]any{"type": "about:blank", "title": title, "status": status}
	if len(details) == 1 {
		body["detail"] = details[0]
	} else if len(details) > 1 {
		body["errors"] = details
	}
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
