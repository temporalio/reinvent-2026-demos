package oncall

import (
	"math/rand/v2"
	"regexp"
	"sync"
	"time"
)

// Scenario is one shipboard emergency the visitor can hand to the agent. It
// travels whole into the Workflow's input, where the agent's tools read the
// ship's simulated systems from it (agent/oncall/services.py), so its JSON
// field names match that Python dataclass.
type Scenario struct {
	Key       string   `json:"key"`
	Title     string   `json:"title"`
	System    string   `json:"system"`
	Alert     string   `json:"alert"`
	Cause     string   `json:"cause"` // bad_update, wear or overload
	LogLines  []string `json:"log_lines"`
	Updates   []Update `json:"updates"` // newest first
	FixTarget string   `json:"fix_target"`
}

// Update is one firmware change in a system's maintenance log.
type Update struct {
	Version    string `json:"version"`
	MinutesAgo int    `json:"minutes_ago"`
	Crew       string `json:"crew"`
}

// Option is what the start screen shows. The cause and the evidence stay on
// the server, so the visitor finds out what went wrong from the agent.
type Option struct {
	Key   string `json:"key"`
	Title string `json:"title"`
	Alert string `json:"alert"`
}

func (s Scenario) option() Option { return Option{Key: s.Key, Title: s.Title, Alert: s.Alert} }

var (
	causes        = []string{"bad_update", "wear", "overload"}
	systemPattern = regexp.MustCompile(`^[a-z][a-z0-9-]{2,40}$`)
)

// valid checks a scenario before it reaches a Workflow: the agent's tools
// depend on its shape, and a generated one may be malformed.
func (s Scenario) valid() bool {
	if !systemPattern.MatchString(s.System) || s.Title == "" || len(s.Title) > 80 || s.Alert == "" || len(s.Alert) > 140 {
		return false
	}
	if len(s.LogLines) != 3 || len(s.Updates) == 0 || s.FixTarget == "" {
		return false
	}
	for _, l := range s.LogLines {
		if l == "" || len(l) > 140 {
			return false
		}
	}
	for _, c := range causes {
		if s.Cause == c {
			return true
		}
	}
	return false
}

