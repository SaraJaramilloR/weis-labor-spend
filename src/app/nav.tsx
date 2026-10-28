import {createContext, useContext, type MouseEvent, type ReactNode} from 'react';
import {pageById, type PageId} from './pages';

/** In-app page navigation (keeps filters; updates ?page= and history). Provided by App. */
// eslint-disable-next-line react-refresh/only-export-components -- context beside its link component
export const NavContext = createContext<(id: PageId) => void>(() => undefined);

/** Discreet link to another report page. A real link (?page=…), so it also works with a new tab. */
export function PageLink({to, children}: {to: PageId; children?: ReactNode}) {
  const go = useContext(NavContext);
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    go(to);
  };
  return (
    <a className="page-link" href={`?page=${to}`} onClick={onClick}>
      {children ?? pageById.get(to)?.name}
    </a>
  );
}
