import { useEffect } from 'react';
import { SPEEDS, endMinutes, focusedRec, useStore } from './store';

/** Drives the crisis clock while playing, and the keyboard shortcuts. */
export function useClock() {
  const playing = useStore((s) => s.playing);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); // clamp after a tab switch
      last = now;
      const s = useStore.getState();
      const end = endMinutes(s);
      const next = s.t + dt * SPEEDS[s.speedIdx].minPerSec;
      if (next >= end) {
        useStore.setState({ t: end });
        s.pause();
        return;
      }
      useStore.setState({ t: next });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, [contenteditable]')) return;
      const s = useStore.getState();
      if (s.overrideRecId) return; // the "Changer d'équipe" panel has its own keys
      if (e.key === 'Escape' && s.copilotOpen) {
        s.closeCopilot();
      } else if (e.code === 'Space') {
        e.preventDefault();
        s.togglePlay();
      } else if (e.key === 'ArrowRight') {
        s.stepBy(1);
      } else if (e.key === 'ArrowLeft') {
        s.stepBy(-1);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        s.moveFocus(e.key === 'ArrowDown' ? 1 : -1);
      } else if (e.key === 'Enter' && !el.closest('button, a, [role=radio], [role=tab]')) {
        const rec = focusedRec(s);
        if (rec && s.view === 'ours') {
          e.preventDefault();
          s.accept(rec);
        }
      } else if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const rec = focusedRec(s);
        if (rec && s.view === 'ours' && rec.alternatives.length) s.openOverride(rec.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
