# Data Model: YII 2026 Interactive LED Experience

**Branch**: `001-yii-led-experience` | **Date**: 2026-08-03 | **Plan**: [plan.md](./plan.md)

Two data domains with a strict one-way boundary: **editorial/pipeline data** (mutable, draft →
approved) and the **published content package** (immutable, versioned, the only thing the public
runtime reads). Runtime-internal models (state machine, diagnostics, telemetry) complete the
picture. Field-level wire formats live in [contracts/](./contracts/).

## 1. Published Content Domain (runtime-facing, immutable per release)

### Release
| Field | Type | Rules |
|---|---|---|
| version | semver string | unique, immutable once published |
| contentHash | string | hash of full package tree; reproducibility check |
| createdAt / approvedBy | timestamp / string | audit fields |
| frozen | boolean | production channel refuses overwrite when true |
| categories | Category[12] | exactly 12 (QR-005) |

### Category
| Field | Type | Rules |
|---|---|---|
| id | slug | unique |
| name | string | display name |
| order | int | console mapping order 1–12 |
| projectIds | ProjectRef[3] | exactly 3; first entry = first-preview project (FR-005) |

### Project
| Field | Type | Rules |
|---|---|---|
| id | slug | unique across release; duplicate refs are a validation error (FR-036) |
| name / organisation / country | strings | preview metadata (FR-003), all required |
| location | string | landing metadata (FR-003) |
| categoryId | ref | must match owning category |
| marker | MarkerSpec | lat/lon + emphasis style for the custom globe |
| geographicFraming | GeographicFraming | required, approved (FR-036) |
| contentOptions | ContentOption[1..5] | position 1 MUST be approved Project Overview; ≤ 5 total (FR-002) |
| inactivePositions | int[] | explicit list; runtime ignores these safely (FR-010) |

### GeographicFraming
| Field | Type | Rules |
|---|---|---|
| scopeType | enum | point, site, city, district, corridor, water-system, offshore, region, country, multi-location, network (FR-023) |
| landingCamera | CameraPose | destination, orientation, range — approved per project |
| previewEmphasis | object | globe-side emphasis (marker scale, arc, region glow) |
| boundaries / routes / regions | GeoJSON refs | optional overlay geometry |
| tileTier | enum | photorealistic, local-fallback-scene, safe-composition (research R4) |
| canvasTreatment | TreatmentSpec | darken/soften/reframe/highlight parameters (FR-024) |

### ContentOption
| Field | Type | Rules |
|---|---|---|
| position | 1..5 | fixed physical mapping; unique per project |
| title | string | console-display only — never on LED as a menu (FR-007/QR-006) |
| formats | FormatId[] | from the reusable format library (FR-014) |
| sequence | ContentSequence | required |
| displayText | rich-text blocks | separate editorial asset from voiceover text (FR-025) |
| voiceover | VoiceoverAsset | required for publish (FR-036) |
| mediaRefs | MediaAsset[] | all refs must resolve inside the package |
| available | boolean | runtime double-checks; unavailable = inactive position |

### ContentSequence / Beat
| Field | Type | Rules |
|---|---|---|
| openingState | CompositionSpec | complete opening composition — replay target (QR-002) |
| timebase | enum | `voiceover` \| `timeline` (authoritative clock, research R1) |
| syncTolerance | ms | per-template drift tolerance (QR-002) |
| beats | Beat[] | ordered; each: type (text, media, camera, metric, reveal…), startTime, duration, target/params, easing token |
| finalFrame | CompositionSpec | mandatory visually complete held composition (FR-012, FR-036) |
| interruptionExit | enum | cleanup profile applied on cancel |

### MediaAsset
| Field | Type | Rules |
|---|---|---|
| id / kind | slug / enum | image, video, image-sequence, diagram, model3d, motion |
| file | package-relative path | must exist (FR-036 broken-ref check) |
| resolution / duration / codec | metadata | validated against budgets (research R14) |
| fallback | MediaAsset ref | required for video and model3d kinds |
| rights | RightsRecord | reviewed + approved required (FR-034/FR-036) |
| aiGenerated | boolean | must be true when AI-produced/assisted (Principle VII) |

### VoiceoverAsset
| Field | Type | Rules |
|---|---|---|
| file | path | local audio, delivery codec per budget |
| scriptVersion | ref | links to approved script version (FR-025) |
| voiceId / params | metadata | regeneration provenance (research R11) |
| duration | ms | drives sequence length validation |
| captionText | blocks | carried for future captions (FR-025) |

## 2. Editorial / Pipeline Domain (prep-time only)

### Submission (traceability root)
| Field | Type | Rules |
|---|---|---|
| id / clickupTaskId | slug / string | manual imports use synthetic source id (research R10) |
| rawFields | map | name, org, category, country, location, links, metrics |
| passages | SourcePassage[] | stable anchors: field/paragraph ids preserved across re-ingest |
| attachments | SourceAttachment[] | downloaded local copies + origin URL |
| ingestedAt / revision | timestamps | re-ingest is idempotent |

### DraftAnalysis
| Field | Type | Rules |
|---|---|---|
| submissionId | ref | required |
| summary, purpose, geographicScope, challenges, approaches, outcomes, quantResults, themes | text + PassageRef[] | every claim carries source-passage links (FR-032) |
| needsVerification | Claim[] | statements flagged for editorial check |
| missingInfo | string[] | requested from project teams |
| producedBy | enum | `api-llm:<provider:model>` \| `copilot-agent` (research R9) |
| status | `draft` | analyses never leave draft |

