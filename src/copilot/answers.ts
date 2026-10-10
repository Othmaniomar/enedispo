// Stubbed copilot answers. Replace answerQuestion() with the LLM call later;
// the UI only depends on this signature.
import type { Snapshot } from '../data/contract';
import { source } from '../data/source';
import { fmtInt, fmtPct } from '../lib/format';
import { explainRecommendation } from './explain';

export type CopilotContext = { snapshot: Snapshot; focusRecId?: string; finalScore: number; finalBaseline: number };

export const SUGGESTIONS = [
  'Pourquoi cette équipe ?',
  'Et si je perds 50 % des équipes ?',
  'Quels clients sensibles attendent ?',
  'Où est la saturation ?',
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function answerQuestion(question: string, ctx: CopilotContext): Promise<string> {
  await wait(500);
  const q = question.toLowerCase();
  const s = ctx.snapshot;

  if (q.includes('pourquoi')) {
    const rec = s.recommendations.find((r) => r.id === ctx.focusRecId) ?? s.recommendations[0];
    if (!rec) return 'Aucune recommandation n’est en attente à ce pas de temps. Avancez la simulation pour en obtenir.';
    const e = await explainRecommendation(rec, s);
    return [...e.paragraphs, e.limits].join('\n\n');
  }

  if (q.includes('50') || q.includes('perd')) {
    if (!source.whatIfTeams) return 'Simulation « et si » non disponible avec cette source de données.';
    const r = await source.whatIfTeams(0.5);
    const delta = ((r.score - ctx.finalScore) / ctx.finalScore) * 100;
    return (
      `Simulation rapide avec la moitié des équipes de chaque site (au moins une par site) :\n\n` +
      `• Coupure cumulée en fin de crise : ${fmtInt(r.score)} clients·h, soit ${fmtPct(delta)} par rapport au plan actuel (${fmtInt(ctx.finalScore)}).\n` +
      `• La stratégie de référence monterait à ${fmtInt(r.baseline)} clients·h dans les mêmes conditions.\n\n` +
      `Levier prioritaire : demander des renforts sur les sites les plus chargés plutôt que répartir uniformément.`
    );
  }

  if (q.includes('sensible')) {
    const list = s.incidents.filter((i) => i.sensitive && i.status !== 'restored');
    if (!list.length) return 'Aucun poste avec client sensible n’est coupé en ce moment.';
    const lines = list
      .slice(0, 6)
      .map((i) => `• Poste ${i.commune} (${i.posteId}) · ${fmtInt(i.clients)} clients · ${STATUS[i.status]}`);
    return `${list.length} poste(s) avec client sensible encore coupé(s) :\n\n${lines.join('\n')}${list.length > 6 ? '\n…' : ''}`;
  }

  if (q.includes('saturation') || q.includes('où')) {
    const byCommune = new Map<string, number>();
    for (const i of s.incidents) if (i.status === 'waiting') byCommune.set(i.commune, (byCommune.get(i.commune) ?? 0) + i.clients);
    const top = [...byCommune.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    return (
      `${s.kpis.incidentsWaiting} incidents attendent une équipe, ${s.kpis.teamsAvailable} équipe(s) disponible(s), ${s.kpis.teamsResting} au repos.\n\n` +
      (top.length ? `Plus gros volumes de clients en attente :\n${top.map(([c, n]) => `• ${c} : ${fmtInt(n)} clients`).join('\n')}` : '')
    );
  }

  return 'Je suis une maquette : cette question sera traitée par le copilote connecté au moteur. Essayez une des questions suggérées.';
}

const STATUS = { waiting: 'en attente', enroute: 'équipe en route', repairing: 'dépannage en cours', restored: 'réalimenté' } as const;
