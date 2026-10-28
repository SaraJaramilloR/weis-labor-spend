import {lazy, Suspense, useEffect, useState} from 'react';
import {isPageId, PAGES, pageById, type PageId} from './app/pages';
import {useReport} from './app/state';
import {DefinitionsDialog} from './components/DefinitionsDialog';
import {FilterBar} from './components/FilterBar';
import {DiscoveryOptions, DiscoveryStrip} from './components/DiscoveryOptions';
import {useLock} from './components/PasswordGate';
import {REPORTING_DATE, REPORTING_WEEK, CURRENT_FY} from './data/calendar';
import {usDate} from './lib/format';

// One chunk per page, loaded on first visit and preloaded on hover or focus.
const loaders = {
  overview: () => import('./pages/OverviewPage'),
  allocation: () => import('./pages/AllocationPage'),
  budget: () => import('./pages/BudgetPage'),
  daily: () => import('./pages/DailyPage'),
  tracking: () => import('./pages/TrackingPage'),
  benchmark: () => import('./pages/BenchmarkPage'),
  people: () => import('./pages/PeoplePage'),
} satisfies Record<PageId, () => Promise<{default: () => JSX.Element}>>;

const PAGE_COMPONENTS = Object.fromEntries(Object.entries(loaders).map(([id, load]) => [id, lazy(load)])) as unknown as Record<PageId, ReturnType<typeof lazy<() => JSX.Element>>>;

const readPage = (): PageId => {
  const p = new URLSearchParams(window.location.search).get('page');
  return isPageId(p) ? p : 'overview';
};

const skeleton = (
  <div className="page-skeleton" aria-busy="true" aria-label="Loading page">
    <div className="skeleton-heading" />
    <div className="visual-card skeleton" />
    <div className="visual-card skeleton tall" />
  </div>
);

export default function App() {
  const [page, setPage] = useState<PageId>(readPage);
  const meta = pageById.get(page)!;
  const lock = useLock();
  const Page = PAGE_COMPONENTS[page];

  // Deep links (?page=…) as in BC2; the browser back button moves between report pages.
  useEffect(() => {
    const onPop = () => setPage(readPage());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    document.title = `${meta.name} · Weis Labor Spend · Prototype preview`;
  }, [meta.name]);

  const go = (id: PageId) => {
    if (id === page) return;
    const url = new URL(window.location.href);
    url.searchParams.set('page', id);
    window.history.pushState(null, '', url);
    setPage(id);
    document.getElementById('report-canvas')?.scrollTo({top: 0});
  };

  return (
    <div className="app">
      <a className="skip-link" href="#report-canvas">
        Skip to report
      </a>
      <header className="topbar">
        <div className="brands">
          <img src="/weis-1-logo-svg-vector.svg" alt="Weis" width={34} height={34} />
          <span translate="no">WEIS · LABOR SPEND</span>
          <span className="preview-badge">Prototype preview · Illustrative data</span>
        </div>
        <div className="top-actions">
          <DefinitionsDialog />
          <DiscoveryOptions />
          <button type="button" className="header-button" onClick={lock} title="End this access session">
            Lock
          </button>
          <img className="brand-partner" src="/wizelinered.svg" alt="Wizeline" width={38} height={28} />
        </div>
      </header>
      <main className="canvas" id="report-canvas" tabIndex={-1}>
        <aside className="demo-disclaimer" role="note">
          Prototype preview · Illustrative data. All figures are synthetic and do not represent Weis results. Items marked <span className="disclaimer-chip">◆ Open</span> depend on business decisions that are still pending.
        </aside>
        <DiscoveryStrip />
        <FilterBar page={meta} />
        <Suspense fallback={skeleton}>
          <Page />
        </Suspense>
      </main>
      <nav className="page-tabs" aria-label="Report pages">
        {PAGES.map(p => {
          const preload = () => void loaders[p.id]();
          return (
            <button key={p.id} type="button" className={p.id === page ? 'active' : undefined} aria-current={p.id === page ? 'page' : undefined} onClick={() => go(p.id)} onMouseEnter={preload} onFocus={preload}>
              {p.name}
            </button>
          );
        })}
      </nav>
      <StatusBar />
    </div>
  );
}

function StatusBar() {
  const {pending} = useReport();
  return (
    <footer className="status">
      <span>© 2026 Wizeline · Prototype developed for Weis Markets</span>
      <span role="status" aria-live="polite">
        {pending ? 'Recalculating…' : `Synthetic data · through ${usDate(REPORTING_DATE)} (FY${CURRENT_FY} W${REPORTING_WEEK})`}
      </span>
      <span>4-4-5 calendar · UC1 / Ops reference, UC5 confirmation pending</span>
    </footer>
  );
}
