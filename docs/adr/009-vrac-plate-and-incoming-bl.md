# ADR 009 — VRAC rotations and optional incoming-return BLs

## Context

An unfinished first weighing normally blocks another first weighing for the same
matricule, because the old ticket may have been abandoned. VRAC customers can
legitimately return for another rotation before an earlier VRAC ticket reaches
its second weighing. Incoming ENTREE tickets also do not use a BL, while an
incoming return may have one that the operator has to type manually if the
document is unavailable.

## Decisions

- When the operator starts a VRAC rotation, another open VRAC ticket for the same
  matricule does not block it. The old ticket remains pending; it is not cancelled
  or merged. The new ticket is suggested into the matching open enlèvement when
  that match is unambiguous. A pending ordinary ticket for that matricule still
  blocks the new capture.
- One rotation remains one ticket. The enlèvement recap sums each completed,
  non-cancelled rotation, preserving the individual weighing evidence.
- An ordinary ENTREE has no BL field and its BL is stored as empty. An ENTREE
  marked as a return can have an optional BL entered manually; HFSQL lookup is
  optional assistance. The rule is applied in both the renderer and main-process
  repository.
- A VRAC BL can only be attached after the enlèvement is closed, so the BL total
  is based on the final set of rotations. This is enforced by the database layer
  and reflected in the UI.
- An `OPERATEUR` cannot close a ticket with an out-of-tolerance écart. A
  `SUPERVISEUR` or `ADMIN` can close it; `closed_by` records that user.

## Consequences

- A VRAC enlèvement cannot close while any non-cancelled rotation awaits its
  second weighing. Operators must complete or cancel each rotation.
- If the same physical trip needs its first weight corrected, use `redoFirst` on
  the existing ticket instead of creating a new rotation.
- BL lookup remains useful for returns but is never required to capture one.
