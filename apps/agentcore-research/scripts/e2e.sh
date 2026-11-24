#!/bin/sh
# End to end through the published ports, against `docker compose up`:
# start an incident, see it wait for approval with no Worker running, replace
# the agent's process, approve, and see a new Worker finish it without
# repeating a single model or tool call.
set -eu
API=${API:-http://localhost:8080}
JAR=$(mktemp); OTHER=$(mktemp); trap 'rm -f "$JAR" "$OTHER"' EXIT
ID=$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')

field() { python3 -c "import json,sys; v=json.load(sys.stdin); print(eval(sys.argv[1], {}, {'v': v}))" "$1"; }
view() { curl -sf -b "$JAR" -c "$JAR" "$API/api/view?incident=$ID"; }
wait_for() { # wait_for <python expr on v> <seconds> <what>
  i=0
  until [ "$(view | field "$1")" = True ]; do
    i=$((i + 1)); [ "$i" -le "$2" ] || { echo "FAIL: $3"; view; exit 1; }
    sleep 1
  done
  echo "ok: $3 (${i}s)"
}

curl -sf -c "$JAR" "$API/healthz" >/dev/null
# The start screen's alarms: take the first one the API offered this visit.
SCENARIO=$(curl -sf -b "$JAR" -c "$JAR" "$API/api/scenarios" | python3 -c 'import json,sys; print(json.load(sys.stdin)["scenarios"][0]["key"])')
code=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -c "$JAR" -H 'Content-Type: application/json' \
  -d "{\"id\":\"$ID\",\"scenario\":\"$SCENARIO\"}" "$API/api/incidents")
[ "$code" = 201 ] || { echo "FAIL: start returned $code"; exit 1; }
echo "ok: started incident $ID"

wait_for "v['incident']['phase'] == 'awaiting_approval'" 90 "agent proposed a repair and is waiting for the captain"
before=$(view | field "v['incident']['proof']['modelCalls']")
wait_for "not v['worker']['running']" 90 "the Worker drained; no compute while waiting"

code=$(curl -s -o /dev/null -w '%{http_code}' -b "$OTHER" "$API/api/view?incident=$ID")
[ "$code" = 404 ] || { echo "FAIL: another session saw the incident ($code)"; exit 1; }
echo "ok: another browser session cannot see it"

docker compose kill agent >/dev/null 2>&1 && docker compose start agent >/dev/null 2>&1
echo "ok: replaced the agent process (a new AgentCore session)"
[ "$(view | field "v['incident']['phase']")" = awaiting_approval ] || { echo "FAIL: lost its place"; exit 1; }

code=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -H 'Content-Type: application/json' \
  -d '{"approved":true,"note":"e2e"}' "$API/api/incidents/$ID/decision")
[ "$code" = 202 ] || { echo "FAIL: decision returned $code"; exit 1; }
echo "ok: approval accepted with no Worker running"

wait_for "v['incident']['phase'] == 'resolved' and v['incident']['status'] == 'Completed'" 90 "a new Worker resumed and resolved it"
view | python3 -c "
import json, sys
p = json.load(sys.stdin)['incident']['proof']
before = int(sys.argv[1])
assert p['repeats'] == 0, p
assert len(p['workers']) == 2, p['workers']
assert p['modelCalls'] == before + 1, (before, p['modelCalls'])
assert sum(r['name'] == 'apply_repair' for r in p['rows']) == 1
print(f\"ok: {p['modelCalls']} model calls and {p['toolCalls']} tool calls, each once, across {len(p['workers'])} Workers\")
" "$before"
echo PASS
