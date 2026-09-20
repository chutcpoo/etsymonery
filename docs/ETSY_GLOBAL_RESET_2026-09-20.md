# Etsy Global Reset — 2026-09-20

Canonical production state after the user deleted all Etsy products.

- ETSY_LIVE_CATALOG = 0
- CATALOG_STATE = EMPTY_CATALOG / RESET
- Legacy product operations are historical and non-executable.
- Legacy Etsy write routes are blocked at routing middleware.
- Central authorized-operation executor is tombstoned.
- Central authorized asset staging is tombstoned.
- Legacy Etsy GitHub Actions workflows were removed.
- Only CI remains active.
- New Etsy operations must be introduced with a new post-reset operation ID, fresh protected-state verification, fresh exact authorization, and independent release QC.
- No pre-reset authorization may be reused.
- Production must report ETSY_WRITE_COUNT = 0 while in reset state.

Current post-reset product work is not represented by any legacy operation in this repository until a new exact V2 executor is separately introduced and reviewed.
