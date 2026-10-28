import {createContext, useCallback, useContext, useMemo, useState, useTransition, type ReactNode} from 'react';
import {DEFAULT_FILTERS, sanitizeFilters, type AccessRole, type Filters} from '../lib/filters';

type Patch = Partial<Filters> | ((prev: Filters) => Partial<Filters>);

type ReportState = {
  filters: Filters;
  role: AccessRole;
  pending: boolean;
  update: (patch: Patch) => void;
  reset: () => void;
  setRole: (role: AccessRole) => void;
};

const ReportContext = createContext<ReportState | null>(null);

/** Filters and simulated access. Updates run in a transition so slicers stay responsive while visuals recalculate. */
export function ReportProvider({children}: {children: ReactNode}) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [role, setRoleState] = useState<AccessRole>({kind: 'regional'});
  const [pending, startTransition] = useTransition();

  const update = useCallback(
    (patch: Patch) =>
      startTransition(() =>
        setFilters(prev => {
          const p = typeof patch === 'function' ? patch(prev) : patch;
          return sanitizeFilters({...prev, ...p}, prev, role);
        }),
      ),
    [role],
  );
  // Reset keeps the comparison reference, benchmark method and simulated role (they are view settings, not filters).
  const reset = useCallback(() => startTransition(() => setFilters(prev => ({...DEFAULT_FILTERS, reference: prev.reference, benchmark: prev.benchmark}))), []);
  const setRole = useCallback((next: AccessRole) => {
    setRoleState(next);
    startTransition(() => setFilters(prev => sanitizeFilters({...prev, region: 'All', district: 'All', store: 'All'}, prev, next)));
  }, []);

  const value = useMemo(() => ({filters, role, pending, update, reset, setRole}), [filters, role, pending, update, reset, setRole]);
  return <ReportContext.Provider value={value}>{children}</ReportContext.Provider>;
}

// The hook lives next to its provider on purpose; fast refresh of this file reloads the page.
// eslint-disable-next-line react-refresh/only-export-components
export function useReport(): ReportState {
  const ctx = useContext(ReportContext);
  if (!ctx) throw new Error('useReport must be used inside ReportProvider');
  return ctx;
}
