# ADR 010 — Operator workflow and branded print ticket

## Context

The scale operator needs to identify the truck, record the first weight, then
find the same ticket and record the final weight with little training. The
current app has multiple operation types and ticket details, so advanced fields
must stay available without competing with the next required action. Printed
tickets must remain usable on an 80 mm thermal printer, including when the
station has no internet connection.

CASPM's public website provides the official CASPM / Complexe Avicole logo at
`https://caspm.dz/images/logo.PNG` and the slogan “Élevons la qualité ensemble”. The official logo is bundled locally;
ticket HTML must not load images or fonts from the network.

## Decisions

- Keep operation type selection separate from the numbered workflow steps:
  first weighing, final weighing, and all tickets.
- Use short instructions and labels, large controls, and a card for each ticket
  waiting for its second weight. Keep return, VRAC, and notes available under
  the first-weighing screen's optional-fields disclosure.
- When a matricule already has a pending ticket, show a blocking warning and a
  direct action to resume that exact ticket. Keep cancellation as an explicit,
  confirmed alternative.
- Keep one ticket template for both preview and print. Center it within the
  printable 72 mm area, emphasize the matricule and net weight, and embed the
  official logo as a local data URI so printing works offline.
- Keep French and Arabic wording parallel, and preserve RTL output for Arabic.

## Future external-system handoff

No target system or interface has been specified, so this change does not send
data externally. When that integration is planned, define its field mapping,
authentication, correction and cancellation rules, and delivery guarantees
first. The proposed operator flow is a review queue of closed tickets, an
explicit confirmation before sending, an idempotency key per ticket, and a
visible sent / failed state with safe retry. Do not export open or cancelled
tickets by default. Keep credentials out of the renderer and record the
external reference and delivery outcome in an auditable main-process boundary.

## Consequences

- Daily weighing screens prioritize the next action while advanced details
  remain available.
- Ticket appearance stays consistent between preview and print.
- The future system handoff remains a separate, testable feature; its protocol
  and approval semantics must be agreed before implementation.
