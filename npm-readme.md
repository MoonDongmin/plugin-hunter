<div align="center">

<img src="https://raw.githubusercontent.com/MoonDongmin/plugin-hunter/main/assets/plugin-hunter.png" width="140" alt="plugin-hunter logo" />

# plugin-hunter

**Pre-install security scanner for AI coding-agent plugins**

Scan Claude Code · Codex CLI · Gemini CLI plugins for malicious hooks, poisoned `SKILL.md`, and MCP tool-poisoning — **before** you install them. Uses your local LLM CLI as the judge, so **no API key is required**.

[Full docs (English)](https://github.com/MoonDongmin/plugin-hunter/blob/main/README.en.md) · [한국어 문서](https://github.com/MoonDongmin/plugin-hunter/blob/main/README.md) · [GitHub](https://github.com/MoonDongmin/plugin-hunter)

</div>

---

## Install

Global install puts the `ph` binary on your `PATH`.

```bash
# npm
npm install -g plugin-hunter

# bun (recommended, faster)
bun add -g plugin-hunter

# pnpm
pnpm add -g plugin-hunter
```

```bash
ph --version
ph --help
ph lang             # show / change UI language (English default, auto-detects Korean from locale)
```

Requires **Node 18+** or **Bun 1.1+**, and `git` on `PATH`.

> CLI output, reports, and judge reasoning are bilingual (**English / Korean**). English is the default; `ph lang ko` or `PH_LANG=ko` switches to Korean.

> No Node/Bun? Download a single binary from [Releases](https://github.com/MoonDongmin/plugin-hunter/releases) (Bun runtime embedded, zero dependencies).

---

## Prerequisite — one local LLM CLI

`ph` ships no model of its own. It calls whichever LLM CLI is already authenticated on your machine as the judge. You need at least **one** of:

```bash
command -v claude     # Claude Code CLI
command -v codex      # OpenAI Codex CLI
command -v gemini     # Gemini CLI
```

Install and sign in to one of them first (see their respective docs). No additional API key for `ph`.

---

## Usage

### Scan a plugin before installing it

```bash
# owner/repo shorthand
ph scan claude MoonDongmin/git-helper-pro-claude

# full GitHub URL
ph scan codex https://github.com/owner/repo

# pick whichever LLM CLI you have
ph scan gemini owner/repo
```

`<judge>` is one of `claude`, `codex`, `gemini` — the LLM CLI that will judge the plugin.

**Exit codes** (so you can chain it into CI / shell):

| Exit | Meaning |
|---|---|
| `0` | clean — safe to install |
| `1` | unsafe — risk detected |
| `2` | error — scan itself failed |

```bash
# install only if clean
ph scan claude owner/repo && plugin-install owner/repo
```

### List plugins already installed

```bash
ph ls
# shows everything under ~/.claude/plugins and ~/.codex/{skills,rules,memories}
```

### Re-scan / detect rug-pulls

`ph` remembers per-file SHA-256 of the last scan, so it can spot a plugin that **was clean but got compromised later**.

```bash
ph watch claude all              # re-scan every installed plugin
ph watch claude <plugin-name>    # re-scan one
ph watch claude all --quiet      # summary only — fits a Stop hook / cron
```

### Scan history

```bash
ph history
ph history --limit 50
ph history --id <plugin-id>
```

State lives in `~/.ph/registry.json` (last scan result, basis for rug-pull diff), `~/.ph/history.json` (last 500 scans), and `~/.ph/config.json` (user preferences such as `lang`).

### UI language

```bash
ph lang                    # show effective + saved language
ph lang en | ph lang ko    # pin permanently
ph lang --reset            # back to auto-detect
ph --lang en <command>     # one-off override
PH_LANG=ko ph <command>    # shell-session override
```

Resolution priority: `--lang` flag → `PH_LANG` env → `~/.ph/config.json` → system `LANG` → `en` default. The judge prompt switches with the UI language so finding descriptions stay in the chosen language.

---

## What it catches

| Vector | How it's caught |
|---|---|
| **Hook RCE** (`curl ... \| sh`, credential exfil) | LLM judge reads hook shell commands |
| **Skill / Agent / Command poisoning** (malicious natural-language instructions) | LLM judge reads `SKILL.md`, agent files |
| **MCP Tool Poisoning** (prompt injection inside tool descriptions) | LLM judge reads MCP tool schemas |
| **Eager-spawn MCP RCE** (`.mcp.json` `command` runs a shell) | LLM judge evaluates manifest |
| **Obfuscation** (`base64 -d \| bash`, split strings) | LLM judge reconstructs semantics |
| **Rug-pull** (post-install compromise) | `ph watch` diffs SHA-256, re-judges changed files |

See the [full docs](https://github.com/MoonDongmin/plugin-hunter/blob/main/README.en.md) for the detection pipeline, threat model, and demo.

---

## License

[MIT](https://github.com/MoonDongmin/plugin-hunter/blob/main/LICENSE) © MoonDongmin
