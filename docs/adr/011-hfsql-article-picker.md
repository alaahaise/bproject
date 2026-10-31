# ADR 011 — HFSQL article picker for weighing tickets

## Context

Operators need to select products from the existing HFSQL `Articles` table. The
HFSQL schema has article identifiers, references, labels, and classification
fields, but the app does not have a documented mapping from those classification
values to incoming, outgoing, or veterinary products.

## Decisions

- Search the article list through the read-only BL service and keep the renderer
  behind the existing main-process IPC boundary.
- For ordinary entries, suggest only Mais, Soja, Son Fin, Calcaire, and CMV. For
  entry returns and sorties, suggest animal nutrition products such as the
  Aliment and CMV articles, while excluding veterinary terms. Do not offer the
  full article catalogue in these groups.
- Keep manual product entry available if HFSQL is unavailable or an item is
  missing.
- Use an in-app searchable chooser that shows article names and codes, supports
  arrow-key and Enter selection, and displays the first eight matches. Operators
  narrow larger result sets by typing; do not rely on the browser's native
  datalist UI.
- Save the selected HFSQL reference in `product_code`. Do not write an HFSQL
  article ID into `product_id`, which is a foreign key to the app's separate
  MySQL `products` table.

## Consequences

- Operators can search the existing catalog without loading HFSQL into the
  renderer or changing the read-only service contract for BL lookup.
- The product grouping uses positive nutrition keywords plus veterinary-term
  exclusions because the app has no documented mapping for HFSQL family and
  category values. Update the rule if the company confirms a reliable HFSQL
  classification for these product groups.
