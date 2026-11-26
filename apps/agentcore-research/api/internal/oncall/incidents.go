package oncall

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	mrand "math/rand/v2"
	"regexp"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/bedrockruntime"
	"github.com/aws/aws-sdk-go-v2/service/bedrockruntime/document"
	"github.com/aws/aws-sdk-go-v2/service/bedrockruntime/types"
)

// OptionsPerVisit is how many emergencies the start screen offers.
const OptionsPerVisit = 6

// IncidentWriter writes a fresh set of shipboard emergencies.
type IncidentWriter interface {
	Write(ctx context.Context) ([]Scenario, error)
}

// Incidents hands each visit of the start screen a new set. With a writer
// (Claude Haiku on Bedrock), one set is always written ahead, so the screen
// doesn't wait on the model; without one, or when it fails, the set comes
// from the built-in library and says so.
type Incidents struct {
	writer IncidentWriter
	ready  chan []Scenario
	log    *slog.Logger
}

// NewIncidents returns the incident source. Call Run to keep a set written
// ahead when writer is not nil.
func NewIncidents(writer IncidentWriter, logger *slog.Logger) *Incidents {
	return &Incidents{writer: writer, ready: make(chan []Scenario, 1), log: logger}
}

// Run writes sets ahead until ctx ends: one waiting in the buffer, the next
// started as soon as it is taken. One goroutine, so at most one model call
// runs at a time; failures back off up to a minute.
func (in *Incidents) Run(ctx context.Context) {
	if in.writer == nil {
		return
	}
	backoff := 2 * time.Second
	for ctx.Err() == nil {
		callCtx, cancel := context.WithTimeout(ctx, 45*time.Second)
		set, err := in.writer.Write(callCtx)
		cancel()
		if err != nil || len(set) == 0 {
			in.log.Warn("incident writer failed; retrying", "error", err, "retry_in", backoff)
			select {
			case <-ctx.Done():
				return
			case <-time.After(backoff):
			}
			backoff = min(backoff*2, time.Minute)
			continue
		}
		backoff = 2 * time.Second
		select {
		case in.ready <- set: // blocks until the screen takes the previous set
		case <-ctx.Done():
			return
		}
	}
}

// Next returns a set for one visit and where it came from: "haiku" or "library".
func (in *Incidents) Next(ctx context.Context) ([]Scenario, string) {
	if in.writer != nil {
		wait, cancel := context.WithTimeout(ctx, 8*time.Second)
		defer cancel()
		select {
		case set := <-in.ready:
			return fill(set), "haiku"
		case <-wait.Done():
			in.log.Warn("no generated incidents ready; offering the built-in library")
		}
	}
	return pickFromLibrary(OptionsPerVisit), "library"
}

// fill tops a generated set up from the library if the model wrote too few.
func fill(set []Scenario) []Scenario {
	if len(set) >= OptionsPerVisit {
		return set[:OptionsPerVisit]
	}
	return append(set, pickFromLibrary(OptionsPerVisit-len(set))...)
}

// BedrockWriter has Claude Haiku write the emergencies, through the Converse
// API with a forced tool call so the answer is structured.
type BedrockWriter struct {
	Client  *bedrockruntime.Client
	ModelID string
}

const writeTool = "log_ship_emergencies"

var writerPrompt = `You write shipboard emergencies for a live demo at AWS re:Invent.

Ziggy, Temporal's tardigrade mascot, captains a starship. An AI engineering agent aboard
diagnoses faults with three tools (telemetry, system logs, maintenance history), proposes one
repair, and waits for the captain (a booth visitor) to approve it.

Write %d different emergencies, two for each cause, in a random order. The ship is %s.
Spread them across different systems: %s, or others you invent.

Causes, and the evidence each one must show in its three log lines:
- bad_update: a firmware update installed minutes ago broke the system. One line names the new
  version being installed, the others show errors that started since.
- wear: the system is worn out from long service. Lines show heat, vibration or degraded output,
  and that nothing has changed in a long time.
- overload: something outside the system is pushing it far past its rated load (a meteor shower,
  a nebula, a crowd of visitors, a flood of messages). Lines show the load and the outside cause.

Make each one vivid, specific and fun, with light humor where it fits (Ziggy's snacks, floating
coffee, curious crew), but keep it family-friendly and keep the logs believable. Never name the
repair in the logs, and never say how long ago anything happened: the maintenance log records
that. Each log line starts with ERROR, WARN or INFO and stays under 100 characters.`

