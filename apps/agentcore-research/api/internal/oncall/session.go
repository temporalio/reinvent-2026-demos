package oncall

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"regexp"

	"go.temporal.io/api/serviceerror"
)

// Each browser gets an unguessable session ID in a cookie. Every Workflow ID
// the API makes or reads contains it, so one browser can never see, approve or
// reject another's incident: an ID from another session names a Workflow that
// does not exist in this one, so Temporal answers not found.
const sessionCookie = "oncall_session"

var (
	sessionPattern  = regexp.MustCompile(`^[0-9a-f]{32}$`)
	incidentPattern = regexp.MustCompile(`^[0-9a-f]{8}$`)
)

type sessionKey struct{}

func withSession(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := ""
		if c, err := r.Cookie(sessionCookie); err == nil && sessionPattern.MatchString(c.Value) {
			id = c.Value
		} else {
			buf := make([]byte, 16)
			_, _ = rand.Read(buf) // crypto/rand.Read never returns an error
			id = hex.EncodeToString(buf)
			http.SetCookie(w, &http.Cookie{
				Name:     sessionCookie,
				Value:    id,
				Path:     "/",
				HttpOnly: true,
				SameSite: http.SameSiteLaxMode,
				// The platform terminates TLS in front of the app and says so here.
				Secure: r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https",
			})
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), sessionKey{}, id)))
	})
}

func sessionFrom(ctx context.Context) string {
	id, _ := ctx.Value(sessionKey{}).(string)
	return id
}

// workflowID scopes an incident to the Task Queue and the session:
// <task queue>-<session>-<incident>.
func (s *Server) workflowID(ctx context.Context, incidentID string) string {
	return "agentcore-" + s.cfg.TaskQueue + "-" + sessionFrom(ctx) + "-" + incidentID
}

// approver names the person deciding. On the platform the ingress sets this
// header from the sign-in and strips any copy the browser sends; locally
// there is no sign-in. It is a label in the history, not an access check.
func approver(r *http.Request) string {
	if email := r.Header.Get("X-Temporal-Auth-Email"); email != "" {
		return email
	}
	return "local presenter"
}

// existingWorkflowID retains access to incidents recorded before the prefix change.
// Both candidate IDs contain exactly this session and Task Queue.
func (s *Server) existingWorkflowID(ctx context.Context, incidentID string) string {
	current := s.workflowID(ctx, incidentID)
	if _, err := s.tc.DescribeWorkflowExecution(ctx, current, ""); err == nil {
		return current
	} else {
		var missing *serviceerror.NotFound
		if !errors.As(err, &missing) {
			return current
		}
	}
	legacy := s.cfg.TaskQueue + "-" + sessionFrom(ctx) + "-" + incidentID
	if _, err := s.tc.DescribeWorkflowExecution(ctx, legacy, ""); err == nil {
		return legacy
	}
	return current
}
