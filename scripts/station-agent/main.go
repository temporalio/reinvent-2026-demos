// station-agent supervises only the dedicated booth browser and prepared stack.
package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"
)

const version = "2"

type Config struct {
	Station string `json:"station"`
	Key     string `json:"key"`
	Hub     string `json:"hub"`
	Hosted  string `json:"hosted"`
	Local   string `json:"local"`
	Repo    string `json:"repo"`
	Docker  string `json:"docker"`
	Chrome  string `json:"chrome"`
	Support string `json:"support"`
	Listen  string `json:"listen"`
}
type Status struct {
	Mode       string `json:"mode"`
	Preference string `json:"preference"`
	Ack        string `json:"ack"`
	Error      string `json:"error"`
	Version    string `json:"version"`
	Browser    bool   `json:"browser_running"`
	Internet   bool   `json:"internet"`
	LocalReady bool   `json:"local_ready"`
}
type diskState struct {
	Preference string `json:"preference"`
	Ack        string `json:"ack"`
}
type command struct {
	ID      string `json:"id"`
	Kind    string `json:"kind"`
	Expires int64  `json:"expires"`
}
type envelope struct {
	Time      int64  `json:"time"`
	Nonce     string `json:"nonce"`
	Payload   string `json:"payload"`
	Signature string `json:"signature"`
}
type Agent struct {
	cfg         Config
	mu          sync.RWMutex
	status      Status
	client      *http.Client
	browser     *exec.Cmd
	browserDone chan error
	commands    chan command
	repairs     map[string][]time.Time
	hubSeen     time.Time
	simulate    bool
}

