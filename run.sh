#!/usr/bin/env bash
#
# run.sh: bring the whole project up locally, with a verbose debug log.
#
# Everything it does is echoed to out/run-<timestamp>.log with timestamps, exit
# codes and durations, so a failed run can be diagnosed after the fact without
# re-running it. The console stays readable; the log gets everything.
#
#   ./run.sh                 preflight, install, verify, canned panel, serve
#   ./run.sh --demo          also run the live extraction demo (needs ANTHROPIC_API_KEY)
#   ./run.sh --full-demo     also run the full pipeline incl. Medplum writes
#   ./run.sh --no-serve      do everything except start the server
#   ./run.sh --no-verify     skip typecheck and engine test
#   ./run.sh --port 3001     serve on a different port
#   ./run.sh -v              stream every command's output to the console too
#   ./run.sh --help
#
# No credentials are needed for the default path: the engine is offline and the
# review panel falls back to the canned demo dataset.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# ---------------------------------------------------------------- options ----

PORT="${PORT:-3000}"
VERBOSE=0
DO_INSTALL=1
DO_VERIFY=1
DO_SERVE=1
DO_DEMO=0
DO_FULL_DEMO=0

usage() { sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    -v|--verbose)   VERBOSE=1 ;;
    --no-install)   DO_INSTALL=0 ;;
    --no-verify)    DO_VERIFY=0 ;;
    --no-serve)     DO_SERVE=0 ;;
    --demo)         DO_DEMO=1 ;;
    --full-demo)    DO_FULL_DEMO=1 ;;
    --port)         PORT="${2:?--port needs a value}"; shift ;;
    -h|--help)      usage; exit 0 ;;
    *) echo "unknown option: $1 (try --help)" >&2; exit 2 ;;
  esac
  shift
done

# ---------------------------------------------------------------- logging ----

mkdir -p out
LOG_FILE="$ROOT/out/run-$(date +%Y%m%d-%H%M%S).log"
SERVER_LOG="$ROOT/out/server.log"

if [ -t 1 ]; then
  C_RESET=$'\033[0m'; C_DIM=$'\033[2m'; C_RED=$'\033[31m'
  C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_BLUE=$'\033[34m'
else
  C_RESET=""; C_DIM=""; C_RED=""; C_GREEN=""; C_YELLOW=""; C_BLUE=""
fi

ts() { date '+%Y-%m-%d %H:%M:%S'; }

# Console gets the headline, the log gets the same line with a timestamp.
say()  { printf '%s\n' "$*"; printf '%s  %s\n' "$(ts)" "$*" >>"$LOG_FILE"; }
info() { say "${C_BLUE}==>${C_RESET} $*"; }
ok()   { say "    ${C_GREEN}ok${C_RESET}    $*"; }
warn() { say "    ${C_YELLOW}warn${C_RESET}  $*"; }
fail() { say "    ${C_RED}fail${C_RESET}  $*"; }
note() { say "    ${C_DIM}$*${C_RESET}"; }
logonly() { printf '%s  %s\n' "$(ts)" "$*" >>"$LOG_FILE"; }

STEP_NO=0

# One counter drives every headline, so console lines and log sections stay in
# the same order and can be cross-referenced by number.
phase() { STEP_NO=$((STEP_NO + 1)); info "$(printf '[%02d] %s' "$STEP_NO" "$1")"; }

# run_step <title> <cmd...>: abort the run if the command fails.
# run_soft <title> <cmd...>: record the failure and carry on.
_exec_step() {
  local abort="$1"; shift
  local title="$1"; shift
  STEP_NO=$((STEP_NO + 1))

  {
    printf '\n'
    printf '=== [%02d] %s\n' "$STEP_NO" "$title"
    printf '    cwd: %s\n' "$PWD"
    printf '    cmd: %s\n' "$*"
  } >>"$LOG_FILE"

  info "$(printf '[%02d] %s' "$STEP_NO" "$title")"

  local start=$SECONDS rc=0
  if [ "$VERBOSE" -eq 1 ]; then
    "$@" 2>&1 | tee -a "$LOG_FILE" || rc=$?
  else
    "$@" >>"$LOG_FILE" 2>&1 || rc=$?
  fi
  local secs=$((SECONDS - start))

  printf '    exit: %d after %ds\n' "$rc" "$secs" >>"$LOG_FILE"

  if [ "$rc" -eq 0 ]; then
    ok "$title (${secs}s)"
    return 0
  fi

  fail "$title exited $rc after ${secs}s"
  if [ "$VERBOSE" -eq 0 ]; then
    printf '%s--- last 40 log lines ---%s\n' "$C_DIM" "$C_RESET"
    tail -n 40 "$LOG_FILE"
    printf '%s--- full log: %s ---%s\n' "$C_DIM" "$LOG_FILE" "$C_RESET"
  fi
  if [ "$abort" -eq 1 ]; then
    exit "$rc"
  fi
  return "$rc"
}

