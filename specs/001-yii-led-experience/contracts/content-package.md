# Contract: Content Package & Release Channels

**Boundary**: content pipeline (producer) → published release directory (immutable artifact) →
public runtime loader (consumer). The runtime consumes nothing else (Principle V). Canonical
schemas are Zod definitions in `packages/content-schema` with generated JSON Schema; this
document is the human-readable contract. Entity fields: [data-model.md](../data-model.md).

## Package layout (one release)

```text
releases/<semver>/
├── manifest.json                # version, contentHash, createdAt, approvedBy, frozen
├── categories.json              # 12 categories, ordered, 3 projectIds each
├── projects/<projectId>/
│   ├── project.json             # identity, marker, framing, options, sequences, inactive positions
│   ├── media/…                  # images, video, diagrams, 3D, motion assets (+ declared fallbacks)
│   └── voiceover/…              # approved narration audio per option
├── shared/                      # fonts, globe textures, fallback geographic scenes, motion assets
└── validation-report.json       # output of the pre-publish validation run that admitted this release
channels.json                    # { staging: <semver>, production: <semver>, frozen: bool, history: [...] }
```

## Producer obligations (pipeline `validate/` + `publish/`)

A release MUST NOT be written unless every FR-036 check passes:

- structure: exactly 12 categories × 3 projects; no duplicate project references
- per project: approved Overview at position 1; ≤ 5 options; explicit inactive positions;
  name/organisation/country/location/geographicFraming present
- per option: display text present; voiceover file present and playable; sequence has
  openingState, timebase, syncTolerance, ordered beats, finalFrame; formats are known library ids
- media: every ref resolves; codecs/resolutions within budget or declared fallback present;
  rights approved; AI-generated flags set where applicable
- editorial: every included item is `approved`; every claim/metric carries source links;
  metrics verified (unverified ⇒ block)
- freeze: if `channels.json.frozen` is true, publishing to production MUST fail

Publishing operations: `publish <version> --channel staging|production`, `promote <version>`,
`rollback --channel <c>` (repoint to prior retained release), `freeze` / `unfreeze`,
project-level update = new version whose diff touches one `projects/<id>/` subtree.

## Consumer obligations (runtime `content/` loader)

- Revalidate the manifest + all project JSON against the same schemas at load (untrusted input,
  QR-008); refuse the package on any failure and fall back to the previously cached valid
  release, else fallback idle with operator alert.
- Treat the package as read-only; resolve all assets package-relative (no arbitrary URLs).
- Enforce runtime limits independently: ignore options beyond 5, ignore inactive positions,
  require Overview presence before enabling a project.
- Expose release version + contentHash to the operator diagnostics surface.

## Compatibility

`manifest.schemaVersion` (integer) governs breaking changes. The runtime supports exactly one
schemaVersion per app build; pipeline and app versions are released in lockstep for the event.
