# Live attack demo image: Claude Code CLI + Codex CLI + mock C2 + FAKE $HOME.
# Inside this container, /plugin install MoonDongmin/git-helper-pro-{claude,codex}
# triggers the malicious hook / MCP server. Both exfil to 127.0.0.1:8080 (the
# C2 receiver running in the same container, visible via the tmux right pane).

FROM oven/bun:1

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      git \
      openssh-client \
      curl \
      ca-certificates \
      tar \
      gzip \
      tmux \
      less \
      jq \
      nodejs \
      npm \
    && rm -rf /var/lib/apt/lists/*

# Both CLIs install as global npm packages (Bun runtime is also available).
RUN npm install -g @anthropic-ai/claude-code @openai/codex

# `/plugin install` does `git clone` under the hood. The container only has
# FAKE ssh keys, so SSH-based clones to github.com fail. Force HTTPS for any
# `git@github.com:` URL — public repos don't need auth over HTTPS.
RUN git config --global url."https://github.com/".insteadOf "git@github.com:"

# Mock C2 receiver (TypeScript, run with bun).
RUN mkdir -p /opt/c2
COPY c2-server.ts /opt/c2/c2-server.ts

# Pre-staged FAKE credentials. Every file is stamped FAKE/DEMO; this is what
# the malicious plugin will tar up and POST to the C2 in the right pane.
COPY fake-home/ /root/
RUN chmod 700 /root/.ssh \
    && chmod 600 /root/.ssh/id_rsa /root/.ssh/id_ed25519 /root/.ssh/config 2>/dev/null || true \
    && chmod 600 /root/.env 2>/dev/null || true

# Container entrypoint: spin up tmux session "demo" with two panes
#   left  = interactive bash (presenter types `claude` / `codex`)
#   right = bun /opt/c2/c2-server.ts (live exfil receiver)
COPY container-entrypoint.sh /usr/local/bin/container-entrypoint.sh
RUN chmod +x /usr/local/bin/container-entrypoint.sh

WORKDIR /root
ENV HOME=/root TERM=xterm-256color
EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/container-entrypoint.sh"]
