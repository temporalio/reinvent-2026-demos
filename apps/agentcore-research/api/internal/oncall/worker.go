package oncall

import (
	"context"
	"fmt"
	"time"

	"go.temporal.io/api/workflowservice/v1"
)

// WorkerStatus says whether a Worker is polling the demo's Task Queue now.
type WorkerStatus struct {
	// Known is false when Temporal could not answer; the UI then says it
	// can't tell, rather than "no Worker".
	Known     bool       `json:"known"`
	Running   bool       `json:"running"`
	Identity  string     `json:"identity,omitempty"`
	BuildID   string     `json:"buildId,omitempty"`
	StartedAt *time.Time `json:"startedAt,omitempty"`
	Error     string     `json:"error,omitempty"`
}

// heartbeatFresh is how recent a Worker heartbeat must be to count. The Worker
// sends one every 10 s (agentcore_worker.py). A process that is killed, or an
// AgentCore session that ends, leaves its last record saying Running, so age
// is what tells a live Worker from a dead one.
const heartbeatFresh = 25 * time.Second

func (s *Server) workerStatus(ctx context.Context) WorkerStatus {
	st, err := LiveWorker(ctx, s.tc.WorkflowService(), s.namespace, s.cfg.TaskQueue, time.Now())
	if err != nil {
		s.log.Warn("list workers failed", "error", err)
		return WorkerStatus{Error: "Temporal did not say which Workers are running."}
	}
	return st
}

// LiveWorker finds a Worker polling taskQueue now, from Worker heartbeats
// (ListWorkers, then DescribeWorker for the heartbeat time). Neither call
// needs a Worker or is a billable Action. The local invoker uses it too.
//
// DescribeTaskQueue's poller list is not used: a poller stays listed with its
// last access time for minutes after the Worker stops, so it can't tell a
// Worker that drained a moment ago from one that is polling.
func LiveWorker(ctx context.Context, svc workflowservice.WorkflowServiceClient, namespace, taskQueue string, now time.Time) (WorkerStatus, error) {
	list, err := svc.ListWorkers(ctx, &workflowservice.ListWorkersRequest{
		Namespace: namespace,
		PageSize:  10,
		Query:     fmt.Sprintf("TaskQueue = '%s' AND Status = 'Running'", taskQueue),
	})
	if err != nil {
		return WorkerStatus{}, err
	}
	for _, w := range list.GetWorkers() {
		d, err := svc.DescribeWorker(ctx, &workflowservice.DescribeWorkerRequest{Namespace: namespace, WorkerInstanceKey: w.GetWorkerInstanceKey()})
		if err != nil {
			return WorkerStatus{}, err
		}
		hb := d.GetWorkerInfo().GetWorkerHeartbeat()
		if hb == nil || hb.GetHeartbeatTime() == nil || now.Sub(hb.GetHeartbeatTime().AsTime()) > heartbeatFresh {
			continue
		}
		st := WorkerStatus{
			Known:    true,
			Running:  true,
			Identity: hb.GetWorkerIdentity(),
			BuildID:  hb.GetDeploymentVersion().GetBuildId(),
		}
		if t := hb.GetStartTime(); t != nil {
			ts := t.AsTime()
			st.StartedAt = &ts
		}
		return st, nil
	}
	return WorkerStatus{Known: true}, nil
}
