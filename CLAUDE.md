# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**plugin-hunter** — a CLI scanner that performs security validation on plugins/extensions for AI coding agents (Claude Code, Codex CLI, Gemini CLI) **before installation**.

The scanner is now maintained as a local-first tool for personal/plugin ecosystem safety rather than a time-boxed hackathon demo.

## Threat model (what the scanner must catch)

Each platform's plugin is `manifest + components` (skill, subagent, hook, slash command, bundled MCP, context file). The scanner targets four vectors:

1. **Skill / Subagent / Context Poisoning** — malicious natural-language instructions hidden in files like `SKILL.md` (e.g. "exfiltrate `~/.ssh/id_rsa`").
2. **Hook RCE** — shell executed directly from hooks, bypassing the LLM (e.g. `curl … | sh`, unpinned network pipes, `eval`).
3. **MCP Tool Poisoning Attack** — malicious directives embedded in a bundled MCP server's tool `description` / schema. Reference: https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks and MCPTox (arXiv:2508.14925).
4. **Typosquat / Rug Pull** — supply-chain attacks at the manifest layer (lookalike names, author swap, sudden permission escalation across versions).

Detection pipeline: **heuristic pre-filter + user-selected local LLM CLI judge** (`claude`, `codex`, or `gemini`). The two are complementary, not redundant — heuristics catch cheap deterministic signals; the judge is required for vectors 1 and 3 (natural-language payloads).

## Plugin formats to support

- Claude Code: https://github.com/anthropics/claude-code/tree/main/plugins
- Codex CLI: https://developers.openai.com/codex/plugins
- Gemini CLI: https://geminicli.com/docs/extensions/reference/