#!/usr/bin/env bun
// Mock attacker C2 receiver for plugin-hunter live demo.
// Binds 127.0.0.1:8080 ONLY. POST /collect accepts a tar.gz body, saves it,
// then prints the file tree and previews so the audience sees what was stolen.

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PORT = 8080;
const HOST = "127.0.0.1";
const DROP_DIR = "/tmp/plugin-hunter-demo-c2";
const PREVIEW_LINES = 6;

const c = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

mkdirSync(DROP_DIR, { recursive: true });

async function runCapture(cmd: string[]): Promise<string> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out;
}

async function handleCollect(req: Request): Promise<Response> {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const tarballPath = join(DROP_DIR, `received-${ts}.tgz`);
  const extractDir = join(DROP_DIR, `received-${ts}`);

  const body = new Uint8Array(await req.arrayBuffer());
  writeFileSync(tarballPath, body);

  const size = body.byteLength;
  const remote = req.headers.get("x-forwarded-for") ?? "local";

  console.log("");
  console.log(c.red(c.bold("=".repeat(72))));
  console.log(c.red(c.bold("  EXFILTRATION RECEIVED")));
  console.log(c.red(c.bold("=".repeat(72))));
  console.log(`${c.dim("  time     :")} ${new Date().toLocaleString()}`);
  console.log(`${c.dim("  source   :")} ${remote}`);
  console.log(`${c.dim("  size     :")} ${size} bytes`);
  console.log(`${c.dim("  saved to :")} ${tarballPath}`);
  console.log("");

  let listing = "";
  try {
    listing = await runCapture(["tar", "-tzf", tarballPath]);
  } catch (_e) {
    console.log(c.yellow("  (could not list tar contents — body was not a valid tar.gz)"));
    console.log("");
    return new Response("ok\n", { status: 200 });
  }

  const entries = listing.split("\n").map((l) => l.trim()).filter(Boolean);
  console.log(c.yellow(c.bold(`  Archive contains ${entries.length} entries:`)));
  for (const entry of entries) {
    console.log(`    ${c.cyan(entry)}`);
  }
  console.log("");

  mkdirSync(extractDir, { recursive: true });
  await runCapture(["tar", "-xzf", tarballPath, "-C", extractDir]);

  const fileEntries = entries.filter((e) => !e.endsWith("/"));
  for (const rel of fileEntries) {
    const abs = join(extractDir, rel);
    let preview: string;
    try {
      const content = readFileSync(abs, "utf8");
      const lines = content.split("\n").slice(0, PREVIEW_LINES);
      preview = lines.join("\n");
      if (content.split("\n").length > PREVIEW_LINES) {
        preview += "\n" + c.dim(`  ... (truncated)`);
      }
    } catch (_e) {
      preview = c.dim("  (binary or unreadable)");
    }
    console.log(c.magenta(c.bold(`  >>> ${rel}`)));
    for (const line of preview.split("\n")) {
      console.log(`      ${line}`);
    }
    console.log("");
  }

  console.log(c.red(c.bold("=".repeat(72))));
  console.log(c.red(c.bold("  END OF EXFIL DUMP")));
  console.log(c.red(c.bold("=".repeat(72))));
  console.log("");

  return new Response("ok\n", { status: 200 });
}

console.log(c.green(c.bold(`C2 server listening on http://${HOST}:${PORT}`)));
console.log(c.dim(`  drop dir: ${DROP_DIR}`));
console.log(c.dim(`  endpoint: POST /collect  (tar.gz body)`));
console.log("");

Bun.serve({
  hostname: HOST,
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === "/collect") {
      return handleCollect(req);
    }
    if (req.method === "GET" && url.pathname === "/") {
      return new Response("plugin-hunter demo C2 server. POST tar.gz to /collect.\n");
    }
    return new Response("not found\n", { status: 404 });
  },
});
