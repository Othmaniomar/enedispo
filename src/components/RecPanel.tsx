import { useEffect, useRef } from 'react';
import type { Recommendation, Snapshot } from '../data/contract';
import { fmt1, fmtHour, fmtInt, fmtMinutes } from '../lib/format';
import { useFocusedRec, useOursSnapshot, useStore } from '../state/store';
import { WarningIcon } from './WarningIcon';

/** The single factor that decided the choice, in a few words. */
function decidingFactor(rec: Recommendation): string {
  const next = rec.alternatives.find((a) => a.feasible);
  if (rec.factors.sensitive) return 'Client sensible : traité en priorité';
  if (!next) return 'Seule équipe libre avec l’amplitude nécessaire';
  if (rec.travelMinutes <= next.travelMinutes) return `Équipe la plus proche, à ${fmtMinutes(rec.travelMinutes)}`;
  return 'Les équipes plus proches vont sur des postes plus prioritaires';
}

/** One warning at most, only when something is abnormal. */
function warning(rec: Recommendation): string | null {
  if (rec.factors.shiftHoursLeftAfter < 1.5) return `Amplitude tendue : ${fmt1(rec.factors.shiftHoursLeftAfter)} h restante après l’intervention`;
  if (rec.travelMinutes > 90) return 'Trajet long : durée réelle incertaine';
  return null;
}

function FocusCard({ rec, snap }: { rec: Recommendation; snap: Snapshot }) {
  const busy = useStore((s) => s.busy);
  const { accept, openOverride, openCopilot, hoverRec } = useStore.getState();
  const label = (id: string) => snap.teams.find((t) => t.id === id)?.label ?? id;
  const inc = snap.incidents.find((i) => i.id === rec.incidentId);
  const f = rec.factors;
  const next = rec.alternatives.find((a) => a.feasible);
  const warn = warning(rec);
  const max = Math.max(rec.travelMinutes, next?.travelMinutes ?? 0, 1);

  return (
    <article className="focus" aria-label="Recommandation en cours" onMouseEnter={() => hoverRec(rec.id, 'card')} onMouseLeave={() => hoverRec(undefined)}>
      <h3 className="focus-action">
        {label(rec.teamId)} → {inc?.commune}
        <span className="focus-eta">, arrivée {fmtHour(rec.eta)}</span>
      </h3>
      {f.sensitive && <span className="tag tag-sensitive">Client sensible</span>}
      <p className="focus-facts">
        <b>{fmtInt(f.clients)}</b> clients · <b>{fmtMinutes(f.travelMinutes)}</b> de trajet · <b>{fmt1(f.repairHours).replace(',0', '')} h</b> de dépannage ·{' '}
        <b>{fmt1(f.shiftHoursLeftAfter)} h</b> d’amplitude restante
      </p>
      <p className="focus-why">{decidingFactor(rec)}</p>

      {next && (
        <div className="compare-bars" aria-label="Délai d’arrivée comparé au deuxième choix">
          <div className="cb-row">
            <span className="cb-name">{label(rec.teamId)}</span>
            <span className="cb-track">
              <i className="cb-fill" style={{ width: `${(rec.travelMinutes / max) * 100}%` }} />
            </span>
            <span className="cb-value">{fmtMinutes(rec.travelMinutes)}</span>
          </div>
          <div className="cb-row alt">
            <span className="cb-name">{label(next.teamId)}</span>
            <span className="cb-track">
              <i className="cb-fill" style={{ width: `${(next.travelMinutes / max) * 100}%` }} />
            </span>
            <span className="cb-value">
              {fmtMinutes(next.travelMinutes)}
              {next.deltaScore > 0 && <span className="cb-cost"> · ≈ +{fmtInt(next.deltaScore)} clients·h</span>}
            </span>
          </div>
        </div>
      )}

      {warn && (
        <p className="focus-warn">
          <WarningIcon tone="waiting" />
          {warn}
        </p>
      )}

      <div className="focus-actions">
        <button className="pill primary" disabled={busy} onClick={() => accept(rec)}>
          Accepter <kbd>Entrée</kbd>
        </button>
        <button className="pill" disabled={busy || rec.alternatives.length === 0} onClick={() => openOverride(rec.id)}>
          Changer d’équipe <kbd>C</kbd>
        </button>
        <button className="link" onClick={() => openCopilot('Pourquoi cette équipe ?', rec.id)}>
          Pourquoi ?
        </button>
      </div>
    </article>
  );
}