var (
	shipSettings = []string{"drifting through a pink nebula", "docked at a space station for re:Invent",
		"racing a comet past Saturn", "on a cargo run to the Moon", "orbiting a gas giant",
		"threading an asteroid belt", "carrying tourists to Mars", "parked above a black hole's accretion disk"}
	shipSystems = []string{"ion drives", "gravity plating", "hydroponics", "warp coils", "sensor arrays",
		"galley replicators", "airlocks", "tractor beams", "shield emitters", "life support",
		"cargo cranes", "nav computers", "escape pods", "laundry bots", "observation dome"}
	versionPattern = regexp.MustCompile(`^v\d+\.\d+\.\d+$`)
	crewNames      = []string{"Pip", "Juno", "Orion", "Nova", "Bix", "Lumen"}
)

type writtenIncident struct {
	Title         string   `document:"title"`
	System        string   `document:"system"`
	Alert         string   `document:"alert"`
	Cause         string   `document:"cause"`
	LogLines      []string `document:"log_lines"`
	NewFirmware   string   `document:"new_firmware"`
	OldFirmware   string   `document:"previous_firmware"`
	Crew          string   `document:"crew"`
	RerouteTarget string   `document:"reroute_target"`
}

var writeSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"incidents": map[string]any{
			"type": "array",
			"items": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"title":             map[string]any{"type": "string", "description": "Headline under 60 characters, like 'Gravity plating flickers on deck 3'."},
					"system":            map[string]any{"type": "string", "description": "kebab-case system name, like deck3-gravity-plating."},
					"alert":             map[string]any{"type": "string", "description": "The alarm text, starting with the system name, under 90 characters."},
					"cause":             map[string]any{"type": "string", "enum": causes},
					"log_lines":         map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "minItems": 3, "maxItems": 3},
					"new_firmware":      map[string]any{"type": "string", "description": "The system's current firmware, like v4.2.0. For bad_update, the version just installed."},
					"previous_firmware": map[string]any{"type": "string", "description": "The version before it, like v4.1.3."},
					"crew":              map[string]any{"type": "string", "description": "First name of the crew member who installed the current firmware."},
					"reroute_target":    map[string]any{"type": "string", "description": "For overload, the spare capacity the load could move to, like 'backup sensor processors'."},
				},
				"required": []string{"title", "system", "alert", "cause", "log_lines", "new_firmware", "previous_firmware", "crew", "reroute_target"},
			},
		},
	},
	"required": []string{"incidents"},
}

