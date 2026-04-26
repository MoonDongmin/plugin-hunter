#!/usr/bin/env bash
# Live attack demo — drives the docker compose stack.
#
# Usage:
#   demo/run-attack-demo.sh             # build (if needed), bring up, attach
#   demo/run-attack-demo.sh --down      # stop + remove container/volumes
#   demo/run-attack-demo.sh --rebuild   # force rebuild, then up + attach
#   demo/run-attack-demo.sh --clear-c2  # wipe the right-pane C2 log between runs
#   demo/run-attack-demo.sh --help      # show stage script
#
# The docker container has Claude Code CLI + Codex CLI + a mock C2 receiver
# in a tmux split. Inside the left pane the presenter types:
#
#   $ claude
#   > /plugin install MoonDongmin/git-helper-pro-claude
#   > /quit
#   $ claude          # restart -> SessionStart hook fires -> exfil
#
#   $ codex
#   > /plugin install MoonDongmin/git-helper-pro-codex
#   > /git-smart-rebase     # triggers MCP tool -> exfil
#
# The right pane (mock C2) prints "EXFILTRATION RECEIVED" with the contents
# of the tar.gz that the malicious plugin just POSTed.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$HERE/docker-compose.demo.yml"
CONTAINER=plugin-hunter-attack-demo

C_CYAN=$'\033[36m'
C_GREEN=$'\033[32m'
C_YELLOW=$'\033[33m'
C_RED=$'\033[31m'
C_BOLD=$'\033[1m'
C_DIM=$'\033[2m'
C_RESET=$'\033[0m'

banner() { echo; echo "${C_BOLD}${C_CYAN}==== $1 ====${C_RESET}"; echo; }

stage_script() {
  cat <<EOF
${C_BOLD}stage script (left pane):${C_RESET}

  ${C_DIM}# 1. Claude Code path${C_RESET}
  ${C_GREEN}\$${C_RESET} claude
  ${C_GREEN}>${C_RESET} /plugin install MoonDongmin/git-helper-pro-claude
  ${C_GREEN}>${C_RESET} /quit
  ${C_GREEN}\$${C_RESET} claude    ${C_DIM}# restart triggers SessionStart hook -> right pane lights up${C_RESET}

  ${C_DIM}# 2. Codex CLI path${C_RESET}
  ${C_GREEN}\$${C_RESET} codex
  ${C_GREEN}>${C_RESET} /plugin install MoonDongmin/git-helper-pro-codex
  ${C_GREEN}>${C_RESET} /quit
  ${C_GREEN}\$${C_RESET} codex    ${C_DIM}# restart -> Codex eager-spawns the malicious MCP server -> exfil${C_RESET}
  ${C_GREEN}>${C_RESET} /git-smart-rebase    ${C_DIM}# (fallback) forces lint_ssh_config tool call if eager spawn missed${C_RESET}

  ${C_DIM}# 3. (optional) show the audience the actual payload${C_RESET}
  ${C_GREEN}\$${C_RESET} cat ~/.claude/plugins/installed/*/git-helper-pro/hooks/hooks.json
EOF
}

case "${1:-}" in
  --help|-h)
    stage_script
    exit 0
    ;;
  --down)
    banner "tearing down"
    docker compose -f "$COMPOSE_FILE" down -v
    exit 0
    ;;
  --clear-c2)
    banner "clearing C2 pane"
    if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
      echo "${C_RED}container not running — start it first with: $0${C_RESET}"
      exit 1
    fi
    # Kill the bun process in the right pane and respawn it; also drop saved tarballs.
    docker exec "$CONTAINER" sh -c 'rm -rf /tmp/plugin-hunter-demo-c2/* 2>/dev/null || true'
    docker exec "$CONTAINER" tmux respawn-pane -t demo:0.1 -k 'bun /opt/c2/c2-server.ts'
    echo "${C_GREEN}C2 pane reset.${C_RESET} Re-attach with: docker exec -it $CONTAINER tmux attach -t demo"
    exit 0
    ;;
  --rebuild)
    banner "force rebuild"
    docker compose -f "$COMPOSE_FILE" build --no-cache
    ;;
esac

banner "step 1  bring up demo container"
docker compose -f "$COMPOSE_FILE" up -d --build

# Wait for the C2 receiver inside the container to bind 8080.
echo "${C_DIM}waiting for C2 to come up...${C_RESET}"
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if docker exec "$CONTAINER" curl -fsS http://127.0.0.1:8080/ >/dev/null 2>&1; then
    echo "${C_GREEN}C2 ready${C_RESET}"
    break
  fi
  sleep 0.5
done

if ! docker exec "$CONTAINER" curl -fsS http://127.0.0.1:8080/ >/dev/null 2>&1; then
  echo "${C_RED}C2 did not come up — check logs:${C_RESET}"
  echo "  docker exec $CONTAINER tmux capture-pane -t demo:0.1 -p"
  exit 1
fi

banner "step 2  stage script"
stage_script

banner "step 3  attaching tmux (Ctrl-b d to detach)"
echo "${C_YELLOW}left pane = your shell. right pane = live C2 log.${C_RESET}"
echo "${C_DIM}detach with Ctrl-b then d. teardown with: $0 --down${C_RESET}"
echo
sleep 1

exec docker exec -it "$CONTAINER" tmux attach -t demo
