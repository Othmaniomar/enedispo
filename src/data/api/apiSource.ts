// FastAPI-backed source. Not wired to a live service yet: endpoint names are a
// proposal for the engine team, adjust them here only.
//
//   GET  /crises/{id}/meta                       -> CrisisMeta
//   GET  /crises/{id}/timelines                  -> { ours: Snapshot[], reference: Snapshot[] }
//   POST /crises/{id}/decisions   DecisionInput & { kind } -> timelines
//   DELETE /crises/{id}/decisions                 -> timelines
//   GET  /crises/{id}/what-if?team_share=0.5      -> { score, baseline }

import type { CrisisMeta } from '../contract';
import type { CrisisSource, DecisionInput, Timelines } from '../source';

export function createApiSource(baseUrl: string, crisis: string): CrisisSource {
  const url = (p: string) => `${baseUrl.replace(/\/$/, '')}/crises/${encodeURIComponent(crisis)}${p}`;
  const json = async <T>(p: string, init?: RequestInit): Promise<T> => {
    const r = await fetch(url(p), { headers: { 'Content-Type': 'application/json' }, ...init });
    if (!r.ok) throw new Error(`${init?.method ?? 'GET'} ${p} → ${r.status}`);
    return r.json() as Promise<T>;
  };
  const decide = (d: DecisionInput, kind: 'accepted' | 'overridden') =>
    json<Timelines>('/decisions', { method: 'POST', body: JSON.stringify({ ...d, kind }) });

  return {
    loadMeta: () => json<CrisisMeta>('/meta'),
    loadTimelines: () => json<Timelines>('/timelines'),
    accept: (d) => decide(d, 'accepted'),
    override: (d) => decide(d, 'overridden'),
    reset: () => json<Timelines>('/decisions', { method: 'DELETE' }),
    whatIfTeams: (share) => json(`/what-if?team_share=${share}`),
  };
}
