# BC5 / UC5 — Labor Spend Prototype (Weis Markets)

## Purpose

Interactive discovery prototype for Weis Markets Use Case 5, Labor Spend. It lets Store Ops, District and Regional managers review labor spend, labor hours, productivity, overtime, call-offs and people metrics (headcount, hires, terminations, turnover, retention) against budget references and prior year, by store and department.

It is a demonstration tool, not a production system. The final solution will be built in **Power BI**. Every interaction must be reproducible in Power BI (see `docs/powerbi-handoff.md`). Do not add predictive staffing, writeback, scenario planning or production integrations. Do not deploy unless Sara explicitly asks.

The central question: **"Where is labor spend and labor hours above or below the reference, and how does that relate to sales and productivity?"** Underspend is not automatically good, and overspend is not automatically bad.

## Sources of requirements (read-only)

| File | Use |
| --- | --- |
| `references/UC5_KPIs Definitions and Mapping.xlsx` | Main scope. Sheets: `UC #5 - User Stories`, `UC #5 - Labor Spend` (metrics R2–R41, filters R42–R61, views R62–R67), `UC #5 - Recon Map` (empty), `UC #5 - Open Questions`, `Glossary` |
| `references/UC5 Labor Spend_ Technical Requirements Meeting_10.27.26.docx` | Meeting transcript, Oct 27, 2026 |
| `references/technical-session-recap.md` | Confirmed clarifications and open items |
| `references/ops/Reports/Report_OPS101`–`OPS111*.xlsx`, `Report_OPS300_TL.xlsx` | Legacy calculations and layouts (OPS300 Total Loss is out of UC5 scope) |
| `references/ops/Reports/VBA_Runner.xlsm` | `Dates` sheet = OPS reporting calendar. **Never run macros.** |
| `references/design/BC3/` | Local BC3 code, visual reference only |

Not yet available: OPS 200 / OPS 201, the Workday source files (`Source_Terminations_T`, `Source_New_Hires_T`, `Source_Census_NoWage_T`), the MDoc and the geography master lookup.

Rules:
- Read references during development only. Never copy real values, store numbers, names or employee data into `src/` or `public/`. Never import anything from `references/` into the bundle.
- Never modify `references/`, BC3 or BC2.
- Read Excel files with `openpyxl` (`read_only=True, data_only=True`) in a scratch virtual environment. Do not execute VBA.

## Language

- All client-facing UI is in **English**: navigation, titles, KPIs, filters, charts, tooltips, tables, buttons, messages, glossary, open decisions and exports.
- CLAUDE.md, skills and `docs/` are in English.
- Conversation with Sara in Claude Code is in **Spanish**.
- Say "time frame", not "period", unless you mean a calendar period (P01–P12). Michael Zettlemoyer asked for this in the meeting.

## Visual references, in priority order

1. Current deployed BC3 (weekly-sales-forecast-vs-budget).
2. Current deployed BC2 (profitability-tracking).
3. Local BC3 code in `references/design/BC3/`, after comparing it with the live experience.
4. The old BC3 CLAUDE.md, as historical context only. It is outdated.

Live BC3 and BC2 were inspected on Oct 27, 2026 with headless Chrome (the password is typed at runtime from an environment variable and never stored). A live interface shows appearance and interaction only; formulas are reused only from source code or documents (see `docs/design-reference.md`). Demo passwords must never be written to code, docs, env files or commits.

## Workbook baseline and prior use cases

- The workbook is the baseline. Rows typed **Views** are the required pages; each view Definition lists its KPIs and filters; **Metric** and **Filters** rows define them. A KPI shown on another page does not satisfy a view that requires it.
- **Prior Use Case**: UC1 = BC3 (Weekly Sales / Forecast vs Budget, `references/design/BC3/`); UC2 = BC2 (Profitability Tracking, live only, no code in the workspace). Reuse their definitions and components; for UC2 formulas, record the missing source instead of guessing.
- Reused from UC1: Gross Sales / LY / YoY definitions and time modes (`To Date`, `Rolling`, `Fiscal Calendar`, `Custom`). The 4-4-5 calendar matches UC1 and the Ops date table (implementation consistency, not a UC5 approval, D18). The UC1 five-full-quarter ID rule is used only as a reference for an illustrative eligibility (Ops eligibility open, D07).
- Before raising an SME question, check the source references: the Ops 100 data model in the OPS workbooks (pivot caches list the `Warehouse` columns; `xl/model/item.data` holds DAX fragments) and OPS110 / OPS108 sheets. Separate prototype data-model limitations from source limitations and business definitions.
- Budget is the primary comparison. Exploratory settings (simulated access, simple benchmark method, MDoc / LY comparison) live only in the header `Discovery options`.
- Additions beyond the workbook are listed in `docs/prototype-validation-map.md` section 5. Do not expand or remove them without Sara's decision.

## Technology

React 18.3.1, Vite 5, TypeScript 5.7 (strict), Recharts 2.15.1, Vitest, ESLint 9. Fonts are self-hosted through `@fontsource` (no CDN). All versions are pinned exactly in `package.json`, and dependencies come only from the official npm registry. Generate an SBOM before sharing a build: `npx @cyclonedx/cyclonedx-npm --output-file sbom.json`.

