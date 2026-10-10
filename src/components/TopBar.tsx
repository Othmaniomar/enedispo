import { useEffect, useRef, useState } from 'react';
import { fmtClock, fmtDay, fmtInt } from '../lib/format';
import { stepOf, useStore } from '../state/store';
import { WarningIcon } from './WarningIcon';
import { Wordmark } from './Wordmark';

const TARGET_HOURS = 48;
const CLOSE_HOURS = 42;
const HOUR = 3600_000;
const weekdayFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long' });
const hourFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric', hourCycle: 'h23' });
const hourOnly = (ms: number) => `${Number(hourFmt.formatToParts(ms).find((p) => p.type === 'hour')?.value ?? 0)} h`;
const signedHours = (d: number) => {
  const a = Math.abs(d);
  return `${d < 0 ? '−' : '+'}${a >= 1 ? Math.round(a) : a.toFixed(1).replace('.', ',')} h`;
};

function Clock() {
  const t = useStore((s) => s.t);
  const start = useStore((s) => Date.parse(s.meta!.start));
  const now = start + t * 60000;
  return (
    <div className="clock">
      <div className="clock-time">{fmtClock(now)}</div>
      <div className="clock-date">{fmtDay(now)}</div>
    </div>
  );
}

/** Critical state only flips when the estimate crosses 48 h; an unknown estimate keeps it. */
function useOverTarget(hours: number | null) {
  const state = useRef(false);
  if (hours !== null) {
    if (!state.current && hours > TARGET_HOURS) state.current = true;
    else if (state.current && hours <= TARGET_HOURS) state.current = false;
  }
  return state.current;
}

/** Shows how much the estimate moved (decision or new incidents), for a few seconds. */
function useRecentChange(hours: number | null, step: number) {
  const prev = useRef<{ hours: number | null; step: number } | null>(null);
  const [change, setChange] = useState<{ d: number; id: number } | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = { hours, step };
    // Ignore jumps of the playhead (scrubbing): only same or next step.
    if (!p || p.hours === null || hours === null || Math.abs(step - p.step) > 1) return;
    const d = hours - p.hours;
    if (Math.abs(d) < 0.5) return;
    const id = Date.now();
    setChange({ d, id });
    const timer = setTimeout(() => setChange((c) => (c?.id === id ? null : c)), 4000);
    return () => clearTimeout(timer);
  }, [hours, step]);
  return change;
}

function Restore90() {
  const k = useStore(stepOf);
  const hours = useStore((s) => s.timelines!.ours[k].kpis.restore90Hours);
  const start = useStore((s) => Date.parse(s.meta!.start));
  const t = useStore((s) => s.t);
  const critical = useOverTarget(hours);
  const change = useRecentChange(hours, k);
  const [pinned, setPinned] = useState(false);

  const h = hours === null ? null : Math.ceil(hours);
  const state = h === null ? 'unknown' : critical ? 'over' : h > CLOSE_HOURS ? 'close' : 'ok';
  const when = h === null ? null : Math.ceil((start + (hours as number) * HOUR) / HOUR) * HOUR;
  // Once the moment has passed it is a fact, not an estimate.
  const reached = hours !== null && hours * 60 <= t;
  const scale = Math.max(TARGET_HOURS, Math.ceil((h ?? 0) / 6) * 6);
  const pct = (v: number) => `${(Math.min(v, scale) / scale) * 100}%`;

  return (
    <section className={`r90 r90-${state}`} aria-label="Estimation de rétablissement">
      <div className="r90-sentence">
        {(state === 'over' || state === 'close') && <WarningIcon tone={state === 'over' ? 'critical' : 'waiting'} />}
        {h === null ? (
          <span>90 % des clients coupés à cette heure rétablis : estimation en cours</span>
        ) : (
          <>
            <span>{reached ? '90 % des clients rétablis en' : '90 % des clients coupés à cette heure rétablis dans'}</span>
            <span className="r90-hours">{reached ? '' : '≈ '}{h} h</span>
            {change && (
              <span key={change.id} className={`r90-delta ${change.d < 0 ? 'better' : 'worse'}`}>
                {signedHours(change.d)}
              </span>
            )}
          </>
        )}
        {critical && (
          <span className={`fire ${pinned ? 'pinned' : ''}`}>
            <button className="fire-pill" onClick={() => setPinned(!pinned)} aria-expanded={pinned} aria-describedby="fire-tip">
              FIRE
            </button>
            <span className="fire-tip" id="fire-tip" role="tooltip">
              Objectif 48 h hors d’atteinte avec les équipes actuelles : renfort FIRE à demander.
            </span>
          </span>
        )}
      </div>
      {when !== null && (
        <div className="r90-when">
          {reached ? `atteint ${weekdayFmt.format(when)} vers ${hourOnly(when)}` : `soit ${weekdayFmt.format(when)} vers ${hourOnly(when)}`}
        </div>
      )}
      <div className="r90-gauge" role="img" aria-label={h === null ? 'Estimation en cours' : `${h} heures pour un objectif de 48 heures`}>
        {h !== null && <i className="r90-fill" style={{ width: pct(Math.min(h, TARGET_HOURS)) }} />}
        {h !== null && h > TARGET_HOURS && (
          <i className="r90-overflow" style={{ left: pct(TARGET_HOURS), width: `calc(${pct(h)} - ${pct(TARGET_HOURS)})` }} />
        )}
        <span className="r90-tick" style={{ left: pct(TARGET_HOURS) }}>
          <span>Objectif 48 h</span>
        </span>
      </div>
      {h !== null && (
        <div className="r90-margin">
          {h > TARGET_HOURS ? `Dépassement de ${h - TARGET_HOURS} h` : `${TARGET_HOURS - h} h d’avance sur l’objectif`}
        </div>
      )}
    </section>
  );
}

export function TopBar() {
  const view = useStore((s) => s.view);
  const k = useStore(stepOf);
  const kp = useStore((s) => s.timelines![s.view][k].kpis);
  const copilotOpen = useStore((s) => s.copilotOpen);
  const { openCopilot, closeCopilot } = useStore.getState();
  const teamsTotal = kp.teamsAvailable + kp.teamsBusy + kp.teamsResting;
  const noTeam = kp.teamsAvailable === 0 && kp.incidentsWaiting > 0;

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="brand">
          <Wordmark />
          <span className="tag">Maquette hackathon</span>
        </div>

        <Clock />

        <div className="figures">
          <div className="figure">
            <span className="figure-value">{fmtInt(kp.clientsCut)}</span>
            <span className="figure-label">
              clients coupés <span className="figure-sub">· {fmtInt(kp.clientsRestored)} réalimentés</span>
            </span>
          </div>
          <div className="figure">
            <span className="figure-value">{fmtInt(kp.incidentsWaiting)}</span>
            <span className="figure-label">incidents en attente</span>
          </div>
          <div className={`figure ${noTeam ? 'abnormal' : ''}`}>
            {noTeam && <WarningIcon tone="waiting" />}
            <span className="figure-value">{kp.teamsAvailable}</span>
            <span className="figure-label">
              équipes disponibles <span className="figure-sub">sur {teamsTotal}</span>
            </span>
          </div>
        </div>

        <button className={`pill ${copilotOpen ? 'selected' : ''}`} aria-expanded={copilotOpen} onClick={() => (copilotOpen ? closeCopilot() : openCopilot())}>
          Demander au copilote
        </button>
        {view === 'reference' && <span className="tag view-flag">Vue référence</span>}
      </div>
      <Restore90 />
    </header>
  );
}