run_step() { _exec_step 1 "$@"; }
run_soft() { _exec_step 0 "$@" || true; }

SERVER_PID=""

# `npm run server` is npm -> tsx -> node, so killing the npm pid alone orphans a
# node process still holding the port. The server is started under job control
# (set -m) so it leads its own process group, and we signal the whole group.
cleanup() {
  [ -n "$SERVER_PID" ] || return 0
  kill -0 "$SERVER_PID" 2>/dev/null || return 0

  logonly "stopping server process group $SERVER_PID"
  kill -TERM "-$SERVER_PID" 2>/dev/null || kill -TERM "$SERVER_PID" 2>/dev/null || true

  for _ in 1 2 3 4 5 6 7 8 9 10; do
    kill -0 "$SERVER_PID" 2>/dev/null || break
    sleep 0.2
  done

  if kill -0 "$SERVER_PID" 2>/dev/null; then
    logonly "server ignored SIGTERM, sending SIGKILL"
    kill -KILL "-$SERVER_PID" 2>/dev/null || kill -KILL "$SERVER_PID" 2>/dev/null || true
  fi
  wait "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM

# ------------------------------------------------------------- preflight ----

phase "preflight"
{
  printf 'log file    : %s\n' "$LOG_FILE"
  printf 'root        : %s\n' "$ROOT"
  printf 'shell       : %s (bash %s)\n' "$SHELL" "${BASH_VERSION:-?}"
  printf 'uname       : %s\n' "$(uname -a)"
  printf 'node        : %s\n' "$(node --version 2>/dev/null || echo MISSING)"
  printf 'npm         : %s\n' "$(npm --version 2>/dev/null || echo MISSING)"
  printf 'git branch  : %s\n' "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo n/a)"
  printf 'git sha     : %s\n' "$(git rev-parse --short HEAD 2>/dev/null || echo n/a)"
  printf 'git dirty   : %s file(s)\n' "$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
  printf 'port        : %s\n' "$PORT"
  printf 'flags       : verbose=%s install=%s verify=%s serve=%s demo=%s full_demo=%s\n' \
    "$VERBOSE" "$DO_INSTALL" "$DO_VERIFY" "$DO_SERVE" "$DO_DEMO" "$DO_FULL_DEMO"
} >>"$LOG_FILE"

command -v node >/dev/null || { fail "node is not installed"; exit 1; }
command -v npm  >/dev/null || { fail "npm is not installed"; exit 1; }

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  # --env-file-if-exists in the npm scripts needs Node 20+.
  fail "node $(node --version) is too old; this project needs Node 20 or newer"
  exit 1
fi
ok "node $(node --version), npm $(npm --version)"
note "log: $LOG_FILE"

# ----------------------------------------------------------- credentials ----

# Read a key out of .env without sourcing it (the file is not ours to execute).
env_value() {
  [ -f .env ] || return 0
  # `|| true` matters: pipefail plus a no-match grep would abort the run.
  { grep -E "^[[:space:]]*$1=" .env 2>/dev/null || true; } | tail -1 | cut -d= -f2- \
    | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//' -e 's/[[:space:]]*$//'
}

# Present the key without printing it: prefix plus length is enough to tell
# "wrong key" from "no key" in the log.
report_key() {
  local name="$1" purpose="$2" value
  value="$(env_value "$name")"
  if [ -z "$value" ] || case "$value" in *...) true ;; *) false ;; esac; then
    warn "$name unset ($purpose unavailable)"
    logonly "  $name = <unset>"
    return 1
  fi
  ok "$name set (${#value} chars, ${value:0:6}...)"
  logonly "  $name = ${value:0:6}... (${#value} chars)"
  return 0
}

phase "credentials"
HAVE_ANTHROPIC=0
HAVE_MEDPLUM=0
if [ -f .env ]; then
  note ".env found ($(wc -c <.env | tr -d ' ') bytes)"
  report_key ANTHROPIC_API_KEY   "live extraction and prose" && HAVE_ANTHROPIC=1
  if report_key MEDPLUM_CLIENT_ID "FHIR writes" \
     && report_key MEDPLUM_CLIENT_SECRET "FHIR writes"; then
    HAVE_MEDPLUM=1
    note "MEDPLUM_BASE_URL = $(env_value MEDPLUM_BASE_URL)"
  fi
  report_key VAPI_API_KEY "voice assistant setup" || true
