# Weis · Labor Spend (BC5 / UC5) — Interactive prototype

Discovery prototype for Weis Markets Use Case 5, Labor Spend. It shows labor spend, labor hours, productivity, overtime, call-offs and people metrics against budget references and prior year, by region, district, store and department. The final solution will be built in Power BI; this prototype exists to validate content, hierarchy and interactions with the client.

> **Prototype preview · Illustrative data.** Every figure, store, district, market area and recruiter is synthetic and deterministic. Nothing here represents Weis results. Items marked ◆ Open depend on business decisions that are still pending.

## Run locally

Requires Node 22 or later.

```bash
npm install
npm run dev          # http://localhost:5173
```

Production build and local preview:

```bash
npm run build
npm run preview      # http://localhost:4173
```

Deep links open a page directly: `?page=overview`, `allocation`, `budget`, `daily`, `tracking`, `benchmark`, `people`.

## Demo access screen

The report opens behind a demo password screen (same design and behavior as BC3). **It is a demo barrier, not security.**

- No password is stored in the repository and there is no default password. Without configuration the screen fails closed ("Access is not configured").
- Only a salted SHA-256 hash is used, through `VITE_ACCESS_PASSWORD_HASH`. Like every `VITE_*` variable, it is embedded in the public JavaScript bundle at build time, so it is **not a secret**: the plain password is not in the bundle, but anyone can read the hash and try to guess a weak password offline. The script accepts 7 to 200 characters; a short or common password is easy to guess from the hash, which is acceptable only because this is a demo barrier in front of synthetic data. Share it outside the repository.
- Access lasts for the browser tab session; the header **Lock** button ends it. Changing the password ends existing sessions.

Set or change the password locally (prompted twice, hidden; only the hash is written to the git-ignored `.env.local`):

```bash
npm run set-access-password
npm run dev
```

For Vercel, add the same hash as the `VITE_ACCESS_PASSWORD_HASH` environment variable (Production) and redeploy. Do not paste the password into Vercel, chat or commits.

## Checks

```bash
npm run typecheck
npm run lint
npm run test                                   # formulas, reconciliation, exclusions, snapshots, filters, CSV, content guards
npm run build && npm run preview -- --port 5176
node scripts/check-interactions.mjs http://localhost:5176/   # headless Chrome interaction check (build without the gate hash, or log in first)
ACCESS_TEST_PASSWORD=… node scripts/check-access-gate.mjs <url>   # demo access screen, direct links and the six views
```

## Pages

| Page | Workbook view | What it answers |
| --- | --- | --- |
| Labor Overview (landing, design proposal — not a workbook view) | Operational overview | Where labor spend and hours sit against the selected reference, with labor rate, IPLH, AHR, overtime, hours vs projection and sales context |
| Store Ops Labor Allocation | Store Ops Labor Allocation (US1) | Region › District › Store › Department sales (vs Budget), items (vs Budget), customers and basket (TY / LY), hours (vs Budget and MDoc), spend, productivity and overtime; AIV and estimated inflation shown separately, with a 52-week history by department |
| Headcount & Hours vs Budget | Headcount & Hours vs Budget (US4) | Region › District › Store hours, spend, labor rate and AHR vs Budget, overtime and current headcount; Overtime Rate (% of payroll, excl. Pharmacy); hours vs Budget or MDoc; sortable store comparison of labor rate (pp), spend and hours variance |
| Daily Labor vs Budget | Daily Labor vs Budget (US5) | Day-level hours (vs Budget or MDoc) and spend (vs Budget) for the last 8 weeks, by day, store and department |
| Turnover, Overtime & Call-off Tracking | Turnover, Overtime & Call-off Tracking (US2) | People and time-and-attendance KPIs with a chain average next to each KPI; stores expand to departments |
| Turnover & Retention Benchmark | Turnover & Retention Benchmark (US3) | Turnover, retention, hires, terminations and headcount by chain, region, district and store, over time for any selected scope, versus chain and region benchmarks |
| People Reporting (Filterable Ops 200) | People Reporting · Filterable Ops 200 | Headcount, hires, terminations, turnover and FT / PT by recruiter, age, tenure, position, location |

The header has **Definitions & Open Decisions** (KPI definitions, open decisions, glossary, assumptions) and **Discovery options** (exploratory, off by default): simulated access, the simple benchmark method and a secondary MDoc / prior-year comparison. Budget stays the primary comparison. Simulated access filters data in the browser; it is not security.

## Project structure

```
src/config/       client-facing definitions, glossary, open decisions
src/data/         calendar, organization, synthetic facts and associate records
src/lib/          formulas (metrics.ts), rollups, people metrics, filters, CSV, formatting
src/components/   app shell pieces, filter bar, KPI card, VisualCard, DataTable, chips, dialogs
src/visuals/      chart tokens and tooltips
src/pages/        one file per report page
docs/             requirements map, decision register, design reference, Power BI handoff, demo walkthrough
references/       client files, read during development only (never bundled, never modified)
```

## Documentation

- [docs/excel-to-prototype-equivalence.md](docs/excel-to-prototype-equivalence.md): view-by-view Excel-to-prototype equivalence with click-by-click validation.
- [docs/prototype-validation-map.md](docs/prototype-validation-map.md): item inventory, item inventory, prior-use-case reuse and additions for review.
- [docs/requirements-map.md](docs/requirements-map.md): original row-by-row extraction.
- [docs/decision-register.md](docs/decision-register.md): confirmed clarifications and open decisions D01–D28.
- [docs/design-reference.md](docs/design-reference.md): what was carried over from BC3 and what was not inspected.
- [docs/powerbi-handoff.md](docs/powerbi-handoff.md): how each interaction maps to Power BI.
- [docs/demo-walkthrough.md](docs/demo-walkthrough.md): a short client demo script.

## Security notes

- No secrets, passwords or API keys are in the code. Do not add demo passwords to code or docs.
- `index.html` sets a restrictive Content-Security-Policy; fonts are self-hosted (no CDN).
- CSV export writes only the filtered synthetic rows and neutralizes spreadsheet formulas.
- Filter values are validated before they reach state (`sanitizeFilters`).
- Dependencies are pinned and come from the official npm registry. Generate an SBOM before sharing a build: `npx @cyclonedx/cyclonedx-npm --output-file sbom.json`.
- `vercel.json` sets security headers (CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS).
- The demo access screen is not security. Real protection needs platform-level or server-side authentication.
