import type { Finding, Plugin } from '../../ir/types.ts';
import { detectNetworkExfil } from './network-exfil.ts';
import { detectSecretAccess } from './secret-access.ts';
import { detectShellRce } from './shell-rce.ts';

export interface HeuristicContext {
  plugin: Plugin;
}

export type HeuristicDetector = (ctx: HeuristicContext) => Finding[];

const DETECTORS: HeuristicDetector[] = [detectShellRce, detectSecretAccess, detectNetworkExfil];

export function runHeuristics(plugin: Plugin): Finding[] {
  const ctx: HeuristicContext = { plugin };
  return DETECTORS.flatMap((d) => d(ctx));
}
