# Editorial staging-preview gate

Run the kiosk staging-preview procedure in
[tools/kiosk/README.md](../../../tools/kiosk/README.md) before an editor marks a project ready or
approves it for a release candidate.

## Required review evidence

- Release version and content hash reviewed from the hidden operator overlay.
- Every category and finalist traversed through the simulator path.
- Every active content option checked for local voiceover, media/fallback, final-frame hold, and
  deliberate replay.
- Back, category change, and idle return checked from an active project journey.
- Zero public-facing diagnostics, menus, or technical output observed.
- Results recorded in
  [preview-procedure-run.md](../../../specs/001-yii-led-experience/evidence/preview-procedure-run.md).

A failed observation is an editorial return/rework item, not an approval exception.