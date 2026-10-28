import {useEffect, useId, useRef, useState, type ReactNode} from 'react';

type Panel = 'filters' | 'menu' | null;

/**
 * Power BI style visual container (BC3 pattern): title, hover tools with "Filters on this visual",
 * focus mode and a "More options" menu. Actions are composed in through `menu`.
 */
export function VisualCard({title, children, filters, menu, actions, className = '', subtitle}: {title: string; children: ReactNode; filters?: ReactNode; menu?: ReactNode; actions?: ReactNode; className?: string; subtitle?: ReactNode}) {
  const [focused, setFocused] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const titleId = useId();

  useEffect(() => {
    if (!focused && !panel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (panel) setPanel(null);
      else setFocused(false);
    };
    const onPress = (e: PointerEvent) => {
      if (panel && toolsRef.current && !toolsRef.current.contains(e.target as Node)) setPanel(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPress);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPress);
    };
  }, [focused, panel]);

  const toggle = (next: Exclude<Panel, null>) => setPanel(p => (p === next ? null : next));

  return (
    <>
      {focused ? <div className="focus-backdrop" onClick={() => setFocused(false)} aria-hidden="true" /> : null}
      <section className={`visual-card${focused ? ' visual-focused' : ''} ${className}`} aria-labelledby={titleId}>
        <div className="visual-head">
          <h2 id={titleId}>{title}</h2>
          {actions ? <div className="visual-actions">{actions}</div> : null}
        </div>
        {subtitle ? <p className="visual-subtitle">{subtitle}</p> : null}
        <div className={`visual-tools${panel ? ' open' : ''}`} ref={toolsRef} role="toolbar" aria-label={`${title} tools`}>
          <button type="button" title="Filters on this visual" aria-label="Filters on this visual" aria-expanded={panel === 'filters'} aria-controls={panelId} onClick={() => toggle('filters')}>
            ▽
          </button>
          <button type="button" onClick={() => setFocused(x => !x)} title={focused ? 'Exit focus mode' : 'Focus mode'} aria-label={focused ? 'Exit focus mode' : 'Focus mode'} aria-pressed={focused}>
            {focused ? '↙' : '□'}
          </button>
          <button type="button" title="More options" aria-label="More options" aria-haspopup="menu" aria-expanded={panel === 'menu'} aria-controls={panelId} onClick={() => toggle('menu')}>
            •••
          </button>
          {panel === 'filters' ? (
            <div className="visual-popover" id={panelId} role="dialog" aria-label="Filters on this visual">
              <strong>Filters on this visual</strong>
              <div className="popover-body">{filters ?? 'No filters applied.'}</div>
            </div>
          ) : null}
          {panel === 'menu' ? (
            <div className="visual-popover visual-menu" id={panelId} role="menu" aria-label="More options" onClick={() => setPanel(null)}>
              {menu ?? <span className="visual-menu-empty">No actions for this visual</span>}
            </div>
          ) : null}
        </div>
        {children}
      </section>
    </>
  );
}