function QueueRow({ rec, rank, snap, hovered }: { rec: Recommendation; rank: number; snap: Snapshot; hovered: boolean }) {
  const { focusRec, hoverRec } = useStore.getState();
  const ref = useRef<HTMLButtonElement>(null);
  const hoverFrom = useStore((s) => s.hoverFrom);
  useEffect(() => {
    if (hovered && hoverFrom === 'map') ref.current?.scrollIntoView({ block: 'nearest' });
  }, [hovered, hoverFrom]);
  const team = snap.teams.find((t) => t.id === rec.teamId)?.label;
  const inc = snap.incidents.find((i) => i.id === rec.incidentId);
  return (
    <li>
      <button
        ref={ref}
        className={`row ${hovered ? 'hovered' : ''}`}
        onClick={() => focusRec(rec.id)}
        onMouseEnter={() => hoverRec(rec.id, 'card')}
        onMouseLeave={() => hoverRec(undefined)}
      >
        <span className="row-rank">{rank}</span>
        <span className="row-action">
          {team} → {inc?.commune}
          {rec.factors.sensitive && <span className="tag tag-sensitive">Client sensible</span>}
        </span>
        <span className="row-eta">{fmtHour(rec.eta)}</span>
        <span className="row-clients">{fmtInt(rec.factors.clients)} cl.</span>
      </button>
    </li>
  );
}

function EmptyState({ snap }: { snap: Snapshot }) {
  const k = snap.kpis;
  const done = k.clientsCut === 0 && k.clientsRestored > 0;
  return (
    <div className="empty">
      {done
        ? 'Crise terminée : tous les clients sont réalimentés.'
        : k.incidentsWaiting === 0
          ? 'Aucun incident en attente.'
          : k.teamsAvailable === 0
            ? 'Toutes les équipes sont engagées.'
            : 'Les équipes libres n’ont pas l’amplitude nécessaire.'}
    </div>
  );
}

export function RecPanel() {
  const snap = useOursSnapshot()!;
  const view = useStore((s) => s.view);
  const busy = useStore((s) => s.busy);
  const hoveredRecId = useStore((s) => s.hoveredRecId);
  const resetDecisions = useStore((s) => s.resetDecisions);
  const focused = useFocusedRec();
  const label = (id: string) => snap.teams.find((t) => t.id === id)?.label ?? id;
  const commune = (id: string) => snap.incidents.find((i) => i.id === id)?.commune ?? id;

  if (view === 'reference')
    return (
      <section className="recs">
        <h2 className="panel-title">À décider</h2>
        <div className="empty">Vue référence : aucune décision à prendre.</div>
      </section>
    );

  const recs = snap.recommendations;
  const queue = recs.map((r, i) => ({ r, rank: i + 1 })).filter(({ r }) => r.id !== focused?.id);

  return (
    <section className="recs">
      <h2 className="panel-title">
        À décider {recs.length > 0 && <span className="panel-count">{recs.length}</span>}
      </h2>
      {focused ? <FocusCard key={focused.id} rec={focused} snap={snap} /> : <EmptyState snap={snap} />}

      {queue.length > 0 && (
        <ol className="queue" aria-label="File d’attente">
          {queue.map(({ r, rank }) => (
            <QueueRow key={r.id} rec={r} rank={rank} snap={snap} hovered={hoveredRecId === r.id} />
          ))}
        </ol>
      )}

      {snap.decisions.length > 0 && (
        <div className="decided">
          <div className="decided-head">
            <h3>Décisions prises</h3>
            <button className="pill small" disabled={busy} onClick={() => resetDecisions()}>
              Tout annuler
            </button>
          </div>
          <ul>
            {snap.decisions.map((d) => (
              <li key={d.incidentId} className={d.kind}>
                <span className="decided-kind">{d.kind === 'accepted' ? 'Acceptée' : 'Modifiée'}</span>
                <span>
                  {label(d.teamId)} → {commune(d.incidentId)}
                  {d.kind === 'overridden' && <span className="muted"> (au lieu de {label(d.recommendedTeamId)})</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
