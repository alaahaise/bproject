# Operator UI and UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make every daily weighing and ticket-management screen clear for a new operator, while keeping supervisor and device setup available without crowding the work flow.

**Architecture:** Keep the current React/Electron routes, typed IPC, French/Arabic dictionaries, and domain rules. Improve the shell and presentation layer; use scannable ticket and VRAC cards, clear action hierarchy, progressive disclosure for setup, and responsive design tokens. Do not move weight or money logic into the renderer.

**Tech Stack:** TypeScript, React, existing CSS, Vitest.

**Spec:** User request in this conversation; existing product decisions in `docs/adr/010-operator-ui-and-ticket.md`.

## Global Constraints

- Preserve the first-weigh, second-weigh, explicit ticket-close lifecycle.
- Preserve VRAC multi-rotation totals and optional/manual BL handling.
- Keep French and Arabic, including RTL layout.
- Keep technical configuration and business logic outside the renderer where currently required.
- Add no dependencies.

## Review Focus

- A pending matricule must still block a duplicate first weigh and link directly to its open ticket.
- Changing ticket selection must not reuse manual weight input from another ticket.
- Closing a VRAC shipment must remain blocked while a rotation is incomplete or no rotation is weighed.
- Editing, canceling, printing, BL lookup, and ticket status actions must remain available after the history layout changes.
- Long labels, Arabic RTL, narrow windows, and large readable controls must not clip or become unreachable.

### Task 1: App shell and sign-in

**Files:** `src/renderer/src/App.tsx`, `src/renderer/src/pages/Login.tsx`, `src/renderer/src/i18n.tsx`, `src/renderer/src/styles.css`.

- [x] Make work navigation, step navigation, account language selection, and settings visually distinct.
- [x] Make first-run database setup reveal in the same scrollable login layout and allow language choice before sign-in.
- [x] Check French/Arabic wording, keyboard focus, and responsive layout.

### Task 2: Ticket history

**Files:** `src/renderer/src/pages/Operations.tsx`, `src/renderer/src/navigation.ts`, `src/renderer/src/navigation.test.ts`, `src/renderer/src/styles.css`.

- [x] Write and run a failing route helper test for every operation type.
- [x] Add a direct continue action for incomplete tickets.
- [x] Replace the wide multi-column history table with cards that keep ticket, vehicle, net, status, and next action visible; put secondary weights and products under details.
- [x] Preserve edit, cancel, close, preview, print, and BL-check flows.

### Task 3: VRAC management

**Files:** `src/renderer/src/pages/VracGroups.tsx`, `src/renderer/src/i18n.tsx`, `src/renderer/src/styles.css`.

- [x] Present each shipment as one summary card with one total, its rotations, and its BL state.
- [x] Keep close blockers and optional BL handling explicit; preserve the recap and verification actions.
- [x] Keep the layout usable in French, Arabic, and narrow windows.

### Task 4: Settings and shared visual system

**Files:** `src/renderer/src/pages/Settings.tsx`, `src/renderer/src/components/BalanceForm.tsx`, `src/renderer/src/components/DbForm.tsx`, `src/renderer/src/styles.css`.

- [x] Group infrequent connection, scale, BL service, company, and password settings under named disclosures.
- [x] Keep connection status visible and configuration forms fully keyboard accessible.
- [x] Add shared card, list, feedback, and responsive styles; check the work screens follow the same visual hierarchy.

### Task 5: Verify the complete UI change

- [x] Run `npm run typecheck`.
- [x] Run `npm run lint`.
- [x] Run `npm test`.
- [x] Run `npm run build` and `git diff --check`.
- [x] Review the full diff and list any behavior that still needs a live scale check.