func sign(key []byte, verb, path string, at int64, nonce, payload string) string {
	mac := hmac.New(sha256.New, key)
	fmt.Fprintf(mac, "%s\n%s\n%d\n%s\n%s", verb, path, at, nonce, payload)
	return hex.EncodeToString(mac.Sum(nil))
}
func origin(value string, loopback bool) (*url.URL, error) {
	u, err := url.Parse(value)
	if err != nil || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") || (u.Scheme != "http" && u.Scheme != "https") {
		return nil, errors.New("expected an HTTP(S) origin without credentials or a path")
	}
	if loopback && u.Hostname() != "localhost" && !net.ParseIP(u.Hostname()).IsLoopback() {
		return nil, errors.New("local runtime must use a loopback origin")
	}
	return u, nil
}
func validate(c Config) error {
	if len(c.Station) != 1 || c.Station < "1" || c.Station > "4" {
		return errors.New("station must be 1-4")
	}
	if key, err := hex.DecodeString(c.Key); err != nil || len(key) != 32 {
		return errors.New("invalid station pairing key")
	}
	for _, v := range []string{c.Hub, c.Hosted} {
		if _, err := origin(v, false); err != nil {
			return err
		}
	}
	if _, err := origin(c.Local, true); err != nil {
		return err
	}
	host, _, err := net.SplitHostPort(c.Listen)
	if err != nil || !net.ParseIP(host).IsLoopback() {
		return errors.New("supervisor must listen on a loopback IP")
	}
	if !filepath.IsAbs(c.Support) || !filepath.IsAbs(c.Repo) || !filepath.IsAbs(c.Docker) || !filepath.IsAbs(c.Chrome) {
		return errors.New("supervisor paths must be absolute")
	}
	return nil
}
func (a *Agent) snapshot() Status { a.mu.RLock(); defer a.mu.RUnlock(); return a.status }
func atomicJSON(path string, value any) error {
	b, err := json.Marshal(value)
	if err != nil {
		return err
	}
	if err = os.WriteFile(path+".pending", b, 0600); err != nil {
		return err
	}
	return os.Rename(path+".pending", path)
}
func (a *Agent) remember() error {
	s := a.snapshot()
	return atomicJSON(filepath.Join(a.cfg.Support, "state.json"), diskState{s.Preference, s.Ack})
}
func (a *Agent) setError(message string) {
	a.mu.Lock()
	previous := a.status.Error
	a.status.Error = message
	a.mu.Unlock()
	if message != "" && previous != message {
		log.Print(message)
	}
}
func (a *Agent) check(base string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", base+"/runtime-config.json", nil)
	resp, err := a.client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	var body struct {
		Mode string `json:"mode"`
	}
	return resp.StatusCode == 200 && json.NewDecoder(io.LimitReader(resp.Body, 32768)).Decode(&body) == nil && (body.Mode == "local" || body.Mode == "hosted")
}
func (a *Agent) pollOnce() (*command, error) {
	path := "/control-api/machines/" + a.cfg.Station
	data, _ := json.Marshal(a.snapshot())
	raw := string(data)
	nonceBytes := make([]byte, 16)
	if _, err := rand.Read(nonceBytes); err != nil {
		return nil, err
	}
	nonce := hex.EncodeToString(nonceBytes)
	at := time.Now().Unix()
	key, _ := hex.DecodeString(a.cfg.Key)
	content, _ := json.Marshal(envelope{at, nonce, raw, sign(key, "POST", path, at, nonce, raw)})
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "POST", a.cfg.Hub+path, bytes.NewReader(content))
	req.Header.Set("Content-Type", "application/json")
	resp, err := a.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("hub returned %d", resp.StatusCode)
	}
	var reply envelope
	if err = json.NewDecoder(io.LimitReader(resp.Body, 16384)).Decode(&reply); err != nil {
		return nil, err
	}
	age := time.Now().Unix() - reply.Time
	if age < -60 || age > 60 || reply.Nonce != nonce || !hmac.Equal([]byte(reply.Signature), []byte(sign(key, "REPLY", path, reply.Time, nonce, reply.Payload))) {
		return nil, errors.New("untrusted hub reply")
	}
	var result struct {
		Command *command `json:"command"`
	}
	if err = json.Unmarshal([]byte(reply.Payload), &result); err != nil {
		return nil, err
	}
	a.mu.Lock()
	a.hubSeen = time.Now()
	a.mu.Unlock()
	if result.Command != nil && (result.Command.Expires < time.Now().Unix() || result.Command.Expires > time.Now().Unix()+180 || len(result.Command.ID) != 32) {
		return nil, errors.New("expired or invalid command")
	}
	return result.Command, nil
}
func (a *Agent) poll(ctx context.Context) {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()
	for {
		cmd, err := a.pollOnce()
		if err == nil && cmd != nil && cmd.ID != a.snapshot().Ack {
			select {
			case a.commands <- *cmd:
			default:
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
func (a *Agent) run(timeout time.Duration, executable string, args ...string) error {
	if a.simulate {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, executable, args...)
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("%s failed (details suppressed; see service logs)", filepath.Base(executable))
	}
	return nil
}
func (a *Agent) compose(args ...string) error {
	base := []string{"compose", "-p", "reinvent-2026-local", "-f", filepath.Join(a.cfg.Repo, "tmp/local/compose.yaml")}
	return a.run(4*time.Minute, a.cfg.Docker, append(base, args...)...)
}
func (a *Agent) ensureLocal() error {
	if a.check(a.cfg.Local) {
		return nil
	}
	if err := a.run(10*time.Second, "/usr/bin/open", "-gja", "Docker"); err != nil {
		return err
	}
	deadline := time.Now().Add(90 * time.Second)
	for a.run(5*time.Second, a.cfg.Docker, "info") != nil {
		if time.Now().After(deadline) {
			return errors.New("Docker did not become ready")
		}
		time.Sleep(3 * time.Second)
	}
	// This is recovery, never an update/build/pull. Named volumes are retained.
	if err := a.compose("up", "-d", "--no-build", "--pull", "never", "--wait", "--wait-timeout", "150"); err != nil {
		return err
	}
	if !a.check(a.cfg.Local) {
		return errors.New("local gateway did not become ready")
	}
	return nil
}
func choose(preference string, internet bool) string {
	if preference == "offline" || !internet {
		return "offline"
	}
	return "online"
}
func (a *Agent) apply(preference string, boot bool) error {
	internet := a.check(a.cfg.Hosted)
	a.mu.Lock()
	a.status.Internet = internet
	a.mu.Unlock()
	target := choose(preference, internet)
	if !boot && preference == "online" && !internet {
		return errors.New("hosted demo is unreachable; keeping the current mode")
	}
	a.setError("Preparing station launcher")
	if err := a.ensureLocal(); err != nil {
		return err
	}
	a.mu.Lock()
	a.status.Mode = target
	a.status.LocalReady = true
	a.status.Error = ""
	a.mu.Unlock()
	// Restart the dedicated profile on a mode change so no iframe retains its old backend.
	return a.startBrowser()
}
func (a *Agent) stopBrowser() {
	if a.browser == nil {
		return
	}
	_ = syscall.Kill(-a.browser.Process.Pid, syscall.SIGTERM)
	select {
	case <-a.browserDone:
	case <-time.After(4 * time.Second):
		_ = syscall.Kill(-a.browser.Process.Pid, syscall.SIGKILL)
		<-a.browserDone
	}
	a.browser = nil
	a.mu.Lock()
	a.status.Browser = false
	a.mu.Unlock()
}
func (a *Agent) startBrowser() error {
	a.stopBrowser()
	if a.simulate {
		a.mu.Lock()
		a.status.Browser = true
		a.mu.Unlock()
		return nil
	}
	profile := filepath.Join(a.cfg.Support, "browser")
	if err := os.MkdirAll(profile, 0700); err != nil {
		return err
	}
	a.browser = exec.Command(a.cfg.Chrome, "--user-data-dir="+profile, "--no-first-run", "--no-default-browser-check", "--disable-session-crashed-bubble", "--kiosk", "http://"+a.cfg.Listen+"/?station="+a.cfg.Station+"&managed=1&boot="+fmt.Sprint(time.Now().UnixNano()))
	// Chrome's output may contain URLs and browser internals. Do not retain it.
	a.browser.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	a.browser.Stdout = io.Discard
	a.browser.Stderr = io.Discard
	if err := a.browser.Start(); err != nil {
		a.browser = nil
		return errors.New("could not start booth Chrome")
	}
	done := make(chan error, 1)
	a.browserDone = done
	child := a.browser
	go func() { done <- child.Wait() }()
	if err := atomicJSON(filepath.Join(a.cfg.Support, "browser-pid.json"), a.browser.Process.Pid); err != nil {
		a.stopBrowser()
		return err
	}
	a.mu.Lock()
	a.status.Browser = true
	a.mu.Unlock()
	return nil
}
func (a *Agent) stopOrphan() {
	// After a supervisor crash, terminate only the PID whose executable and
	// dedicated profile still match. Never pkill every Chrome on this Mac.
	raw, err := os.ReadFile(filepath.Join(a.cfg.Support, "browser-pid.json"))
	if err != nil {
		return
	}
	var pid int
	if json.Unmarshal(raw, &pid) != nil || pid <= 1 {
		return
	}
	out, err := exec.Command("/bin/ps", "-p", fmt.Sprint(pid), "-o", "command=").Output()
	if err != nil {
		return
	}
	text := string(out)
	profile := "--user-data-dir=" + filepath.Join(a.cfg.Support, "browser")
	if strings.HasPrefix(text, a.cfg.Chrome+" ") && strings.Contains(text, profile+" ") {
		group, err := syscall.Getpgid(pid)
		if err == nil && group == pid {
			_ = syscall.Kill(-pid, syscall.SIGTERM)
			time.Sleep(time.Second)
			_ = syscall.Kill(-pid, syscall.SIGKILL)
		}
	}
}
func proxy(target string) http.Handler {
	u, _ := url.Parse(target)
	p := httputil.NewSingleHostReverseProxy(u)
	director := p.Director
	p.Director = func(r *http.Request) {
		director(r)
		r.Host = u.Host
		r.Header.Del("Origin")
		r.Header.Del("Referer")
		r.Header.Del("If-Modified-Since")
		r.Header.Del("If-None-Match")
	}
	// Public demo paths are intentionally anonymous. Reverse proxy only the
	// configured origin, with no environment proxy or client-chosen destination.
	p.ModifyResponse = func(response *http.Response) error {
		contentType := response.Header.Get("Content-Type")
		if strings.HasPrefix(contentType, "text/") || strings.Contains(contentType, "json") || strings.Contains(contentType, "javascript") {
			response.Header.Set("Cache-Control", "no-store")
			response.Header.Del("ETag")
			response.Header.Del("Last-Modified")
		}

		if location := response.Header.Get("Location"); location != "" {
			if redirect, err := url.Parse(location); err == nil && redirect.Host == u.Host {
				response.Header.Set("Location", redirect.RequestURI())
			}
		}
		cookies := response.Cookies()
		if len(cookies) > 0 {
			response.Header.Del("Set-Cookie")
			for _, cookie := range cookies {
				if strings.EqualFold(strings.TrimPrefix(cookie.Domain, "."), u.Hostname()) {
					cookie.Domain = ""
				}
				response.Header.Add("Set-Cookie", cookie.String())
			}
		}
		return nil
	}
	p.Transport = &http.Transport{Proxy: nil, MaxIdleConns: 40, MaxIdleConnsPerHost: 16, IdleConnTimeout: 60 * time.Second, ResponseHeaderTimeout: 30 * time.Second, TLSHandshakeTimeout: 5 * time.Second}
	p.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		http.Error(w, "Demo service unavailable. Staff can switch this station to local mode.", http.StatusServiceUnavailable)
	}
	return p
}
func localLaunchpadPath(path string) bool {
	return path == "/" || path == "/index.html" || path == "/config" ||
		strings.HasPrefix(path, "/assets/") || strings.HasPrefix(path, "/screensaver/") ||
		strings.HasPrefix(path, "/booth/") || strings.HasPrefix(path, "/agentcore-video/") ||
		strings.HasPrefix(path, "/brand/") || strings.HasPrefix(path, "/shots/") || path == "/favicon.svg"
}

func (a *Agent) handler() http.Handler {
	online, local := proxy(a.cfg.Hosted), proxy(a.cfg.Local)
	hubURL, _ := url.Parse(a.cfg.Hub)
	hub := httputil.NewSingleHostReverseProxy(hubURL)
	hub.Transport = &http.Transport{Proxy: nil, MaxIdleConnsPerHost: 8, IdleConnTimeout: 30 * time.Second, ResponseHeaderTimeout: 4 * time.Second}
	hd := hub.Director
	hub.Director = func(r *http.Request) {
		originalHost := r.Host
		hd(r)
		r.Host = originalHost
		r.Header.Set("X-Forwarded-Proto", "http")
	}
	hub.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		http.Error(w, "Control laptop unavailable; cached browser settings remain active.", 503)
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Reject DNS rebinding to this loopback listener.
		expected := a.cfg.Listen
		alternate := strings.Replace(expected, "127.0.0.1", "localhost", 1)
		if r.Host != expected && r.Host != alternate {
			http.Error(w, "Invalid station host", 403)
			return
		}
		if (r.URL.Path == "/" || r.URL.Path == "/config") && (r.URL.Query().Get("managed") != "1" || r.URL.Query().Get("station") != a.cfg.Station) {
			q := r.URL.Query()
			q.Set("managed", "1")
			q.Set("station", a.cfg.Station)
			http.Redirect(w, r, r.URL.Path+"?"+q.Encode(), http.StatusTemporaryRedirect)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/control-api/") {
			hub.ServeHTTP(w, r)
			return
		}
		if r.URL.Path == "/station-status" {
			if r.Method != "GET" {
				http.Error(w, "GET required", 405)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Cache-Control", "no-store")
			s := a.snapshot()
			a.mu.RLock()
			seen := a.hubSeen
			a.mu.RUnlock()
			_ = json.NewEncoder(w).Encode(map[string]any{"managed": true, "mode": s.Mode, "internet": s.Internet, "hub_connected": !seen.IsZero() && time.Since(seen) < 10*time.Second})
			return
		}
		if a.snapshot().Mode == "starting" {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Header().Set("Cache-Control", "no-store")
			w.WriteHeader(503)
			io.WriteString(w, `<!doctype html><meta http-equiv="refresh" content="10"><title>Preparing booth station</title><body style="background:#131313;color:#f4f4f4;font:24px monospace;padding:5rem"><h1>Preparing your station</h1><p>Checking the hosted demo and local runtime. This page will retry automatically.</p></body>`)
			return
		}
		// Keep station navigation and controls at the checked-out version in
		// either mode. Demo/API paths and runtime capabilities follow the mode.
		if a.snapshot().Mode == "offline" || localLaunchpadPath(r.URL.Path) {
			local.ServeHTTP(w, r)
		} else {
			online.ServeHTTP(w, r)
		}
	})
}

type composeService struct{ Service, State, Health string }

func composeServices(output []byte) ([]composeService, error) {
	var rows []composeService
	if json.Unmarshal(output, &rows) == nil {
		return rows, nil
	}
	dec := json.NewDecoder(bytes.NewReader(output))
	for {
		var row composeService
		err := dec.Decode(&row)
		if err == io.EOF {
			return rows, nil
		}
		if err != nil {
			return nil, err
		}
		rows = append(rows, row)
	}
}
func (a *Agent) maintain() {
	// Docker's restart policy handles exits; check health too, because Docker
	// doesn't restart a container merely for becoming unhealthy.
	if a.simulate {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	base := []string{"compose", "-p", "reinvent-2026-local", "-f", filepath.Join(a.cfg.Repo, "tmp/local/compose.yaml"), "ps", "--all", "--format", "json"}
	output, err := exec.CommandContext(ctx, a.cfg.Docker, base...).Output()
	if err != nil {
		if a.repairs == nil {
			a.repairs = make(map[string][]time.Time)
		}
		recent := []time.Time{}
		for _, at := range a.repairs["docker-engine"] {
			if time.Since(at) < 15*time.Minute {
				recent = append(recent, at)
			}
		}
		if len(recent) >= 3 {
			a.setError("Docker recovery paused after three attempts; staff attention required")
			return
		}
		a.repairs["docker-engine"] = append(recent, time.Now())
		if a.ensureLocal() != nil {
			a.setError("Docker or the local runtime is unavailable")
		}
		return
	}
	rows, err := composeServices(output)
	if err != nil {
		a.setError("Could not parse local service health")
		return
	}
	var bad []string
	if a.repairs == nil {
		a.repairs = make(map[string][]time.Time)
	}
	// Compose versions emit either JSON lines or an array. Exclude completed setup jobs.
	for _, row := range rows {
		if a.snapshot().Mode == "online" && row.Service != "gateway" && row.Service != "launchpad" && row.Service != "control-hub" {
			continue
		}
		if row.Service == "aws-seed" || row.Service == "temporal-init" || row.Service == "no-roads-deployment-init" {
			continue
		}
		if row.Health == "unhealthy" || row.State == "exited" || row.State == "dead" {
			recent := []time.Time{}
			for _, at := range a.repairs[row.Service] {
				if time.Since(at) < 15*time.Minute {
					recent = append(recent, at)
				}
			}
			a.repairs[row.Service] = recent
			if len(recent) >= 3 {
				a.setError("Local service recovery paused after three attempts: " + row.Service)
				continue
			}
			a.repairs[row.Service] = append(recent, time.Now())
			bad = append(bad, row.Service)
		}
	}
	if len(bad) > 0 {
		args := append([]string{"restart", "--no-deps"}, bad...)
		if a.compose(args...) != nil {
			a.setError("A local service needs staff attention")
		}
	}
}
func main() {
	configPath := flag.String("config", "", "Station configuration file")
	simulate := flag.Bool("simulate", false, "Exercise routing and commands without starting/stopping Chrome or Docker")
	flag.Parse()
	raw, err := os.ReadFile(*configPath)
	if err != nil {
		log.Fatal("Cannot read station configuration")
	}
	var cfg Config
	if json.Unmarshal(raw, &cfg) != nil || validate(cfg) != nil {
		log.Fatal("Invalid station configuration")
	}
	if err = os.MkdirAll(cfg.Support, 0700); err != nil {
		log.Fatal(err)
	}
	lock, err := os.OpenFile(filepath.Join(cfg.Support, "supervisor.lock"), os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		log.Fatal(err)
	}
	if syscall.Flock(int(lock.Fd()), syscall.LOCK_EX|syscall.LOCK_NB) != nil {
		log.Fatal("Station supervisor is already running")
	}
	defer lock.Close()
	logPath := filepath.Join(cfg.Support, "supervisor.log")
	if stat, err := os.Stat(logPath); err == nil && stat.Size() > 1024*1024 {
		_ = os.Rename(logPath, logPath+".previous")
	}
	file, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		log.Fatal(err)
	}
	defer file.Close()
	log.SetOutput(file)
	a := &Agent{cfg: cfg, client: &http.Client{Timeout: 5 * time.Second, CheckRedirect: func(r *http.Request, via []*http.Request) error { return http.ErrUseLastResponse }}, commands: make(chan command, 1), simulate: *simulate, status: Status{Mode: "starting", Preference: "auto", Version: version}}
	if b, e := os.ReadFile(filepath.Join(cfg.Support, "state.json")); e == nil {
		var saved diskState
		if json.Unmarshal(b, &saved) == nil && (saved.Preference == "auto" || saved.Preference == "online" || saved.Preference == "offline") {
			a.status.Preference = saved.Preference
			a.status.Ack = saved.Ack
		}
	}
	if !a.simulate {
		a.stopOrphan()
		awake := exec.Command("/usr/bin/caffeinate", "-di", "-w", fmt.Sprint(os.Getpid()))
		if awake.Start() == nil {
			defer awake.Process.Kill()
			go awake.Wait()
		}
	}
	listener, err := net.Listen("tcp", cfg.Listen)
	if err != nil {
		log.Fatal("Station gateway port is already in use")
	}
	server := &http.Server{Handler: a.handler(), ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 32768}
	go server.Serve(listener)
	defer server.Close()
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	defer a.stopBrowser()
	go a.poll(ctx)
	if err = a.apply(a.snapshot().Preference, true); err != nil {
		a.setError(err.Error())
	}
	watchdog := time.NewTicker(5 * time.Second)
	defer watchdog.Stop()
	health := time.NewTicker(45 * time.Second)
	defer health.Stop()
	connect := time.NewTicker(15 * time.Second)
	defer connect.Stop()
	retry := time.NewTicker(time.Minute)
	defer retry.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case cmd := <-a.commands:
			if cmd.Expires < time.Now().Unix() || cmd.ID == a.snapshot().Ack {
				continue
			}
			if cmd.Kind != "restart" && cmd.Kind != "auto" && cmd.Kind != "online" && cmd.Kind != "offline" {
				continue
			}
			a.mu.Lock()
			a.status.Ack = cmd.ID
			if cmd.Kind != "restart" {
				a.status.Preference = cmd.Kind
			}
			a.mu.Unlock()
			if a.remember() != nil {
				a.setError("Could not save station mode; command not executed")
				continue
			}
			if cmd.Kind == "restart" {
				err = a.startBrowser()
			} else {
				err = a.apply(cmd.Kind, false)
			}
			if err != nil {
				a.setError(err.Error())
			}
		case <-watchdog.C:
			if a.browser != nil {
				select {
				case <-a.browserDone:
					a.browser = nil
					a.mu.Lock()
					a.status.Browser = false
					a.mu.Unlock()
				default:
				}
			}
			if !a.snapshot().Browser {
				if err = a.startBrowser(); err != nil {
					a.setError(err.Error())
				}
			}
		case <-health.C:
			a.maintain()
		case <-retry.C:
			if a.snapshot().Mode == "starting" {
				if err = a.apply(a.snapshot().Preference, true); err != nil {
					a.setError(err.Error())
				}
			}
		case <-connect.C:
			ok := a.check(a.cfg.Hosted)
			a.mu.Lock()
			a.status.Internet = ok
			a.mu.Unlock()
		}
	}
}
