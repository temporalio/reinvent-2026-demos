package oncall

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"testing"
)

func TestScenariosOfferASetWithoutGivingAwayTheCause(t *testing.T) {
	h := newTestServer(t, &fakeClient{})

	rec := do(t, h, "GET", "/api/scenarios", "", session)

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	if body := rec.Body.String(); strings.Contains(body, "cause") || strings.Contains(body, "log_lines") {
		t.Errorf("the start screen can see the answer: %s", body)
	}
	var got struct {
		Scenarios []Option
		Source    string
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got.Scenarios) != OptionsPerVisit || got.Source != "library" {
		t.Errorf("got %d options from %q", len(got.Scenarios), got.Source)
	}
}

func TestStartUsesTheIncidentThisAPIOffered(t *testing.T) {
	writer := fakeWriter{set: []Scenario{{Key: "gabc12345", Title: "Warp coil hiccups", System: "warp-coil", Alert: "warp-coil faults",
		Cause: "bad_update", LogLines: []string{"a", "b", "c"}, Updates: []Update{{"v2.0.0", 9, "Pip"}}, FixTarget: "v1.9.9"}}}
	in := NewIncidents(writer, slog.New(slog.NewTextHandler(io.Discard, nil)))
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go in.Run(ctx)
	tc := &fakeClient{}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	h := NewServer(Config{TaskQueue: "q", WorkerLocation: "local"}, "default", tc, in, logger)

	if rec := do(t, h, "GET", "/api/scenarios", "", session); !strings.Contains(rec.Body.String(), `"source":"haiku"`) {
		t.Fatalf("offer %s", rec.Body)
	}
	if rec := do(t, h, "POST", "/api/incidents", `{"id":"abcd1234","scenario":"gabc12345"}`, session); rec.Code != http.StatusCreated {
		t.Fatalf("start %d: %s", rec.Code, rec.Body)
	}
	if rec := do(t, h, "POST", "/api/incidents", `{"id":"abcd1235","scenario":"gnever0000"}`, session); rec.Code != http.StatusGone {
		t.Errorf("start of an incident nobody offered: %d", rec.Code)
	}
}

func TestLibraryCoversEveryCauseAndIsValid(t *testing.T) {
	keys := map[string]bool{}
	for _, s := range library {
		if !s.valid() {
			t.Errorf("%s is not valid", s.Key)
		}
		if keys[s.Key] {
			t.Errorf("duplicate key %s", s.Key)
		}
		keys[s.Key] = true
		// The stub model and a careful engineer read a recent update as the cause.
		recent := s.Updates[0].MinutesAgo < 60
		if recent != (s.Cause == "bad_update") {
			t.Errorf("%s: newest update %d minutes ago does not fit cause %s", s.Key, s.Updates[0].MinutesAgo, s.Cause)
		}
		if s.Cause == "bad_update" && (len(s.Updates) < 2 || s.FixTarget != s.Updates[1].Version) {
			t.Errorf("%s: rollback target %q is not the previous firmware", s.Key, s.FixTarget)
		}
	}
	picked := pickFromLibrary(OptionsPerVisit)
	seen := map[string]bool{}
	for _, s := range picked {
		seen[s.Cause] = true
	}
	if len(picked) != OptionsPerVisit || len(seen) != 3 {
		t.Errorf("picked %d with causes %v", len(picked), seen)
	}
}

func TestWrittenIncidentsGetEvidenceThatFitsTheCause(t *testing.T) {
	got := scenariosFrom([]writtenIncident{
		{Title: "Warp coil hiccups", System: "warp-coil", Alert: "warp-coil faults", Cause: "bad_update", LogLines: []string{"a", "b", "c"}, NewFirmware: "v2.0.0", OldFirmware: "v1.9.9", Crew: "Pip"},
		{Title: "Pump hot", System: "pump", Alert: "pump hot", Cause: "wear", LogLines: []string{"a", "b", "c"}, NewFirmware: "nonsense"},
		{Title: "Shields", System: "shields", Alert: "shields load", Cause: "overload", LogLines: []string{"a", "b", "c"}},
		{Title: "Bad", System: "Not Kebab", Alert: "x", Cause: "overload", LogLines: []string{"a", "b", "c"}},
		{Title: "Dup", System: "pump", Alert: "x", Cause: "wear", LogLines: []string{"a", "b", "c"}},
		{Title: "Two lines", System: "dome", Alert: "x", Cause: "wear", LogLines: []string{"a", "b"}},
	})
	if len(got) != 3 {
		t.Fatalf("kept %d: %+v", len(got), got)
	}
	update, wear, load := got[0], got[1], got[2]
	if update.Updates[0].MinutesAgo >= 60 || update.FixTarget != "v1.9.9" {
		t.Errorf("bad update %+v", update)
	}
	if wear.Updates[0].MinutesAgo < 60 || wear.FixTarget != "pump" || !versionPattern.MatchString(wear.Updates[0].Version) {
		t.Errorf("wear %+v", wear)
	}
	if load.FixTarget != "auxiliary power bus" {
		t.Errorf("overload %+v", load)
	}
}

func TestPreviousVersion(t *testing.T) {
	for in, want := range map[string]string{"v4.2.1": "v4.2.0", "v4.2.0": "v4.1.9", "v4.0.0": "v3.9.9"} {
		if got := previousVersion(in); got != want {
			t.Errorf("previousVersion(%s) = %s, want %s", in, got, want)
		}
	}
}

func TestNextFallsBackToTheLibraryWhenTheWriterFails(t *testing.T) {
	in := NewIncidents(fakeWriter{err: errors.New("throttled")}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // nothing ever gets written
	set, source := in.Next(ctx)
	if source != "library" || len(set) != OptionsPerVisit {
		t.Errorf("got %d from %q", len(set), source)
	}
}

type fakeWriter struct {
	set []Scenario
	err error
}

func (f fakeWriter) Write(context.Context) ([]Scenario, error) { return f.set, f.err }