### ProposedOption → EditorialOption (lifecycle)
| Field | Type | Rules |
|---|---|---|
| projectId / position | refs | position assigned at review |
| title, rationale | text | AI-proposed, editor-renameable |
| sourceLinks | PassageRef[] | required on every claim/metric (SC-012) |
| draftDisplayText / draftVoiceoverText | text | separately editable, separately versioned |
| formatRecommendation / mediaRecommendations | refs | editor can override |
| missingAssets | request[] | asset request list (FR-032) |
| reviewState | enum | `draft → in-review → returned → approved → published` \| `rejected` |
| audit | ChangeRecord[] | original wording + every editorial change (FR-034) |

**State transitions (editorial lifecycle)**: `draft → in-review` (editor opens) →
`returned` (rework, keeps audit) or `approved` (human sign-off required — no automated path)
→ `published` (only via a release build that passes full validation). `rejected` is terminal.
**Invariant**: no record with `producedBy != null` and `reviewState != approved` can ever be
referenced by a Release (Principle VII; enforced by pipeline validation and runtime revalidation).

### ReleaseChannel
| Field | Type | Rules |
|---|---|---|
| name | `staging` \| `production` | separation required (FR-037) |
| currentVersion | semver ref | rollback = repoint to retained prior release |
| frozen | boolean | freeze blocks production updates (FR-037) |
| history | ChannelEvent[] | publish/rollback/freeze audit |

## 3. Runtime Experience State Model

Authoritative machine (XState v5). One active category / previewed project / selected project /
content option / sequence / voiceover at all times (Principle I) — enforced by machine context
shape (single nullable refs, never collections).

### States & destinations

| State | Entry does | Exit/cleanup (idempotent) | Interruption destination | Failure destination |
|---|---|---|---|---|
| `boot` | verify assets, start input boundary, preload critical | — | — | `recovering` (fallback idle) |
| `idle` | start globe idle loop, show 36 markers | none needed (loop is idle-owned, keeps running visuals until next entry) | — (idle is the sink) | `recovering` |
| `categoryActive.preview` | filter markers, retarget preview tween, show metadata | kill preview tweens, clear metadata overlay | `idle` (return/reset) or re-entry via routed idle (category) | `idle` |
| `transitionToProject` | run HandoverController forward sequence | cancel handover, restore known renderer state, discard stale completions | per priority: `idle` / new `categoryActive.preview` | R4 fallback tier → `projectLanding` (fallback) or `categoryActive.preview` |
| `projectLanding` | Cesium stage active, hero overlay, preload option assets | stop preloads, clear overlay | `idle` / category / `transitionToPreview` (back) | fallback landing composition |
| `contentPlaying` | orchestrator plays sequence + voiceover | cancel timeline, stop voiceover, dispose beat overlays | landing (option switch = restart path), back/category/idle per priority | in-composition media fallback; sequence failure → safe composition (`contentFinalHold` variant) |
| `contentFinalHold` | hold final frame indefinitely | clear held composition | same as `contentPlaying` | `projectLanding` |
| `transitionToPreview` | reverse handover | as `transitionToProject` | category / idle | `categoryActive.preview` (snap) |
| `recovering` | rebuild failed adapter(s), operator notified | — | — | fallback idle (static safe visual) |

### Event priority (FR-019, machine-enforced guard order)
`operator.reset` > `nav.idle` > `nav.category` > `nav.back` > `nav.select` >
`content.select` / `content.replay` > `preview.hover`.

### SemanticAction (runtime input entity)
| Field | Type | Rules |
|---|---|---|
| type | enum | categorySelect, previewHover, projectSelect, contentSelect, back, idle, operatorReset, operatorCommand, connectionStatus |
| payload | typed per action | validated against active release data (unknown ids rejected) |
| dedupKey | string | type+payload identity; 1 s window filter (FR-020) |
| priority | int | from the table above |
| source | enum | console, simulator, operator |
| receivedAt | timestamp | ordering policy + diagnostics |

### DiagnosticsSnapshot (operator read model, QR-008 field set)
current state path, active category/preview/selection/content, sequence progress, voiceover
status, video status, console connection (status, lastMessageAt, lastAction), renderer status
(globe/cesium/handover), performance health (fps, heap trend), asset failures ring, last errors,
recovery controls state.

### InteractionEvent (telemetry, FR-038)
`{ ts, sessionId, kind (start|reset|connect|disconnect|category|preview|select|content|replay|interrupt|return|mediaFailure|assetFailure|rendererFailure|recovery), stateBefore, stateAfter, refs, latencyMs? }` — append-only JSONL via sidecar (research R15).

## 4. Cross-Domain Invariants (validation-enforced)

1. Release contains exactly 12 categories × exactly 3 projects = 36 (QR-005).
2. Every project: approved Overview at position 1; ≤ 5 options; explicit inactive positions.
3. Every published claim/metric traces to ≥ 1 SourcePassage; every media asset has approved
   rights; every AI-produced item passed `approved` (SC-011, SC-012).
4. Every sequence declares openingState, timebase, syncTolerance, finalFrame.
5. All package-internal refs resolve; all media within budget or carrying declared fallback.
6. Runtime refuses any package failing revalidation — failure destination: previous cached
   release, else fallback idle with operator alert.
