package main

import (
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestBootMode(t *testing.T) {
	for _, tc := range []struct {
		pref string
		net  bool
		want string
	}{{"auto", true, "online"}, {"auto", false, "offline"}, {"online", false, "offline"}, {"offline", true, "offline"}} {
		if got := choose(tc.pref, tc.net); got != tc.want {
			t.Fatalf("%+v got %s", tc, got)
		}
	}
}
func TestPollRejectsForgedReply(t *testing.T) {
	key := strings.Repeat("12", 32)
	forged := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req envelope
		json.NewDecoder(r.Body).Decode(&req)
		k, _ := hex.DecodeString(key)
		if req.Signature != sign(k, "POST", r.URL.Path, req.Time, req.Nonce, req.Payload) {
			t.Error("request was not signed")
		}
		payload := `{"command":null}`
		at := time.Now().Unix()
		reply := envelope{at, req.Nonce, payload, sign(k, "REPLY", r.URL.Path, at, req.Nonce, payload)}
		if forged {
			reply.Payload = `{"command":{"kind":"restart"}}`
		}
		json.NewEncoder(w).Encode(reply)
	}))
	defer server.Close()
	a := &Agent{cfg: Config{Station: "3", Key: key, Hub: server.URL}, client: server.Client()}
	if _, err := a.pollOnce(); err != nil {
		t.Fatal(err)
	}
	forged = true
	if _, err := a.pollOnce(); err == nil {
		t.Fatal("accepted forged response")
	}
}
func TestGatewayKeepsControlOnLaptopInBothModes(t *testing.T) {
	backend := func(name string) *httptest.Server {
		return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, name+":"+r.URL.Path) }))
	}
	online, local, hub := backend("hosted"), backend("local"), backend("laptop")
	defer online.Close()
	defer local.Close()
	defer hub.Close()
	a := &Agent{cfg: Config{Hosted: online.URL, Local: local.URL, Hub: hub.URL, Listen: "127.0.0.1:15103"}}
	for _, mode := range []string{"online", "offline"} {
		a.status.Mode = mode
		for _, path := range []string{"/demo/", "/banking/assets/index.js", "/control-api/state", "/assets/index.js", "/screensaver/index.html", "/booth/keyboard.css", "/brand/temporal-mark.svg", "/shots/example.jpg", "/favicon.svg", "/runtime-config.json"} {
			r := httptest.NewRequest("GET", "http://127.0.0.1:15103"+path, nil)
			w := httptest.NewRecorder()
			a.handler().ServeHTTP(w, r)
			want := map[string]string{"online": "hosted", "offline": "local"}[mode]
			if localLaunchpadPath(path) {
				want = "local"
			}
			if strings.HasPrefix(path, "/control-api") {
				want = "laptop"
			}
			if w.Body.String() != want+":"+path {
				t.Fatal(w.Body.String())
			}
		}
	}
	r := httptest.NewRequest("GET", "http://attacker.invalid/", nil)
	w := httptest.NewRecorder()
	a.handler().ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatal("DNS rebinding host accepted")
	}
}
func TestValidateRejectsRemoteLocalAndUnscopedKeys(t *testing.T) {
	c := Config{Station: "1", Key: strings.Repeat("ab", 32), Hub: "http://10.0.0.2:15101", Hosted: "https://example.com", Local: "http://localhost:15101", Repo: "/repo", Docker: "/docker", Chrome: "/chrome", Support: "/support", Listen: "127.0.0.1:15103"}
	if err := validate(c); err != nil {
		t.Fatal(err)
	}
	c.Local = "http://10.0.0.2:15101"
	if validate(c) == nil {
		t.Fatal("accepted remote offline runtime")
	}
	c.Local = "http://localhost:15101"
	c.Listen = "0.0.0.0:15103"
	if validate(c) == nil {
		t.Fatal("exposed native listener")
	}
}

func TestComposeHealthVersions(t *testing.T) {
	for _, raw := range []string{`[{"Service":"api","State":"running","Health":"unhealthy"}]`, "{\"Service\":\"api\",\"State\":\"running\",\"Health\":\"unhealthy\"}\n"} {
		rows, err := composeServices([]byte(raw))
		if err != nil || len(rows) != 1 || rows[0].Health != "unhealthy" {
			t.Fatalf("%s %v", raw, err)
		}
	}
	if _, err := composeServices([]byte("not-json")); err == nil {
		t.Fatal("ignored invalid service status")
	}
}

func TestOnlineBootChecksLocalLauncher(t *testing.T) {
	hosted := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, `{"mode":"hosted"}`) }))
	defer hosted.Close()
	local := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, `{"mode":"local"}`) }))
	defer local.Close()
	a := &Agent{cfg: Config{Hosted: hosted.URL, Local: local.URL}, client: hosted.Client(), simulate: true}
	if err := a.apply("online", true); err != nil {
		t.Fatal(err)
	}
	if !a.snapshot().LocalReady || a.snapshot().Mode != "online" {
		t.Fatal("online mode did not prepare the local launcher")
	}
}
