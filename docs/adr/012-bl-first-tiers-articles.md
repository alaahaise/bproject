# ADR 012 — BL-first sorties, TIERS tickets, and article rules

## Context

The normal customer SORTIE is checked against its HFSQL delivery note. Operators
need a simple sequence that starts from the BL they already have. TIERS tickets
record an outside weighing and must not create company stock movements. Article
classification and product-family rules depend on the real HFSQL values and
labels, so they must be inspected before the application encodes them.

## Decisions

- A normal SORTIE (not VRAC and not a return) requires a BL number before its
  second weighing. The operator enters the number first, then loads its client,
  date, and product lines from HFSQL. The BL lines are shown read-only with their
  code, name, quantity, and weight.
- If the lookup is unavailable, the BL is missing, or the BL has no lines, the
  operator can open the manual product editor and transcribe the paper document.
  The BL number remains required. Changing a loaded BL requires confirmation and
  clears the previous BL lines before loading the new number.
- VRAC and SORTIE returns keep their existing workflows. `bl_no` and `bl_date`
  remain stored on the ticket for later reconciliation; this change adds no
  HFSQL synchronization or tracking for unweighed lines.
- TIERS tickets have no BL and no source or destination location. The main
  process clears such values even if a client sends them. Migration 009 excludes
  TIERS from both sides of `v_stock_moves`; historical tickets remain unchanged.
- Veterinary and other non-weighed products have zero weighed kilograms and must
  stay outside the weight comparison and captured stock lines. Product-family
  grouping must preserve the CASPM range separately and may merge N1/N2 only
  under an explicit rule that keeps products such as Repro 1 and Repro 2 distinct.
- The company must identify the HFSQL values and article names that qualify for
  those rules. Until then, no veterinary classification or product-family rule
  is implemented. A read-only export of the HFSQL article fields and sold BL line
  counts is the evidence for that review.

## Consequences

- Operators can use the printed BL when HFSQL lookup is unavailable, while the
  second weighing still requires a traceable BL number.
- Historical TIERS tickets remain evidence but stop appearing as company stock
  movements through the view.
- The BL article export must be reviewed before implementing non-weighed line
  handling, article classification, or family merging.
