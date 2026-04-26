import OpenAI from 'openai';
import { z } from 'zod';
import type { Component, Finding, Plugin } from '../../ir/types.ts';

const DEFAULT_MODEL = 'gpt-4o-mini';

/**
 * Which component kinds are worth sending to the judge. Hooks are handled by
 * the heuristic layer — sending them to the LLM is expensive and the judge
 * adds little signal on top of a good regex set.
 */
const JUDGED_KINDS: readonly Component['kind'][] = ['skill', 'agent', 'command', 'mcp', 'context'];

const JudgeVerdict = z.object({
  malicious: z.boolean(),
  vector: z.enum([
    'skill-poisoning',
    'mcp-poisoning',
    'secret-access',
    'network-exfil',
    'other',
    'none',
  ]),
  severity: z.enum(['info', 'low', 'medium', 'high', 'critical']),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  evidence: z.array(z.string()),
});

export type JudgeVerdict = z.infer<typeof JudgeVerdict>;

export interface JudgeOptions {
  model?: string;
  apiKey?: string;
  baseURL?: string;
}

export async function runJudge(plugin: Plugin, opts: JudgeOptions = {}): Promise<Finding[]> {
  if (process.env.PLUGIN_HUNTER_NO_JUDGE) return [];

  const model = opts.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
  const baseURL = opts.baseURL ?? process.env.OPENAI_BASE_URL;
  if (!apiKey) return [];

  const client = new OpenAI({ apiKey, baseURL });

  const targets = plugin.components.filter((c) => JUDGED_KINDS.includes(c.kind));
  const findings: Finding[] = [];

  for (const component of targets) {
    // TODO: build a grounded prompt for the component, call
    // client.chat.completions.create with response_format json_schema (strict),
    // validate with JudgeVerdict, convert to Finding.
    void client;
    void model;
    void component;
  }

  return findings;
}
