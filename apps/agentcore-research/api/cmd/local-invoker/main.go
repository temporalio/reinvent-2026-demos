// Command local-invoker stands in, under Docker Compose only, for what Temporal
// Cloud does for a Serverless Worker on AgentCore: when the Task Queue has
// work and no Worker is polling it, invoke the agent's /invocations endpoint.
// It also makes the agent's Worker Deployment Version current, which the
// platform does when it deploys the agent.
//
// It is not part of the hosted demo and does not reproduce Temporal Cloud's
// exact rules. It polls once a second, so a local wake-up is up to about a
// second slower than it needs to be.
package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	deploymentpb "go.temporal.io/api/deployment/v1"
	"go.temporal.io/api/serviceerror"
	"go.temporal.io/api/workflowservice/v1"
	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/contrib/envconfig"
	"go.temporal.io/sdk/log"

	"github.com/temporal-sa/temporal-demo-agentcore-oncall/api/internal/oncall"
)

type config struct {
	invokeURL, taskQueue, deployment, buildID string
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	if err := run(ctx, logger); err != nil && !errors.Is(err, context.Canceled) {
		logger.Error("local-invoker stopped", "error", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, logger *slog.Logger) error {
	cfg := config{
		invokeURL:  os.Getenv("AGENT_INVOKE_URL"),
		taskQueue:  os.Getenv("TEMPORAL_TASK_QUEUE"),
		deployment: os.Getenv("TEMPORAL_DEPLOYMENT_NAME"),
		buildID:    os.Getenv("TEMPORAL_WORKER_BUILD_ID"),
	}
	if cfg.invokeURL == "" || cfg.taskQueue == "" || cfg.deployment == "" || cfg.buildID == "" {
		return errors.New("AGENT_INVOKE_URL, TEMPORAL_TASK_QUEUE, TEMPORAL_DEPLOYMENT_NAME and TEMPORAL_WORKER_BUILD_ID must all be set")
	}
	opts, err := envconfig.LoadClientOptions(envconfig.LoadClientOptionsRequest{DisableFile: true})
	if err != nil {
		return err
	}
	opts.Logger = log.NewStructuredLogger(logger)
	tc, err := client.DialContext(ctx, opts)
	if err != nil {
		return err
	}
	defer tc.Close()
	svc := tc.WorkflowService()
	ns := opts.Namespace
	if ns == "" {
		ns = "default"
	}
	httpc := &http.Client{Timeout: 10 * time.Second}

	// A version exists once its first Worker polls, so invoke once, then make
	// the version current. Pinned Workflows started before stay on their own
	// version; new ones start on this one.
	if err := setCurrent(ctx, logger, svc, httpc, ns, cfg); err != nil {
		return err
	}

	tick := time.NewTicker(time.Second)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-tick.C:
		}
		backlog, err := versionBacklog(ctx, svc, ns, cfg)
		if err != nil {
			logger.Warn("read backlog", "error", err)
			continue
		}
		if backlog == 0 {
			continue
		}
		live, err := oncall.LiveWorker(ctx, svc, ns, cfg.taskQueue, time.Now())
		if err != nil {
			logger.Warn("list workers", "error", err)
			continue
		}
		if live.Running {
			continue
		}
		logger.Info("work waiting and no Worker; invoking the agent", "backlog", backlog)
		if err := invoke(ctx, httpc, cfg.invokeURL); err != nil {
			logger.Warn("invoke failed", "error", err)
		}
	}
}

func setCurrent(ctx context.Context, logger *slog.Logger, svc workflowservice.WorkflowServiceClient, httpc *http.Client, ns string, cfg config) error {
	for attempt := 1; ; attempt++ {
		if err := invoke(ctx, httpc, cfg.invokeURL); err != nil {
			logger.Info("agent not reachable yet", "attempt", attempt, "error", err)
		} else {
			_, err := svc.SetWorkerDeploymentCurrentVersion(ctx, &workflowservice.SetWorkerDeploymentCurrentVersionRequest{
				Namespace: ns, DeploymentName: cfg.deployment, BuildId: cfg.buildID, Identity: "local-invoker",
			})
			if err == nil {
				logger.Info("version is current", "deployment", cfg.deployment, "build_id", cfg.buildID)
				return nil
			}
			var notFound *serviceerror.NotFound
			if !errors.As(err, &notFound) {
				logger.Info("version not current yet", "attempt", attempt, "error", err)
			}
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(2 * time.Second):
		}
	}
}

// versionBacklog sums the approximate backlog of the version's Workflow and
// Activity Task Queues. Temporal computes it on the server; it can lag a
// moment behind a start or a Signal.
func versionBacklog(ctx context.Context, svc workflowservice.WorkflowServiceClient, ns string, cfg config) (int64, error) {
	resp, err := svc.DescribeWorkerDeploymentVersion(ctx, &workflowservice.DescribeWorkerDeploymentVersionRequest{
		Namespace:            ns,
		DeploymentVersion:    &deploymentpb.WorkerDeploymentVersion{DeploymentName: cfg.deployment, BuildId: cfg.buildID},
		ReportTaskQueueStats: true,
	})
	if err != nil {
		return 0, err
	}
	var total int64
	for _, tq := range resp.GetVersionTaskQueues() {
		total += tq.GetStats().GetApproximateBacklogCount()
	}
	return total, nil
}

// invoke calls the agent's /invocations the way an AgentCore invocation
// reaches it: a POST with a JSON payload. The agent ignores the payload.
func invoke(ctx context.Context, httpc *http.Client, url string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader([]byte(`{"source":"local-invoker"}`)))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := httpc.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("%s: %s", resp.Status, body)
	}
	return nil
}
