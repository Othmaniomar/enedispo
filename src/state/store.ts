import { create } from 'zustand';
import type { CrisisMeta, Recommendation, Snapshot, StrategyId } from '../data/contract';
import { source, type DecisionInput, type Timelines } from '../data/source';
import { fmtDelta } from '../lib/format';

export type Toast = { id: number; tone: 'ok' | 'info' | 'warn'; title: string; body?: string };

/** Playback speeds: ×1 = one minute of crisis per second. */
export const SPEEDS = [
  { label: '×1', minPerSec: 1, title: '1 s = 1 min de crise' },
  { label: '×10', minPerSec: 10, title: '1 s = 10 min de crise' },
  { label: '×60', minPerSec: 60, title: '1 s = 1 h de crise' },
] as const;

export type CopilotRequest = { id: number; question: string; recId?: string };

type State = {
  status: 'loading' | 'ready' | 'error';
  error?: string;
  meta?: CrisisMeta;
  timelines?: Timelines;

  t: number; // minutes since snapshot 0 (continuous)
  playing: boolean;
  speedIdx: number;
  view: StrategyId;

  hoveredRecId?: string;
  hoverFrom?: 'card' | 'map';
  /** The one recommendation in focus (defaults to the first of the queue). */
  focusedRecId?: string;
  copilotOpen: boolean;
  copilotRequest?: CopilotRequest;
  overrideRecId?: string;
  previewTeamId?: string;
  busy: boolean;
  toasts: Toast[];

  init(): Promise<void>;
  setT(t: number): void;
  play(): void;
  pause(): void;
  togglePlay(): void;
  stepBy(n: number): void;
  setSpeed(i: number): void;
  setView(v: StrategyId): void;
  hoverRec(id: string | undefined, from?: 'card' | 'map'): void;
  focusRec(id: string | undefined): void;
  moveFocus(delta: number): void;
  openCopilot(question?: string, recId?: string): void;
  closeCopilot(): void;
  openOverride(id: string | undefined): void;
  setPreviewTeam(id: string | undefined): void;
  accept(rec: Recommendation): Promise<void>;
  override(rec: Recommendation, teamId: string, reason?: string): Promise<void>;
  resetDecisions(): Promise<void>;
  toast(t: Omit<Toast, 'id'>): void;
  dismissToast(id: number): void;
};

let toastSeq = 1;

