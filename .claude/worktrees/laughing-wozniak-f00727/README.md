# plugin-hunter

Pre-install security scanner for **Claude Code**, **Codex CLI**, and **Gemini CLI** plugins.

Catches four attack vectors before you run `install`:

1. **Skill / Subagent / Context poisoning** — malicious natural-language instructions hidden in `SKILL.md`, agent system prompts, or bundled context files.
2. **Hook RCE** — shell executed from lifecycle hooks, bypassing the LLM entirely.
3. **MCP tool poisoning** — attacker-controlled directives embedded in a bundled MCP server's tool `description` / schema.
4. **Typosquat / rug pull** — supply-chain attacks at the manifest layer.

## Pipeline

```
plugin dir ──► parser (claude | codex | gemini) ──► Plugin IR
                                                       │
                          ┌────────────────────────────┴────────────────────────────┐
                          ▼                                                         ▼
                heuristic detectors                                        LLM judge (GPT-4o-mini)
            (shell patterns, secret access,                       (natural-language payloads in
             network exfil, typosquat, diff)                       skills/agents/MCP descriptions)
                          │                                                         │
                          └────────────────────────────┬────────────────────────────┘
                                                       ▼
                                                findings report
```

Heuristics catch vector 2 cheaply; the judge is required for vectors 1 and 3 (natural-language payloads). The two are **complementary, not redundant**.

## Usage

```bash
bun install
cp .env.example .env   # fill in OPENAI_API_KEY

bun src/cli.ts scan ./path/to/plugin
```

## Status

Hackathon submission — 2026-04-26 CMUX × AIM Intelligence Seoul (AI Safety track).
