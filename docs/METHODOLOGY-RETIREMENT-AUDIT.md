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

## Crosswalk recorded

The source headings now have a canonical destination map. A destination is not evidence that the
destination is complete; it identifies where the rule must be folded and verified before either
source can be deleted.

| `prompt1.md` phase | Canonical destination |
|---|---|
| 1. Understand the college | `docs/MASTER-CHECKLIST.md` §§1–2 |
| 2. Business domains | `docs/MASTER-CHECKLIST.md` §3 and `docs/blueprint/` |
| 3. Module boundaries | `docs/MASTER-CHECKLIST.md` §4 and `ARCHITECTURE_INDEX.md` module protocol |
| 4. Workflow map | `docs/MASTER-CHECKLIST.md` §7 and capability-local checklists |
| 5. State machines | `docs/MASTER-CHECKLIST.md` §7 and module blueprints |
| 6. Cross-module dependencies | `docs/MASTER-CHECKLIST.md` §5 |
| 7. RBAC and authorization | `docs/MASTER-CHECKLIST.md` §8 and ADRs |
| 8. UI/UX architecture | `docs/MASTER-CHECKLIST.md` §9 and surface checklists |
| 9. Design system | `docs/MASTER-CHECKLIST.md` §10 and canonical token/design files |
| 10. Reporting and analytics | `docs/MASTER-CHECKLIST.md` §12 |
| 11. Automation | `docs/MASTER-CHECKLIST.md` §13 and capability blueprints |
| 12. Edge cases | `docs/MASTER-CHECKLIST.md` §§7, 14 and module test evidence |
| 13. MVP and roadmap | `docs/MASTER-CHECKLIST.md` §20 and `docs/MASTER-PLAN.md` |

The 24 `prompt2.md` module sections map to the module contract in
`ARCHITECTURE_INDEX.md` §Module Execution Protocol, module blueprints and the per-module
checklists. Sections 1–22 cover module purpose through architecture review; section 23 maps to
the open-decision registers (`docs/MASTER-CHECKLIST.md` §3 and `docs/blueprint/adr.md`); section
24 maps to the ADR index and implementation checkpoint. The master checklist still records only
1 of 24 modules as fully processed, so this crosswalk does not retire the source.

Retirement requires all of the following before deletion:

1. Fold and verify every prompt phase/section against the destination crosswalk above.
2. Fold the non-duplicated rules into `ARCHITECTURE_INDEX.md` or the relevant checklist.
3. Update and scan every live reference, including session-start instructions.
4. Have the resulting canonical methodology reviewed for equivalent coverage.
5. Delete the prompts only after the crosswalk and reference scan are committed together.

Until those steps are complete, the prompts stay live and the P0-10 retirement item remains
open. No implementation work is gated on this audit alone.
