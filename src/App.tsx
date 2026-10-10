import { useEffect } from 'react';
import { CrisisTimeline } from './components/CrisisTimeline';
import { CopilotDock } from './components/CopilotDock';
import { MapView } from './components/MapView';
import { OverrideDrawer } from './components/OverrideDrawer';
import { RecPanel } from './components/RecPanel';
import { Toasts } from './components/Toasts';
import { TopBar } from './components/TopBar';
import { useClock } from './state/clock';
import { useStore } from './state/store';

export function App() {
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  useEffect(() => {
    useStore.getState().init();
  }, []);
  useClock();

  if (status === 'loading') return <div className="splash">Chargement de la crise…</div>;
  if (status === 'error')
    return (
      <div className="splash error">
        <b>Impossible de charger la crise.</b>
        <span>{error}</span>
      </div>
    );

  return (
    <div className="app">
      <TopBar />
      <main className="main">
        <MapView />
        <aside className="side">
          <RecPanel />
          <CopilotDock />
        </aside>
      </main>
      <CrisisTimeline />
      <OverrideDrawer />
      <Toasts />
    </div>
  );
}