Keep these layers separate: requirements metadata (`src/config`), data generation (`src/data`), calculations and filter logic (`src/lib`), and presentation (`src/components`, `src/visuals`, `src/pages`).

## Calculation rules (centralized in `src/lib`)

- IPLH = SUM(Items) / SUM(Labor Hours)
- Labor Rate = SUM(Labor Pay) / SUM(Sales). The sales basis is Total Sales, per the Ops 100 draft. Do not assume Clean Sales (D19).
- AHR = SUM(Labor Pay) / SUM(Labor Hours)
- Basket Size = SUM(Items) / SUM(Transactions)
- AIV = SUM(Sales) / SUM(Items). Inflation (AIV % vs LY) is tracked separately and never adjusts labor metrics.
- YoY change = Current − Prior Year. YoY % = (Current − Prior Year) / Prior Year.
- Ratios are always ratios of compatible totals over the same population, scope and time frame. Never average store percentages by default.
- A zero or missing denominator returns `null`, displayed as "n/a". It is never shown as 0 %.
- Differences between rates are shown in percentage points (pp).
- Headcount is a snapshot. Never sum daily or weekly snapshots. Average headcount = (Beginning + Ending) / 2 (draft).
- Transactions are not unique customers. Ops 100 uses transaction count as "customer count"; label it accordingly.
- FT / PT ratio is based on headcount, not hours.
- Hours variance is not the absence rate. "Hours vs Projection" is the Ops 100 call-off proxy and stays a draft (D05).
- Clean Sales = Total excluding Fuel, Pharmacy and Front End (meeting-confirmed). It conflicts with the OPS101 note (D16).
- Overtime measures exclude Pharmacy (RX).
- Starbucks and salaried-manager components are included at source. Never add legacy manual adjustments.
- Keep Budget (SO 1007), MDoc, Projection (SO 1006) and Prior Year distinct.
- No 0.5 % OT or 2 % call-off traffic lights (D03, D05).

## Synthetic data

- Deterministic mulberry32 PRNG with a fixed seed. The same figures appear on every run and in every test.
- 60 stores, 3 regions, 12 districts, illustrative states and "Market Area" geography, and departments modeled on the Ops department list. Some stores have no Fuel, Pharmacy or Starbucks, and two new stores are excluded by the illustrative ID eligibility (UC1 rule as reference). The associate roster is sized from department hours by employment type; department transactions overlap and are never summed to the store total.
- Calendar: 4-4-5 calendar as implemented in UC1 (BC3 `lib/fiscal.ts`) and the OPS `VBA_Runner.xlsm › Dates` table; UC5 confirmation pending (D18). Weeks run Sunday–Saturday, 52 weeks, P3 / P6 / P9 / P11 have five weeks. 53-week years are not modeled (D18). Data covers FY2025 W01 → FY2026 W43 (week ending 2026-10-24). LY = same week number, 364 days earlier.
- Grains: weekly store × department labor and sales facts; daily facts for recent weeks that reconcile to the weekly totals; store × week transactions; target references (Budget, MDoc, Projection); an illustrative associate roster used only for aggregated people snapshots and hire/termination events; attendance counts; calendar and organization dimensions.
- No associate-level detail is shown (D10). Anything synthetic at item or associate level must be labeled illustrative.
- The UI shows "Prototype preview · Illustrative data".

## Open decisions

All open decisions are in `docs/decision-register.md` (D01–D32). The view-by-view equivalence is in `docs/excel-to-prototype-equivalence.md`; the item inventory and additions are in `docs/prototype-validation-map.md`. Never turn a draft formula or open question into an approved rule. Mark affected visuals discreetly, put details in the "Definitions & Open Decisions" dialog, and show a pending state when a missing definition prevents a meaningful number. Role switching is **simulated access**, not security.

## Skills

Project skills (`.claude/skills/`):
- `uc5-requirements-analysis`: workbook extraction and traceability.
- `weis-dashboard-design`: BC3/BC2 continuity, KPI hierarchy, accessibility, Power BI feasibility.
- `uc5-metrics-and-mock-data`: synthetic data, formulas, grains.
- `uc5-prototype-validation`: coverage, calculations, filters, English UI, open-rule labeling.

Reused: `vercel-react-best-practices`, `vercel-composition-patterns`, `web-design-guidelines`. Do not overwrite existing skills, and do not use deployment skills (`deploy-to-vercel`, `vercel-cli-with-tokens`, `vercel-optimize`).

## Validation

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Interaction check: `npm run build && npm run preview -- --port 5176`, then `node scripts/check-interactions.mjs http://localhost:5176/` (headless Chrome over CDP: navigation, filters, reset, reference, sorting, search, drill, dialogs, simulated access, benchmark toggle, console errors).

Visual check: headless Chrome screenshots of each page with the `?page=<id>` deep link at desktop (1440 px) and smaller (1024 px and 768 px) widths. Check for clipped labels and broken layouts. Report only checks you actually ran.

Docs to keep current: `docs/requirements-map.md`, `docs/decision-register.md`, `docs/design-reference.md`, `docs/powerbi-handoff.md`, `docs/demo-walkthrough.md`, `README.md`.