else
  warn "no .env (offline path only; cp .env.example .env to add credentials)"
fi

# ---------------------------------------------------------------- install ----

if [ "$DO_INSTALL" -eq 1 ]; then
  if [ ! -d node_modules ]; then
    run_step "install dependencies (no node_modules)" npm install
  elif [ package-lock.json -nt node_modules ]; then
    run_step "install dependencies (lockfile changed)" npm install
  else
    phase "dependencies"
    ok "node_modules up to date"
  fi
else
  phase "dependencies"
  note "skipped (--no-install)"
fi

# ----------------------------------------------------------------- verify ----

if [ "$DO_VERIFY" -eq 1 ]; then
  run_step "typecheck" npm run typecheck
  # The engine test is the credibility check: deterministic, offline, and its
  # printed output is the demo. A change that alters it is a change to the
  # clinical claims, not a cosmetic one.
  run_step "engine test" npm test
  if grep -q 'CHAINS: amlodipine -> furosemide -> allopurinol' "$LOG_FILE"; then
    ok "reference cascade chain intact"
  else
    warn "reference cascade chain NOT found in test output (see log)"
  fi
else
  phase "verify"
  note "skipped (--no-verify)"
fi

# ------------------------------------------------------------ review data ----

# out/ is gitignored, so a fresh clone or worktree has no snapshot and the panel
# renders empty. Seed it with the canned dataset unless a real run wrote one.
phase "review snapshot"
if [ -s out/last-review.json ]; then
  ok "out/last-review.json present ($(wc -c <out/last-review.json | tr -d ' ') bytes)"
else
  run_step "seed canned review dataset" \
    cp demo-assets/canned-review.json out/last-review.json
fi

# ------------------------------------------------------------------ demos ----

if [ "$DO_FULL_DEMO" -eq 1 ]; then
  if [ "$HAVE_ANTHROPIC" -eq 1 ] && [ "$HAVE_MEDPLUM" -eq 1 ]; then
    run_step "full pipeline incl. Medplum writes" npm run demo
  else
    warn "--full-demo needs ANTHROPIC_API_KEY and Medplum credentials; skipping"
  fi
elif [ "$DO_DEMO" -eq 1 ]; then
  if [ "$HAVE_ANTHROPIC" -eq 1 ]; then
    run_step "extraction + resolution demo (no FHIR writes)" npm run demo:fast
  else
    warn "--demo needs ANTHROPIC_API_KEY; skipping"
  fi
fi

# ------------------------------------------------------------------ serve ----

if [ "$DO_SERVE" -eq 0 ]; then
  info "done (--no-serve)"
  note "log: $LOG_FILE"
  exit 0
fi

phase "server"

if command -v lsof >/dev/null && lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  fail "port $PORT is already in use"
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN | tee -a "$LOG_FILE"
  note "use --port to pick another one"
  exit 1
fi

logonly "starting: PORT=$PORT npm run server  (output -> $SERVER_LOG)"
: >"$SERVER_LOG"
set -m   # give the server its own process group so cleanup() can kill it whole
PORT="$PORT" npm run server >>"$SERVER_LOG" 2>&1 &
SERVER_PID=$!
set +m
logonly "server pid/pgid $SERVER_PID"

# Poll /health rather than sleeping a fixed amount: tsx startup varies.
HEALTHY=0
for _ in $(seq 1 40); do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    fail "server exited during startup"
    tail -n 30 "$SERVER_LOG"
    exit 1
  fi
  if curl -fsS "http://localhost:$PORT/health" >/dev/null 2>&1; then
    HEALTHY=1
    break
  fi
  sleep 0.25
done

if [ "$HEALTHY" -eq 0 ]; then
  fail "server did not answer /health within 10s"
  tail -n 30 "$SERVER_LOG"
  exit 1
fi

ok "listening on port $PORT (pid $SERVER_PID)"

REVIEW_BYTES="$( { curl -fsS "http://localhost:$PORT/review" || true; } | wc -c | tr -d ' ')"
if [ "$REVIEW_BYTES" -gt 1000 ]; then
  ok "/review rendering ($REVIEW_BYTES bytes)"
else
  warn "/review returned only $REVIEW_BYTES bytes; snapshot may be empty"
fi
logonly "GET /review -> $REVIEW_BYTES bytes"

say ""
say "  review panel   http://localhost:$PORT/review"
say "  snapshot json  http://localhost:$PORT/review.json"
say "  vapi webhook   http://localhost:$PORT/vapi   (expose: npx localtunnel --port $PORT)"
say ""
note "server log: $SERVER_LOG"
note "run log:    $LOG_FILE"
say "  Ctrl-C to stop."
say ""

wait "$SERVER_PID"