// library is the ship's built-in set: what the start screen offers when no
// model is configured (local runs) or Haiku doesn't answer in time.
var library = []Scenario{
	{Key: "port-drive-firmware", Title: "Port ion drive stutters after a firmware push", System: "port-ion-drive", Alert: "port-ion-drive thrust faults above 8% for 5 minutes", Cause: "bad_update",
		LogLines: []string{"ERROR thrust vector checksum mismatch on injector bank 3", "WARN  injector timing table rejected by firmware v4.2.0", "INFO  firmware v4.2.0 installed by Pip during the dog watch"},
		Updates:  []Update{{"v4.2.0", 12, "Pip"}, {"v4.1.3", 4100, "maintenance-bot"}}, FixTarget: "v4.1.3"},
	{Key: "gravity-plating-patch", Title: "Gravity plating flickers on deck 3", System: "deck3-gravity-plating", Alert: "deck3-gravity-plating field variance above 0.4 g", Cause: "bad_update",
		LogLines: []string{"ERROR field controller panic: divide by zero in damping loop", "WARN  crew reports floating coffee mugs in the galley", "INFO  firmware v2.9.0 rolled out to deck 3 controllers"},
		Updates:  []Update{{"v2.9.0", 9, "Juno"}, {"v2.8.4", 6020, "maintenance-bot"}}, FixTarget: "v2.8.4"},
	{Key: "replicator-update", Title: "Galley replicator only makes lukewarm soup", System: "galley-replicator", Alert: "galley-replicator recipe faults above 11% since breakfast", Cause: "bad_update",
		LogLines: []string{"ERROR recipe matrix 'Ziggy's moss tea' failed checksum", "WARN  thermal profile table missing after update", "INFO  firmware v7.0.1 applied by Captain's request"},
		Updates:  []Update{{"v7.0.1", 21, "Orion"}, {"v6.9.8", 3500, "maintenance-bot"}}, FixTarget: "v6.9.8"},
	{Key: "airlock-handshake", Title: "Docking airlock refuses every handshake", System: "dock-b-airlock", Alert: "dock-b-airlock handshake failures above 9% for 10 minutes", Cause: "bad_update",
		LogLines: []string{"ERROR seal handshake: unsupported protocol version 3", "WARN  visiting shuttle Kestrel holding at 200 m", "INFO  firmware v3.0.0 enabled new handshake protocol"},
		Updates:  []Update{{"v3.0.0", 17, "Pip"}, {"v2.7.2", 8900, "maintenance-bot"}}, FixTarget: "v2.7.2"},
	{Key: "hydroponics-pump", Title: "Hydroponics pump running hot", System: "hydroponics-pump", Alert: "hydroponics-pump core above 150°C", Cause: "wear",
		LogLines: []string{"WARN  bearing temperature 158°C and climbing", "WARN  nutrient flow 61% of setpoint; tomato bay wilting", "INFO  no configuration changes in 214 days"},
		Updates:  []Update{{"v2.0.9", 8800, "Juno"}}, FixTarget: "hydroponics-pump"},
	{Key: "scrubber-fatigue", Title: "CO₂ scrubber wheezing in the crew quarters", System: "aft-co2-scrubber", Alert: "aft-co2-scrubber core above 140°C, output falling", Cause: "wear",
		LogLines: []string{"WARN  fan vibration 3.1 mm/s, double the baseline", "WARN  sorbent bed temperature 147°C", "INFO  uptime 9,412 hours since last restart"},
		Updates:  []Update{{"v5.4.2", 12400, "Orion"}}, FixTarget: "aft-co2-scrubber"},
	{Key: "tractor-beam-heat", Title: "Tractor beam emitter overheating", System: "tractor-beam-emitter", Alert: "tractor-beam-emitter core above 160°C during cargo pickup", Cause: "wear",
		LogLines: []string{"WARN  emitter coil 166°C; thermal paste degraded", "WARN  beam coherence 64% while towing cargo pod 7", "INFO  coil last reseated 11 months ago"},
		Updates:  []Update{{"v1.12.0", 15200, "Pip"}}, FixTarget: "tractor-beam-emitter"},
	{Key: "nav-gyro-drift", Title: "Navigation gyro drifting off course", System: "nav-gyro-array", Alert: "nav-gyro-array core above 145°C, heading drift 0.3°/min", Cause: "wear",
		LogLines: []string{"WARN  gyro 2 spin bearing 151°C", "WARN  heading drift 0.3°/min; autopilot correcting", "INFO  array has run 3 years without a cold restart"},
		Updates:  []Update{{"v8.1.0", 20100, "Juno"}}, FixTarget: "nav-gyro-array"},
	{Key: "shield-meteor-shower", Title: "Forward shields overloaded in a meteor shower", System: "forward-shield-array", Alert: "forward-shield-array load at 290% of rated", Cause: "overload",
		LogLines: []string{"WARN  emitter load 290% of rated, capacitors at limit", "WARN  micrometeor impacts 41 per minute", "INFO  entered the Perseid debris field at 14:02"},
		Updates:  []Update{{"v7.3.1", 6200, "Orion"}}, FixTarget: "auxiliary power bus"},
	{Key: "sensor-nebula", Title: "Long-range sensors swamped inside a nebula", System: "long-range-sensors", Alert: "long-range-sensors processing load at 310% of rated", Cause: "overload",
		LogLines: []string{"WARN  signal queue 18,400 returns, processors saturated", "WARN  ion storm noise floor up 3.2x", "INFO  ship entered the Crab Nebula's outer filaments"},
		Updates:  []Update{{"v4.4.0", 7300, "Pip"}}, FixTarget: "backup sensor processors"},
	{Key: "life-support-crowd", Title: "Life support straining with a full house aboard", System: "life-support-loop", Alert: "life-support-loop load at 270% of rated", Cause: "overload",
		LogLines: []string{"WARN  oxygen demand 270% of rated", "WARN  recycler queue backing up on deck 2", "INFO  140 re:Invent visitors beamed aboard for the tour"},
		Updates:  []Update{{"v3.8.6", 9900, "Juno"}}, FixTarget: "reserve oxygen plant"},
	{Key: "comms-flood", Title: "Comms array buried in a flood of messages", System: "subspace-comms-array", Alert: "subspace-comms-array load at 300% of rated", Cause: "overload",
		LogLines: []string{"WARN  inbound queue 52,000 messages, relays saturated", "WARN  every ship in the sector is sending birthday wishes to Ziggy", "INFO  traffic up 3.4x since 09:00 ship time"},
		Updates:  []Update{{"v6.2.3", 11300, "Orion"}}, FixTarget: "spare relay transponders"},
}

// pickFromLibrary returns n different built-in scenarios, at least one of each
// cause when n allows, in random order.
func pickFromLibrary(n int) []Scenario {
	shuffled := append([]Scenario(nil), library...)
	rand.Shuffle(len(shuffled), func(i, j int) { shuffled[i], shuffled[j] = shuffled[j], shuffled[i] })
	var picked []Scenario
	seen := map[string]bool{}
	for _, c := range causes { // one of each cause first
		for _, s := range shuffled {
			if s.Cause == c && !seen[s.Key] && len(picked) < n {
				picked = append(picked, s)
				seen[s.Key] = true
				break
			}
		}
	}
	for _, s := range shuffled {
		if len(picked) == n {
			break
		}
		if !seen[s.Key] {
			picked = append(picked, s)
			seen[s.Key] = true
		}
	}
	rand.Shuffle(len(picked), func(i, j int) { picked[i], picked[j] = picked[j], picked[i] })
	return picked
}

// offered remembers the scenarios this API handed out, so a start names one
// by key and the incident's text never comes from the browser. One replica
// serves the demo; a restart forgets them, and the screen asks for a new set.
type offered struct {
	mu sync.Mutex
	m  map[string]offeredScenario
}

type offeredScenario struct {
	s  Scenario
	at time.Time
}

const (
	offeredTTL = 2 * time.Hour
	offeredMax = 2000
)

func (o *offered) add(list []Scenario) {
	o.mu.Lock()
	defer o.mu.Unlock()
	if o.m == nil {
		o.m = map[string]offeredScenario{}
	}
	now := time.Now()
	for k, v := range o.m {
		if now.Sub(v.at) > offeredTTL || len(o.m) > offeredMax {
			delete(o.m, k)
		}
	}
	for _, s := range list {
		o.m[s.Key] = offeredScenario{s, now}
	}
}

func (o *offered) get(key string) (Scenario, bool) {
	for _, s := range library {
		if s.Key == key {
			return s, true
		}
	}
	o.mu.Lock()
	defer o.mu.Unlock()
	v, ok := o.m[key]
	return v.s, ok
}