export const useStore = create<State>((set, get) => ({
  status: 'loading',
  t: 0,
  playing: false,
  speedIdx: 2,
  view: 'ours',
  busy: false,
  toasts: [],
  copilotOpen: false,

  async init() {
    try {
      const [meta, timelines] = await Promise.all([source.loadMeta(), source.loadTimelines()]);
      // Start on the first step with incidents, so the screen is never empty.
      const first = timelines.ours.findIndex((s) => s.incidents.length > 0);
      set({ meta, timelines, status: 'ready', t: Math.max(0, first) * meta.stepMinutes });
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },

  setT(t) {
    set({ t: Math.max(0, Math.min(endMinutes(get()), t)) });
  },
  play() {
    const s = get();
    if (s.t >= endMinutes(s)) set({ t: 0 });
    set({ playing: true, overrideRecId: undefined, previewTeamId: undefined });
  },
  pause() {
    const s = get();
    const step = s.meta?.stepMinutes ?? 30;
    // Snap to the step so the recommendations on screen match the clock.
    set({ playing: false, t: Math.floor(s.t / step + 1e-6) * step });
  },
  togglePlay() {
    if (get().playing) get().pause();
    else get().play();
  },
  stepBy(n) {
    const s = get();
    const step = s.meta?.stepMinutes ?? 30;
    const k = Math.floor(s.t / step + 1e-6) + n;
    set({ playing: false, t: Math.max(0, Math.min(endMinutes(s), k * step)) });
  },
  setSpeed(i) {
    set({ speedIdx: i });
  },
  setView(v) {
    set({ view: v, overrideRecId: undefined, previewTeamId: undefined, hoveredRecId: undefined });
  },
  hoverRec(id, from) {
    if (get().hoveredRecId !== id) set({ hoveredRecId: id, hoverFrom: from });
  },
  focusRec(id) {
    if (get().focusedRecId !== id) set({ focusedRecId: id });
  },
  moveFocus(delta) {
    const s = get();
    const recs = currentRecs(s);
    if (!recs.length) return;
    const i = Math.max(0, recs.findIndex((r) => r.id === focusedRec(s)?.id));
    const next = recs[Math.max(0, Math.min(recs.length - 1, i + delta))];
    set({ focusedRecId: next.id });
  },
  openCopilot(question, recId) {
    set({ copilotOpen: true, copilotRequest: question ? { id: copilotSeq++, question, recId } : get().copilotRequest });
  },
  closeCopilot() {
    set({ copilotOpen: false });
  },
  openOverride(id) {
    if (id) get().pause();
    set({ overrideRecId: id, previewTeamId: undefined });
  },
  setPreviewTeam(id) {
    if (get().previewTeamId !== id) set({ previewTeamId: id });
  },

  async accept(rec) {
    const s = get();
    if (s.busy) return;
    set({ busy: true });
    try {
      const idx = currentRecs(s).findIndex((r) => r.id === rec.id);
      const timelines = await source.accept(decisionInput(s, rec, rec.teamId));
      set({ timelines });
      keepFocusAt(idx);
      const team = teamLabel(s, rec.teamId);
      s.toast({ tone: 'ok', title: `Validée : ${team} → Poste ${incidentName(s, rec.incidentId)}` });
    } finally {
      set({ busy: false, hoveredRecId: undefined });
    }
  },

  async override(rec, teamId, reason) {
    const s = get();
    if (s.busy) return;
    set({ busy: true });
    try {
      const est = rec.alternatives.find((a) => a.teamId === teamId)?.deltaScore ?? 0;
      const idx = currentRecs(s).findIndex((r) => r.id === rec.id);
      const timelines = await source.override({ ...decisionInput(s, rec, teamId), reason });
      set({ timelines, overrideRecId: undefined, previewTeamId: undefined, hoveredRecId: undefined });
      keepFocusAt(idx);
      get().toast({
        tone: 'info',
        title: `Modifiée : ${teamLabel(s, teamId)} → Poste ${incidentName(s, rec.incidentId)}`,
        body: `Coût estimé ${fmtDelta(est)} clients·h`,
      });
    } finally {
      set({ busy: false });
    }
  },

  async resetDecisions() {
    set({ busy: true });
    try {
      const timelines = await source.reset();
      set({ timelines, overrideRecId: undefined });
      get().toast({ tone: 'info', title: 'Décisions annulées' });
    } finally {
      set({ busy: false });
    }
  },

  toast(t) {
    const id = toastSeq++;
    set({ toasts: [...get().toasts.slice(-2), { ...t, id }] });
    setTimeout(() => get().dismissToast(id), 6000);
  },
  dismissToast(id) {
    set({ toasts: get().toasts.filter((x) => x.id !== id) });
  },
}));

// ---- selectors & helpers ------------------------------------------------

export function endMinutes(s: Pick<State, 'timelines' | 'meta'>): number {
  if (!s.timelines || !s.meta) return 0;
  return (s.timelines.ours.length - 1) * s.meta.stepMinutes;
}

export const stepOf = (s: Pick<State, 't' | 'meta' | 'timelines'>) => {
  if (!s.meta || !s.timelines) return 0;
  return Math.min(s.timelines.ours.length - 1, Math.floor(s.t / s.meta.stepMinutes + 1e-6));
};

/** Snapshot currently displayed (strategy shown on the map). */
export function useSnapshot(): Snapshot | undefined {
  return useStore((s) => (s.timelines ? s.timelines[s.view][stepOf(s)] : undefined));
}

/** Snapshot of our strategy (decisions apply to it). */
export function useOursSnapshot(): Snapshot | undefined {
  return useStore((s) => (s.timelines ? s.timelines.ours[stepOf(s)] : undefined));
}

export const useStep = () => useStore(stepOf);

let copilotSeq = 1;

const currentRecs = (s: State) => (s.timelines ? s.timelines.ours[stepOf(s)].recommendations : []);

/** The focused recommendation, or the first of the queue when the focus is gone. */
export function focusedRec(s: State): Recommendation | undefined {
  const recs = currentRecs(s);
  return recs.find((r) => r.id === s.focusedRecId) ?? recs[0];
}
export const useFocusedRec = () => useStore((s) => (s.view === 'ours' ? focusedRec(s) : undefined));

/** After a decision, the recommendation that slid into the same place takes the focus. */
function keepFocusAt(idx: number) {
  const recs = currentRecs(useStore.getState());
  const next = recs[Math.min(Math.max(0, idx), recs.length - 1)];
  useStore.setState({ focusedRecId: next?.id });
}

function decisionInput(s: State, rec: Recommendation, teamId: string): DecisionInput {
  return {
    step: stepOf(s),
    recommendationId: rec.id,
    incidentId: rec.incidentId,
    teamId,
    recommendedTeamId: rec.teamId,
  };
}

function teamLabel(s: State, id: string) {
  return s.timelines?.ours[stepOf(s)].teams.find((t) => t.id === id)?.label ?? id;
}
function incidentName(s: State, id: string) {
  return s.timelines?.ours[stepOf(s)].incidents.find((i) => i.id === id)?.commune ?? id;
}

if (import.meta.env.DEV) (window as unknown as { __store?: unknown }).__store = useStore;
