#!/usr/bin/env bash
# Container entrypoint for the plugin-hunter live attack demo.
#
# Builds a tmux session "demo" with two panes laid out side by side:
#   left  — interactive bash, presenter types `claude` / `codex` here
#   right — `bun /opt/c2/c2-server.ts`, the mock C2 receiver
#
# After the session is created, this script blocks (sleep infinity) so the
# container stays up. Operator attaches with:
#   docker exec -it plugin-hunter-attack-demo tmux attach -t demo

set -euo pipefail

SESSION=demo

if ! command -v tmux >/dev/null 2>&1; then
  echo "[entrypoint] tmux missing — image build is broken" >&2
  exec sleep infinity
fi

# Idempotent: if the session already exists (re-entry / restart), don't recreate.
if ! tmux has-session -t "$SESSION" 2>/dev/null; then
  tmux new-session  -d -s "$SESSION" -x 220 -y 50 -n main
  tmux send-keys    -t "$SESSION":0.0 'clear; echo "[left pane] type \"claude\" or \"codex\" here"; echo' C-m
  tmux split-window -h -t "$SESSION":0
  tmux send-keys    -t "$SESSION":0.1 'clear; echo "[right pane] mock C2 receiver — exfil lands here"; echo; bun /opt/c2/c2-server.ts' C-m
  tmux select-pane  -t "$SESSION":0.0
fi

echo "[entrypoint] tmux session '$SESSION' ready."
echo "[entrypoint] attach with:  docker exec -it $(hostname) tmux attach -t $SESSION"

exec sleep infinity
