---
name: weis-dashboard-design
description: Design or review BC5 Labor Spend dashboard pages so they stay visually continuous with the Weis BC3 / BC2 prototypes, with clear KPI hierarchy, accessible interactions and Power BI-feasible patterns. Use when asked to "design a page", "add a visual", "restyle", "fix the layout", "check BC3 consistency" or "make this Power BI friendly".
---

# Weis Dashboard Design (BC5)

## Reference priority
1. Live BC3, then live BC2. Never store their demo passwords anywhere. If you cannot open them, ask Sara for screenshots and say so.
2. Local BC3 code in `references/design/BC3/` (read-only), compared against the live version.
3. The old BC3 CLAUDE.md, as history only.
See `docs/design-reference.md` for the tokens and patterns already adopted.

## Shell, keep it consistent
1. Dark 52 px top bar: Weis logo, report title, a "Definitions & Open Decisions" button, the simulated-access selector and the Wizeline logo.
2. A one-line amber notice: "Prototype preview · Illustrative data".
3. A sticky filter bar with a Time row, a Location row (Region → District → Store) and Department, plus "More filters" for secondary dimensions and a working "Reset".
4. Power BI-style report page tabs at the bottom, a 26 px status bar, and `?page=<id>` deep links.
5. Every chart and table sits in a `VisualCard` (title, "Filters on this visual", focus mode, More options with CSV export where useful).

## KPI hierarchy
1. Lead with labor: Labor Spend vs reference, Labor Hours vs reference, Labor Rate, IPLH and AHR. Show sales context next to them. Show Total Sales and Clean Sales with **equal weight**; neither is the lead number (D08).
2. Show the comparison reference (Budget / MDoc / Prior Year) on every comparison card.
3. Use percentage points (pp) for rate differences. Use n/a for zero denominators.
4. Labor variance tones are neutral, with text descriptors ("Above budget", "Below budget"). Do not color underspend green or overspend red without sales and productivity context. Never rely on color alone.
5. No traffic lights for the 0.5 % OT or 2 % call-off criteria (D03, D05).
6. Trends come before detail: KPI cards, then a weekly trend, then a store or department table with sorting and search.

## Open decisions in the UI
- Mark affected visuals with a small amber "Open decision" chip and a tooltip in plain English. Do not show workbook row numbers in the UI.
- Show a pending state card when a missing definition makes the number meaningless.
- Label role switching "Simulated access". It is not security.

## Accessibility checklist
- Keyboard reachable controls with a visible focus ring (#26bdfb). Tooltips open on focus as well as hover.
- `aria-label` on charts and tables, `scope="col"` headers, `aria-sort` on sortable headers, and a live status region for recalculation.
- Text contrast meets AA. Use tabular numbers. Respect `prefers-reduced-motion`.
- Meaningful empty states ("No stores match these filters" plus a Reset action).
- Check layouts at 1440 px and about 1100 px with no clipped labels.

## Power BI feasibility
Prefer slicers, cards, line/column combos, bar charts, tables/matrices, page navigation, tooltips, bookmarks, field parameters (for the comparison reference) and drillthrough. Avoid anything that needs custom visuals or writeback. Record every adaptation in `docs/powerbi-handoff.md`.

Also apply the `web-design-guidelines`, `vercel-react-best-practices` and `vercel-composition-patterns` skills.
