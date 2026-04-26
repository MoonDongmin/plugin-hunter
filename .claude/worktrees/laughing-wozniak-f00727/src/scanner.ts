import { runHeuristics } from './detectors/heuristic/index.ts';
import { runJudge } from './detectors/judge/openai.ts';
import type { Finding, Platform, ScanReport } from './ir/types.ts';
import { parsePlugin } from './parsers/index.ts';

export interface ScanOptions {
  platform?: Platform;
  /** Skip the LLM judge even if OPENAI_API_KEY is set. */
  noJudge?: boolean;
}

export async function scan(root: string, opts: ScanOptions = {}): Promise<ScanReport> {
  const started = performance.now();

  const { plugin, warnings } = await parsePlugin(root, opts.platform);

  const heuristicFindings = runHeuristics(plugin);

  const judgeEnabled = !opts.noJudge && !process.env.PLUGIN_HUNTER_NO_JUDGE;
  const judgeFindings = judgeEnabled ? await runJudge(plugin) : [];

  const warningFindings: Finding[] = warnings.map((w, i) => ({
    id: `warn-${i}`,
    vector: 'other',
    severity: 'info',
    detector: 'heuristic',
    confidence: 1,
    title: 'Parser warning',
    description: w,
    evidence: [],
  }));

  const findings = [...warningFindings, ...heuristicFindings, ...judgeFindings];

  return {
    plugin,
    findings,
    durationMs: performance.now() - started,
    judgeUsed: judgeEnabled && judgeFindings.length >= 0,
  };
}
