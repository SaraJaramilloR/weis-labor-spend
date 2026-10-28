---
name: uc5-requirements-analysis
description: Extract and trace UC5 Labor Spend requirements from the Weis workbook, meeting notes and OPS reports. Use when asked to "map requirements", "update the requirements map", "check what the workbook says", "classify evidence", "add a decision", or before raising SME questions about UC5 metrics, filters or views.
---

# UC5 Requirements Analysis

## Sources, in order of authority
1. `references/UC5_KPIs Definitions and Mapping.xlsx`, sheet `UC #5 - Labor Spend` (metrics R2–R41, filters R42–R61, views R62–R67). Read every populated column: Definition (F), Calculation / Notes (G), Legacy sources (H–I), Reconciliation target (J–K), and the technical columns (T–AD).
2. Sheets `UC #5 - User Stories`, `UC #5 - Open Questions`, `UC #5 - Recon Map`, `Glossary`.
3. `references/technical-session-recap.md` and the meeting transcript `.docx`. These hold the confirmed clarifications.
4. `references/ops/Reports/*.xlsx`. These show how calculations work today; they are not approved definitions.

## How to read the files safely
1. Create a scratch venv outside the project and install `openpyxl` and `python-docx` with pinned versions.
2. Open workbooks with `openpyxl.load_workbook(path, read_only=True, data_only=True)`. Never open `.xlsm` with `keep_vba=True` and never execute macros.
3. The OPS files are about 100 MB each. Read headers, notes and the first rows only (`iter_rows(max_row=...)`). Skip the `Dept` sheets of about 400k rows.
4. Write dumps to the scratchpad only. Never copy real values, store numbers, names or employee data into `src/`, `public/` or `docs/`. Docs may cite labels, formulas and cell locations.

## Classification
Give each item exactly one evidence status. Keep it separate from implementation status.
- **CONFIRMED**: stated by Weis in the meeting or recap, or marked Confirmed by a named Weis person.
- **DOCUMENTED DRAFT**: written in the workbook or an OPS report, but not approved ("Definition status" ≠ Approved by Weis).
- **PROTOTYPE ASSUMPTION**: our choice to make the demo work, explained in the UI.
- **OPEN DECISION**: needs a business answer; it has an ID in `docs/decision-register.md`.

Implementation status values: Implemented / Implemented – illustrative / Pending state / Deferred / Not applicable.

## Procedure
1. Re-extract the workbook and diff it against `docs/requirements-map.md`. Every metric, filter and view row must appear, with its sheet and row reference.
2. For each item, record source, definition, planned page or component, applicable filters, evidence status, implementation status and the remaining decision ID.
3. Before writing an SME question, check the OPS reports for an existing calculation (column headers, pivot field names, notes such as "Clean Sales is TOTAL less GAS & RX"). Ask only the residual question, and quote what you found.
4. When two sources disagree, record both with their locations in the decision register. Do not silently pick one. The meeting-confirmed answer is the prototype default, and the item stays flagged.
5. Never promote a draft formula to an approved rule. Ops 100 DAX names describe current behavior, not approval.
6. Keep workbook row references and technical details in `docs/`, not in the client UI. The UI shows plain-language definitions and a discreet "Open decision" marker.
7. Update `docs/decision-register.md` and `docs/requirements-map.md` together, and cite D-IDs from the map.
