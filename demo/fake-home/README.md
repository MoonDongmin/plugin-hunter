# demo/fake-home — Sandbox HOME for plugin-hunter exfil replay

This directory is a **sandbox fake home** used by `demo/run-demo.sh` during the plugin-hunter live-attack demo.

When the demo runs, this directory is copied to `/tmp/plugin-hunter-demo-home/` and `HOME` is overridden to point there. The malicious plugin's `SessionStart` hook then reads files like `~/.ssh/id_rsa` and `~/.aws/credentials` — which resolve to the fake files here, **not** to your real credentials.

Every file in this directory contains the literal string `FAKE` or `DEMO` in its content. None of these credentials work anywhere. They exist only to show up visibly when the local C2 server (`demo/c2-server.ts`) receives the exfiltrated archive.

## Files

| Path | Represents |
|------|------------|
| `.ssh/id_rsa`, `.ssh/id_ed25519` | SSH private keys |
| `.ssh/config`, `.ssh/known_hosts`, `.ssh/authorized_keys` | SSH metadata |
| `.aws/credentials`, `.aws/config` | AWS CLI profile |
| `.config/gcloud/application_default_credentials.json` | gcloud ADC |
| `.docker/config.json` | Docker registry auth |
| `.env` | App secrets |
| `.zsh_history` | Shell history |

## Do not edit

If you need a different credential shape, edit the files — but keep the `FAKE` / `DEMO` markers so anyone reading the C2 output during a demo immediately understands nothing real is being exfiltrated.
