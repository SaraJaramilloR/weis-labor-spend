---
name: uc5-prototype-validation
description: Validate the BC5 Labor Spend prototype before a demo or handoff - requirements coverage, calculations, filters, navigation, visual consistency, English-only UI and labeling of unresolved rules. Use when asked to "validate", "QA the prototype", "check before the demo", "run checks" or "verify coverage".
---

# UC5 Prototype Validation

Report only the checks you actually ran, with their real output. If a check could not run, say so.

## 1. Automated
```bash
npm run typecheck && npm run lint && npm run test && npm run build
```
Record pass or fail counts. Do not skip or weaken failing tests.

## 2. Requirements coverage
1. Every metric (R2–R41), filter (R42–R61) and view (R62–R67) in `docs/requirements-map.md` has an implementation status, and every Implemented item is reachable in the UI.
2. All six documented views are represented across the seven pages.
3. Each D-ID referenced in the map exists in `docs/decision-register.md`.

## 3. Calculations
- Ratio KPIs reconcile: recompute IPLH, Labor Rate, AHR, Basket and AIV from the totals shown.
- Department rows sum to the total, stores to districts, districts to regions, regions to the chain.
- Clean Sales excludes Fuel, Pharmacy and Front End. OT excludes RX.
- No duplicated labor adjustments (Starbucks and salaried are included once).
- Inflation does not change when labor inputs change.
- Headcount uses snapshots and is never summed over time.
- Zero denominators show n/a. Rate differences show pp.

## 4. Filters and interactions
- The same filter state gives consistent numbers on cards, charts and tables of a page.
- Reset restores the defaults. Simulated access limits the location options and is labeled "Simulated access".
- Sorting, search, tooltips, focus mode, detail selection and CSV export all work. Exports contain filtered synthetic data only.
- Empty states appear for impossible combinations.

## 5. Visual and language
- Take headless Chrome screenshots of each `?page=<id>` at 1440×900 and 1100×800. Check for clipped labels, overlaps and console errors.
- English throughout, including tooltips, exports and empty states. Grep `src/` for Spanish words.
- "Prototype preview · Illustrative data" is visible. Open-decision chips appear on the affected visuals. There are no 0.5 % or 2 % traffic lights, and no label calls the calendar the official Weis fiscal calendar.

## 6. Security and data hygiene
- Nothing under `references/` is imported or copied into `public/` or the bundle. There are no passwords or secrets in the repo.
- No `dangerouslySetInnerHTML` and no `eval`. CSV export neutralizes formula injection.
