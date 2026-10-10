// THE single entry point for crisis data. Swap the implementation here.
//
//   VITE_DATA_SOURCE=mock (default) -> mock engine running in the browser on
//                                      public/mock/<crisis>/scenario.json
//   VITE_DATA_SOURCE=api            -> FastAPI service at VITE_API_URL (see api/apiSource.ts)
//
// Every call returns the full, aligned timelines of both strategies so the UI can
// scrub freely. Decisions are idempotent per (step, incident).

import type { CrisisMeta, Snapshot } from './contract';
import { createApiSource } from './api/apiSource';
import { createMockSource } from './mock/mockSource';

export type Timelines = { ours: Snapshot[]; reference: Snapshot[] };

export type DecisionInput = {
  step: number; // snapshot index the decision applies to
  recommendationId: string;
  incidentId: string;
  teamId: string; // team finally chosen by the manager
  recommendedTeamId: string;
  reason?: string; // free label for audit ("Connaissance terrain", …)
};

export interface CrisisSource {
  loadMeta(): Promise<CrisisMeta>;
  loadTimelines(): Promise<Timelines>;
  /** Accept the recommendation as is. */
  accept(d: DecisionInput): Promise<Timelines>;
  /** Assign a different team than the recommended one. */
  override(d: DecisionInput): Promise<Timelines>;
  /** Cancels every decision (demo reset). */
  reset(): Promise<Timelines>;
  /** What-if: final score if only `teamShare` of the teams were available. Optional. */
  whatIfTeams?(teamShare: number): Promise<{ score: number; baseline: number }>;
}

const kind = (import.meta.env.VITE_DATA_SOURCE ?? 'mock') as 'mock' | 'api';
const crisis = (import.meta.env.VITE_CRISIS ?? 'CRISE_027') as string;

export const source: CrisisSource =
  kind === 'api'
    ? createApiSource(import.meta.env.VITE_API_URL ?? 'http://localhost:8000', crisis)
    : createMockSource(crisis);
