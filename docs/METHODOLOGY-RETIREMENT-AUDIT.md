# Methodology retirement audit

Updated 2026-09-29 during P0-10 close-out.

`prompt1.md` (593 lines) and `prompt2.md` (570 lines) remain authoritative and are not
retired by this audit. They contain unique methodology, not merely duplicated status:

| Source | Unique role | Current canonical references |
|---|---|---|
| `prompt1.md` | System-level architecture process, phases 1–13, and enterprise-design quality prompts | `ARCHITECTURE_INDEX.md`, `docs/MASTER-CHECKLIST.md` |
| `prompt2.md` | Deep module-design process and its 24-section module contract | `ARCHITECTURE_INDEX.md`, `docs/MASTER-CHECKLIST.md` |

The live-reference scan found explicit references in `ARCHITECTURE_INDEX.md`, `docs/README.md`,
`docs/MASTER-CHECKLIST.md`, `docs/MASTER-PLAN.md`, and
`docs/checklists/P0-stabilise.md`. The architecture index contains the execution protocol, but
does not reproduce the full phase and module methodology, so deleting either source now would
remove the current system of record.

Retirement requires all of the following before deletion:

1. Crosswalk every prompt phase/section to a canonical maintained document.
2. Fold the non-duplicated rules into `ARCHITECTURE_INDEX.md` or the relevant checklist.
3. Update and scan every live reference, including session-start instructions.
4. Have the resulting canonical methodology reviewed for equivalent coverage.
5. Delete the prompts only after the crosswalk and reference scan are committed together.

Until those steps are complete, the prompts stay live and the P0-10 retirement item remains
open. No implementation work is gated on this audit alone.
