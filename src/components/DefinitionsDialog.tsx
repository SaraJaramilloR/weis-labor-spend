import {useRef, useState} from 'react';
import {ASSUMPTIONS, DECISIONS_BY_STATUS, GLOSSARY, KPI_DEFINITIONS, STATUS_HELP, decisionStatus} from '../config/definitions';
import {Segmented} from './ui';

type Tab = 'kpis' | 'decisions' | 'glossary' | 'assumptions';
const TABS: {id: Tab; label: string}[] = [
  {id: 'kpis', label: 'KPI definitions'},
  {id: 'decisions', label: 'Decisions & status'},
  {id: 'glossary', label: 'Glossary'},
  {id: 'assumptions', label: 'Prototype assumptions'},
];

/** Compact "Definitions & Open Decisions" area: a header button and a dialog, no extra report page. */
export function DefinitionsDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<Tab>('kpis');
  return (
    <>
      <button type="button" className="header-button" onClick={() => ref.current?.showModal()} aria-haspopup="dialog">
        <span aria-hidden="true">ⓘ</span> Definitions &amp; Open Decisions
      </button>
      <dialog ref={ref} className="defs-dialog" aria-labelledby="defs-title">
        <div className="defs-head">
          <h2 id="defs-title">Definitions &amp; Open Decisions</h2>
          <form method="dialog">
            <button type="submit" className="btn-secondary" aria-label="Close definitions">
              Close
            </button>
          </form>
        </div>
        <p className="note">Definitions are working drafts for validation with Weis. Evidence status shows how far each rule is confirmed. All figures in this prototype are synthetic.</p>
        <Segmented label="Definitions section" value={tab} options={TABS} onChange={setTab} size="sm" />
        <div className="defs-body">
          {tab === 'kpis' ? (
            <table aria-label="KPI definitions">
              <thead>
                <tr>
                  {['KPI', 'Definition', 'Calculation', 'Source system', 'Evidence status'].map(h => (
                    <th key={h} scope="col" className="txt">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {KPI_DEFINITIONS.map(d => (
                  <tr key={d.kpi}>
                    <td className="txt">
                      <b>{d.kpi}</b>
                    </td>
                    <td className="txt">{d.definition}</td>
                    <td className="txt">{d.calculation}</td>
                    <td className="txt">{d.source}</td>
                    <td className="txt">
                      <span className={`evidence ev-${d.evidence.toLowerCase().replace(/\s+/g, '-')}`}>{d.evidence}</span>
                      {d.decisions?.length ? <span className="defs-ids"> {d.decisions.join(', ')}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {tab === 'decisions' ? (
            <>
            <p className="defs-intro">Unresolved items first. Status separates business confirmation from source availability and implementation; answered and closed items stay listed for traceability.</p>
            <table aria-label="Decisions and status">
              <thead>
                <tr>
                  {['ID', 'Status', 'Decision', 'How the prototype handles it', 'Owner'].map(h => (
                    <th key={h} scope="col" className="txt">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DECISIONS_BY_STATUS.map(d => (
                  <tr key={d.id} data-status={decisionStatus(d.id)}>
                    <td className="txt">{d.id}</td>
                    <td className="txt">
                      <span className={`status-tag status-${decisionStatus(d.id).split(' ')[0].toLowerCase()}`} title={STATUS_HELP[decisionStatus(d.id)]}>
                        {decisionStatus(d.id)}
                      </span>
                    </td>
                    <td className="txt">
                      <b>{d.title}</b>
                    </td>
                    <td className="txt">{d.handling}</td>
                    <td className="txt">{d.owner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </>
          ) : null}
          {tab === 'glossary' ? (
            <dl className="glossary">
              {GLOSSARY.map(g => (
                <div key={g.term}>
                  <dt>{g.term}</dt>
                  <dd>{g.meaning}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {tab === 'assumptions' ? (
            <ul className="assumptions">
              {ASSUMPTIONS.map(a => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </dialog>
    </>
  );
}
