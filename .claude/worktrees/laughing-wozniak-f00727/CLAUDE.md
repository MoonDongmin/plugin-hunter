# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**plugin-hunter** — a CLI scanner that performs security validation on plugins/extensions for AI coding agents (Claude Code, Codex CLI, Gemini CLI) **before installation**.

Submission for the **2026-04-26 CMUX × AIM Intelligence Hackathon Seoul (AI Safety track)**. 9-hour build, submission at 18:00, finalist pitch at 19:30. Judges are CMUX * AIM Intelligence engineers.

**Hard priority: a working demo beats a clean design.** When in doubt, cut scope, hardcode, skip tests. Refactor only if a judge would notice.

## Threat model (what the scanner must catch)

Each platform's plugin is `manifest + components` (skill, subagent, hook, slash command, bundled MCP, context file). The scanner targets four vectors:

1. **Skill / Subagent / Context Poisoning** — malicious natural-language instructions hidden in files like `SKILL.md` (e.g. "exfiltrate `~/.ssh/id_rsa`").
2. **Hook RCE** — shell executed directly from hooks, bypassing the LLM (e.g. `curl … | sh`, unpinned network pipes, `eval`).
3. **MCP Tool Poisoning Attack** — malicious directives embedded in a bundled MCP server's tool `description` / schema. Reference: https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks and MCPTox (arXiv:2508.14925).
4. **Typosquat / Rug Pull** — supply-chain attacks at the manifest layer (lookalike names, author swap, sudden permission escalation across versions).

Detection pipeline: **heuristic pre-filter + Gemini 2.0 Flash LLM judge**. The two are complementary, not redundant — heuristics catch vector 2 cheaply; the judge is required for vectors 1 and 3 (natural-language payloads).

## Plugin formats to support

- Claude Code: https://github.com/anthropics/claude-code/tree/main/plugins
- Codex CLI: https://developers.openai.com/codex/plugins
- Gemini CLI: https://geminicli.com/docs/extensions/reference/