// Write asks Haiku for a set and keeps only the scenarios that are valid.
func (b *BedrockWriter) Write(ctx context.Context) ([]Scenario, error) {
	systems := append([]string(nil), shipSystems...)
	mrand.Shuffle(len(systems), func(i, j int) { systems[i], systems[j] = systems[j], systems[i] })
	prompt := fmt.Sprintf(writerPrompt, OptionsPerVisit, shipSettings[mrand.IntN(len(shipSettings))], strings.Join(systems[:6], ", "))
	out, err := b.Client.Converse(ctx, &bedrockruntime.ConverseInput{
		ModelId:  aws.String(b.ModelID),
		Messages: []types.Message{{Role: types.ConversationRoleUser, Content: []types.ContentBlock{&types.ContentBlockMemberText{Value: prompt}}}},
		ToolConfig: &types.ToolConfiguration{
			Tools: []types.Tool{&types.ToolMemberToolSpec{Value: types.ToolSpecification{
				Name:        aws.String(writeTool),
				Description: aws.String("Log the ship's emergencies for the engineering agent."),
				InputSchema: &types.ToolInputSchemaMemberJson{Value: document.NewLazyDocument(writeSchema)},
			}}},
			ToolChoice: &types.ToolChoiceMemberTool{Value: types.SpecificToolChoice{Name: aws.String(writeTool)}},
		},
		InferenceConfig: &types.InferenceConfiguration{MaxTokens: aws.Int32(4000)},
	})
	if err != nil {
		return nil, err
	}
	msg, ok := out.Output.(*types.ConverseOutputMemberMessage)
	if !ok {
		return nil, errors.New("model returned no message")
	}
	for _, block := range msg.Value.Content {
		use, ok := block.(*types.ContentBlockMemberToolUse)
		if !ok {
			continue
		}
		var written struct {
			Incidents []writtenIncident `document:"incidents"`
		}
		if err := use.Value.Input.UnmarshalSmithyDocument(&written); err != nil {
			return nil, fmt.Errorf("decode incidents: %w", err)
		}
		return scenariosFrom(written.Incidents), nil
	}
	return nil, errors.New("model did not log any incidents")
}

// scenariosFrom turns what the model wrote into scenarios. The model writes
// the story; the numbers the agent reasons from (when each firmware went in,
// what the right repair targets) are set here, so the evidence always fits
// the cause whatever the model wrote.
func scenariosFrom(written []writtenIncident) []Scenario {
	var out []Scenario
	seen := map[string]bool{}
	for _, w := range written {
		crew := strings.TrimSpace(w.Crew)
		if crew == "" || len(crew) > 20 {
			crew = crewNames[mrand.IntN(len(crewNames))]
		}
		newFW, oldFW := w.NewFirmware, w.OldFirmware
		if !versionPattern.MatchString(newFW) {
			newFW = fmt.Sprintf("v%d.%d.%d", 2+mrand.IntN(7), mrand.IntN(10), mrand.IntN(10))
		}
		// Only a rollback needs a different version to return to.
		if !versionPattern.MatchString(oldFW) || oldFW == newFW {
			oldFW = previousVersion(newFW)
		}
		s := Scenario{Key: "g" + randomHex(4), Title: strings.TrimSpace(w.Title), System: strings.TrimSpace(w.System),
			Alert: strings.TrimSpace(w.Alert), Cause: w.Cause, LogLines: w.LogLines}
		switch w.Cause {
		case "bad_update":
			s.Updates = []Update{{newFW, 5 + mrand.IntN(25), crew}, {oldFW, 2000 + mrand.IntN(6000), "maintenance-bot"}}
			s.FixTarget = oldFW
		case "wear":
			s.Updates = []Update{{newFW, 3000 + mrand.IntN(12000), crew}}
			s.FixTarget = s.System
		case "overload":
			s.Updates = []Update{{newFW, 3000 + mrand.IntN(12000), crew}}
			s.FixTarget = strings.TrimSpace(w.RerouteTarget)
			if s.FixTarget == "" || len(s.FixTarget) > 60 {
				s.FixTarget = "auxiliary power bus"
			}
		}
		if s.valid() && !seen[s.System] {
			seen[s.System] = true
			out = append(out, s)
		}
	}
	return out
}

// previousVersion is a plausible version before v: one patch or minor release back.
func previousVersion(v string) string {
	var major, minor, patch int
	_, _ = fmt.Sscanf(v, "v%d.%d.%d", &major, &minor, &patch)
	switch {
	case patch > 0:
		return fmt.Sprintf("v%d.%d.%d", major, minor, patch-1)
	case minor > 0:
		return fmt.Sprintf("v%d.%d.9", major, minor-1)
	default:
		return fmt.Sprintf("v%d.9.9", max(major-1, 0))
	}
}

func randomHex(n int) string {
	buf := make([]byte, n)
	_, _ = rand.Read(buf) // crypto/rand.Read never returns an error
	return hex.EncodeToString(buf)
}
