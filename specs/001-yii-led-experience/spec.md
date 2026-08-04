# Feature Specification: YII 2026 Interactive LED Experience

**Feature Branch**: `001-yii-led-experience`

**Created**: 2026-08-03

**Status**: Draft

**Input**: User description: "create specs based on Docs/YII_2026_Interactive_LED_Experience_PRD.md"

## Scope & Boundaries *(mandatory)*

### In Scope

- A single-user, console-controlled, full-screen LED wall experience presenting 12 YII award
  categories, 3 finalist projects per category (36 total), and up to 5 content options per project.
- An idle state presenting a cinematic custom globe with all 36 finalist markers, seamless
  day/night and cloud animation, and no on-screen instructions.
- Category activation that routes through idle, hides unrelated project markers, and automatically
  previews the first project in the category.
- Continuous project-preview navigation across the three category finalists via a physical wheel,
  showing project name, organisation, and country at a space-level globe view.
- Project confirmation triggering a concealed, reversible transition from the custom globe into a
  geographic project environment, arriving at a project landing hero view.
- Content playback: visitor-triggered project stories combining text, imagery, video, metrics,
  timelines, diagrams, geographic camera sequences, 3D content, and automatic multi-beat sequences
  with synchronized pre-generated voiceover, final-frame hold, deliberate replay, and clean
  interruption.
- Return navigation: back to project preview (reverse concealed transition), category change from
  any state, and manual return to idle — with explicit input priority and duplicate filtering; a
  deeper emergency reset is available to operators only.
- Protocol-independent semantic console input, connection monitoring, and a hidden input simulator
  covering every public action and failure scenario.
- A hidden operator interface exposing current state, connection health, playback status, asset
  failures, performance health, and reset/recovery controls.
- Event-grade reliability: event-local availability of critical content, low-touch startup into
  idle, graceful degradation, recovery paths, and full-day continuous operation.
- Interaction logging and post-event analytics capture that never blocks the live experience.
- A content preparation and publishing workflow: ingestion of project submissions (primarily from
  ClickUp), AI-assisted analysis and draft content-option generation, source-traceable human
  review and approval, display-text and voiceover-script editing, geographic framing preparation,
  media review, validation, preview without the physical console, and controlled publishing with
  staging/production separation, project-level updates, rollback, and content freeze.

### Out of Scope

- Industrial design, fabrication, physical behaviour, labelling, lighting, or mechanics of the
  physical console table.
- The final console hardware communication protocol, signal payloads, and network topology
  (the experience must remain independent of these).
- The external ambient music system, including starting, stopping, mixing, ducking, or
  synchronising ambient audio.
- Multi-user interaction of any kind.
- Direct touch, pointer, keyboard, or mouse interaction on the LED wall during public use.
- A general-purpose public website or a public CMS for arbitrary third-party users.
- Live generative AI output or live text summarisation during the public event experience.
- Automatic publication of unreviewed AI-generated content.
- Backend architecture, final data schema, database selection, deployment provider, media-server
  architecture, and detailed content-authoring interface design (deferred to planning and later
  workshops).
- A guarantee that every project uses every supported content format.

### Open Decisions & Dependencies

- Console transport protocol (MIDI, OSC, MQTT, WebSocket, serial, or other), signal payloads,
  acknowledgement, heartbeat, and reconnection rules — owner: creative technology team; must be
  resolved before hardware-integration testing.
- Final list of YII 2026 categories and finalists, and confirmed project names, organisations,
  countries, and locations — owner: YII programme team; required before content lock.
- Complete project submissions in ClickUp, media rights and approvals, and additional media from
  project teams — owner: content/editorial team; required before editorial production completes.
- Final voiceover voice selection, number of voices, audio mastering, caption policy, and maximum
  recommended narration duration — owner: editorial and UX; required before voiceover generation.
- LED resolution, playback computer specification, and event network/local infrastructure —
  owner: event operations; required to finalise performance budgets and endurance testing.
- Photorealistic geographic tile suitability and licensing per project, and custom 3D/geographic
  assets — owner: creative technology and content teams; required per-project before geographic
  framing approval.
- Analytics storage, log retention, privacy review, monitoring, and remote support approach —
  owner: operations; required before the event build.
- Final visual design system: typography, YII visual language, pin design, layout, content
  templates, and motion timing — owner: UX/visual design; required before content-template
  production.

## Clarifications

### Session 2026-08-03

- Q: Is the "reset" action available to visitors on the public console, or is it an operator-only command? → A: Operator-only — visitors' strongest action is return-to-idle; reset (deep cleanup/recovery) lives in the hidden operator interface and simulator.
- Q: When a visitor selects the category that is already active, should the experience restart that category's journey or ignore the press? → A: Always re-enter — a deliberate same-category press restarts the category journey (route through idle, first project previewed) from any state.
- Q: How much time must pass between two identical presses for the second press to count as deliberate rather than an accidental duplicate? → A: 1 second — identical signals within 1 second are filtered as duplicates; identical presses after 1 second are honoured as deliberate (replay / category re-entry).
- Q: Should the 250 ms input-response budget be a hard acceptance threshold for release, or an aspirational target? → A: Hard threshold — first visible response to every console action must begin within 250 ms on event hardware; exceeding it fails release validation.
- Q: What protection must the hidden operator interface require before it opens? → A: Hidden activation only — a concealed button combination or specific input sequence (e.g., two/three simultaneous presses or a defined order); no credential required.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Explore Categories and Preview Finalists on the Cinematic Globe (Priority: P1)

An event attendee approaches the console while the LED wall shows a living, cinematic Earth with
all 36 finalist markers. The visitor selects one of 12 award categories; the experience routes
briefly through idle, unrelated markers disappear, and the first finalist in the category is
automatically previewed with its name, organisation, and country. Rotating the physical wheel
moves the preview between the three category finalists with smooth, space-level globe movement.

**Why this priority**: This is the entry point of the entire experience. Without idle, category
activation, and wheel-driven preview, no other journey can begin. It alone demonstrates the
cinematic globe, the console-owned navigation model, and the 12×3 information structure.

**Independent Test**: Using the input simulator (no console required), select each category and
rotate through all three finalists; verify marker filtering, automatic first-project preview,
metadata display, and continuous space-level presentation. Delivers a complete browsable showcase
of all 36 finalists.

**Acceptance Scenarios**:

1. **Given** the application is in idle with all 36 finalist markers visible, **When** a category
   is selected, **Then** the experience routes through idle, only the three finalists of that
   category remain visible, and the first project enters preview showing project name,
   organisation, and country.
2. **Given** a project is in preview, **When** the wheel moves to the next project, **Then** the
   globe rotates and reframes at a space-level view, the new marker is emphasised, and the
   metadata updates without flicker — without zooming to surface level.
3. **Given** the wheel is moved rapidly across all three projects, **When** hover signals arrive
   before the previous movement completes, **Then** the globe cancels or retargets smoothly
   without queuing obsolete destinations, and the final previewed project matches the last signal.
4. **Given** the application is idle, **When** no input arrives for an extended period, **Then**
   the globe loop continues seamlessly with no visible starts, stops, or degraded angles, and no
   instructional UI appears on the LED.

---

### User Story 2 - Confirm a Project and Arrive in Its Geographic Environment (Priority: P2)

The visitor confirms the previewed project. The experience begins a concealed, cinematic
transition — approaching the atmosphere, passing through cloud/atmospheric treatment — and
arrives in a geographic project environment framed for that specific project, showing project
name, organisation, and location with no story content and no narration active.

**Why this priority**: Project confirmation and the concealed renderer transition are the bridge
between global navigation and project storytelling. It is the highest-risk visual moment and the
prerequisite for all content playback.

**Independent Test**: From any project preview, confirm the project and verify the transition
shows no black frames, no visibly unloaded geographic content, and no obvious renderer switch,
ending at that project's approved landing composition with correct metadata and no narration.

**Acceptance Scenarios**:

1. **Given** a project is in preview, **When** the visitor confirms it, **Then** a concealed
   transition plays with no black frames, no visible loading, and preserved geographic
   orientation where feasible, ending at the project's approved landing framing.
2. **Given** the project landing state is active, **When** no content button has been pressed,
   **Then** the LED shows project name, organisation, location, and approved geographic context
   only — no story content, no voiceover, and no content menu.
3. **Given** a project whose footprint is a corridor, region, network, or multi-location system,
   **When** it is confirmed, **Then** the landing composition uses that project's approved
   project-specific framing and scale.
4. **Given** the concealed transition is in progress, **When** a category selection or return-to-
   idle action arrives, **Then** the transition cancels safely and the higher-priority action
   completes without visual corruption.

---

### User Story 3 - Experience a Project Story with Voiceover (Priority: P3)

At the project landing, the visitor presses one of five physical content buttons. The selected
story begins: display text, media, geographic camera movement, and graphics advance automatically
as a timed sequence while the associated pre-generated voiceover plays. When the sequence
finishes, the final composition holds until the visitor acts. A deliberate second press of the
same button replays the story from the beginning; pressing a different active button switches
stories cleanly.

**Why this priority**: Content playback is the storytelling payoff, but it requires Stories 1–2
to be reachable. It delivers the project-specific narrative value of the installation.

**Independent Test**: For a published test project, trigger each active content position and
verify automatic progression, voiceover start/stop alignment, final-frame hold, deliberate
replay from a clean opening state, safe ignoring of inactive positions, and clean switching
between stories.

**Acceptance Scenarios**:

1. **Given** the project landing is active, **When** a valid content position is pressed, **Then**
   the story's visual treatment begins, the associated voiceover starts automatically, and the
   sequence advances without further visitor input.
2. **Given** a content sequence has completed, **When** no input arrives, **Then** the final
   composition remains held indefinitely without appearing frozen or reverting to project landing.
3. **Given** a content story is playing or holding its final frame, **When** the same content
   button is deliberately pressed again, **Then** the story restarts from its complete opening
   state — visuals, camera, media position, timing, and voiceover all reset.
4. **Given** a content story is playing, **When** a different active content position is pressed,
   **Then** the current voiceover stops, the current sequence cancels cleanly with no stale
   frames, and the new story and its voiceover begin.
5. **Given** a project with fewer than five content options, **When** an inactive position is
   pressed, **Then** the signal is ignored safely with no visible change or error.
6. **Given** a burst of duplicate signals arriving within 1 second (hardware bounce), **When**
   they target the active content position, **Then** they are filtered — at most the single
   originating action takes effect, never repeated restarts — while an identical press after
   1 second triggers a deliberate replay.

---

### User Story 4 - Navigate Back, Switch Category, and Return to Idle from Anywhere (Priority: P4)

At any point — during preview, transition, landing, content playback, or final-frame hold — the
visitor can go back to project preview, select a different category, or return to idle. Back
navigation reverses the concealed transition and restores the previously previewed project.
Category change stops everything, routes through idle, and previews the new category's first
project. Return to idle restores all 36 markers. No inactivity timer ever changes the state.

**Why this priority**: Interruptibility and predictable return navigation make the installation
resilient to real visitor behaviour, but they refine journeys established by Stories 1–3.

**Independent Test**: From each major state (preview, transition, landing, playing, final-frame
hold), issue back, category-change, and return-to-idle actions; verify media/voiceover stop,
transitions cancel safely, and the destination state is correct with no residual effects.

**Acceptance Scenarios**:

1. **Given** a content story is playing, **When** the back-to-projects action is received,
   **Then** voiceover and media stop, the reverse concealed transition plays, and the previously
   previewed project is restored in preview with its metadata shown.
2. **Given** any major state (idle, preview, transition, landing, content, final-frame hold),
   **When** a category selection arrives — including a deliberate re-press of the currently
   active category — **Then** all active media, voiceover, and sequences stop safely, the
   experience routes through idle, and the (re-)selected category's first project enters
   preview.
3. **Given** any major state, **When** the return-to-idle action is received, **Then** all
   category, project, and content presentation clears, all 36 finalist markers are restored, and
   the idle loop resumes gracefully.
4. **Given** the application has received no input for hours, **When** the state is inspected,
   **Then** it remains exactly where the last visitor left it — no inactivity-based reset has
   occurred.

---

### User Story 5 - Operate, Diagnose, and Recover the Installation (Priority: P5)

An event operator starts the installation with a low-touch procedure; it enters full-screen
idle without exposing browser chrome. Through a hidden interface, the operator sees current
state, category, previewed/selected project, active content, sequence progress, voiceover/video
status, console connection health, last input, asset failures, and performance health. The
operator can simulate every console action, reset to idle, reload, and recover from media or
renderer failures — while the public never sees diagnostics or error text.

**Why this priority**: Operational tooling is essential for the live event and for development
before the console exists, but it supports rather than defines the visitor experience.

**Independent Test**: Without the physical console, drive the full experience through the
simulator; disconnect and reconnect the (simulated) console; force a media failure; verify
diagnostics accuracy, recovery to a known visual state, and zero public exposure of technical
information.

**Acceptance Scenarios**:

1. **Given** the physical console is unavailable, **When** the operator uses the hidden
   simulator, **Then** every public action — category, hover, select, each content position,
   replay, back, idle — plus the operator-only reset and failure scenarios (duplicates,
   disconnection, rapid wheel movement) can be exercised.
2. **Given** console communication stops, **When** the operator views diagnostics, **Then**
   disconnected status, last received message time, and last interpreted action are shown, the
   public presentation continues uncorrupted, and reconnection restores input handling.
3. **Given** a non-critical asset fails to load, **When** the affected content is shown, **Then**
   a suitable fallback appears, the failure is logged and visible to the operator, and navigation
   remains fully functional.
4. **Given** a critical failure occurs mid-experience, **When** recovery triggers, **Then** the
   presentation returns to a safe visual state (fallback landing or idle) with no blank screen,
   browser error, or technical text visible to the public.

---

### User Story 6 - Prepare Project Stories with AI Assistance and Human Review (Priority: P6)

A content editor imports a finalist submission (primarily from ClickUp). The workflow extracts
text and attachments, analyses the submission, and proposes a Project Overview plus up to four
additional content options — each with a visitor-facing title, rationale, linked source
passages, suggested display text, suggested voiceover script, recommended format, and media
recommendations, plus a missing-asset request list. The editor accepts, rejects, renames,
reorders, and rewrites everything; nothing reaches the live application without explicit human
approval, and every claim remains traceable to its source.

**Why this priority**: Editorial preparation happens before the event and gates content quality,
but it is a supporting workflow rather than the public experience itself.

**Independent Test**: Ingest a representative submission; verify draft options are generated
with source traceability; edit and approve content; confirm unapproved and rejected material is
never available to the live application.

**Acceptance Scenarios**:

1. **Given** a submission with text and attachments, **When** analysis completes, **Then** a
   draft Project Overview and up to four proposed options exist, each with title, rationale,
   linked source passages, draft display text, draft voiceover text, format recommendation, and
   identified missing assets.
2. **Given** a weak submission, **When** options are proposed, **Then** fewer than five
   meaningful options are proposed rather than filler content.
3. **Given** draft content, **When** an editor reviews it, **Then** the editor can trace each
   claim and metric to source passages or attachments, see original wording and editorial
   changes, and reject unsupported claims.
4. **Given** AI-generated draft content exists, **When** the live application content set is
   inspected, **Then** no unapproved AI-generated text, media, or voiceover is present.

---

### User Story 7 - Validate and Publish Approved Content to the Live Experience (Priority: P7)

Before the event, the team previews every journey without the physical console, runs validation
that flags missing or invalid content (missing Overview, missing metadata, broken media,
missing voiceover, more than five options, missing geographic framing, unverified metrics), and
publishes approved content through a controlled release. Project-level updates, media/text/
voiceover replacement, rollback to a previous approved version, content freeze, and staging/
production separation are supported without changing the live application's navigation logic.

**Why this priority**: Publishing integrity gates the event build, but depends on all previous
stories existing.

**Independent Test**: Run validation against deliberately broken project content and verify each
defect class is flagged; publish an approved release to a staging target; perform a project-level
update and a rollback; confirm the live application only ever consumes approved, versioned
content.

**Acceptance Scenarios**:

1. **Given** a project missing its Project Overview, voiceover, or geographic framing, **When**
   validation runs, **Then** each problem is reported and the project cannot be published until
   resolved or explicitly handled.
2. **Given** an approved release is live, **When** a text correction, media replacement, or
   voiceover replacement is published for one project, **Then** the update applies without
   redeveloping or altering core navigation behaviour.
3. **Given** a faulty update is discovered, **When** rollback is triggered, **Then** the previous
   approved version is restored.
4. **Given** content freeze is active for the event build, **When** further edits are attempted,
   **Then** they cannot reach the production experience.

---

### Edge Cases

- Higher-priority interruption of every long-running state: emergency reset (operator-only) and
  return-to-idle pre-empt category selection; category selection pre-empts back/select/content/
  hover — including during the concealed renderer transitions in both directions; very short
  transitions may temporarily reject only lower-priority input.
- Duplicate, invalid, stale, out-of-order, or burst actions: hardware bounce and network
  duplication are filtered at the input boundary, while a deliberate re-press of the active
  category or content position is honoured (category re-entry or replay); invalid content slots,
  invalid project references, unknown commands, and unsupported state jumps are rejected safely;
  late/stale asynchronous completions from cancelled sequences are ignored.
- Replay and final frame: replay restores the complete opening state (visuals, camera framing,
  media position, voiceover, timing, temporary overlays); every sequence declares a visually
  complete final composition that holds indefinitely until valid input.
- Failure destinations: media failure falls back within the composition without blanking; failed
  project load falls back to a safe project landing or idle; renderer failure recovers to a known
  visual state; the public never sees blank screens, browser errors, or technical text.
- Console disconnection/reconnection: the presentation continues uncorrupted while disconnected,
  the operator sees connection status, and reconnection resumes input handling without state
  corruption; rapid wheel movement retargets globe motion without queuing obsolete destinations.
- Unavailable positions and unapproved content: inactive content positions are represented
  explicitly and ignored safely; unapproved, malformed, or out-of-limit content is rejected at
  validation and can never load in the public runtime.
- Sustained operation: repeated category switches, project selections, video playback, replays,
  and transition cycles over a full event day must not accumulate resources or degrade frame
  stability; temporary internet loss must not affect critical journeys.

## Constitution Check *(mandatory)*

| Principle Area | Applicability & Rationale | Linked Requirements / Acceptance Scenarios |
|----------------|---------------------------|--------------------------------------------|
| Deterministic state and interruption safety | Applicable — the entire public experience is a deterministic, console-driven state model with interruption from every state. | FR-005, FR-011, FR-015–FR-017, FR-019–FR-020, QR-001; US4 S1–S4, US2 S4 |
| Motion and sequence orchestration | Applicable — idle loop, preview retargeting, concealed renderer transitions, and multi-beat content sequences are core behaviour. | FR-004, FR-006, FR-008, FR-012–FR-014, QR-002; US1 S2–S3, US2 S1, US3 S1–S4 |
| Protocol-independent semantic input | Applicable — the console transport is undecided; all navigation arrives as semantic actions with validation, dedup, and simulation. | FR-018–FR-022, QR-003; US1 S3, US3 S6, US5 S1–S2 |
| Local-first event reliability and recovery | Applicable — the installation must run a full event day with unreliable internet and support operator recovery. | FR-026–FR-028, QR-004; US5 S2–S4, SC-007, SC-009 |
| Reusable, validated content architecture | Applicable — 36 projects share one navigation model with configurable, validated, versioned content. | FR-001–FR-003, FR-010, FR-031–FR-037, QR-005; US6 S1–S4, US7 S1–S4 |
| Cinematic, console-owned, accessible presentation | Applicable — the LED is a cinematic canvas with no menus/instructions, large-format legibility, and safe motion. | FR-004, FR-007, FR-009, FR-014, FR-024–FR-025, QR-006; US1 S4, US2 S2, SC-010 |
| Human approval and content traceability | Applicable — AI-assisted preparation is central and must remain draft-only until human approval with source traceability. | FR-032–FR-034, FR-025, QR-005; US6 S1–S4, SC-011 |
| Measured performance and resource ownership | Applicable — large-format rendering, video, geographic tiles, and repeated cycles demand budgets and endurance evidence. | FR-029–FR-030, QR-007; SC-002, SC-003, SC-008 |
| Verification, observability, and secure operation | Applicable — hidden operator diagnostics, simulator coverage, untrusted-input validation, and release validation are required. | FR-021–FR-022, FR-028, FR-038, QR-008–QR-009; US5 S1–S4, SC-005–SC-006, SC-009–SC-011 |

## Requirements *(mandatory)*

### Functional Requirements

**Structure & content model**

- **FR-001**: The experience MUST present 12 categories with exactly three finalist projects each
  (36 total); the category list and all project identities MUST be configurable without changes
  to navigation behaviour.
- **FR-002**: Each project MUST support up to five content options; Project Overview MUST always
  be present, count toward the five, and occupy content position 1; positions beyond a project's
  defined options MUST be explicitly inactive.
- **FR-003**: Each project MUST carry preview metadata (name, organisation, country), landing
  metadata (name, organisation, location), and an approved project-specific geographic framing.

**Idle & category selection**

- **FR-004**: The idle state MUST show the custom cinematic globe with all 36 finalist markers,
  animated cloud layer, looping day/night cycle, atmospheric treatment, and subtle continuous
  motion in a seamless indefinite loop, with no instructional UI, menus, or button prompts on the
  LED.
- **FR-005**: Selecting a category from any state MUST safely end active sequences and voiceover,
  route through idle, hide all markers outside the category, and automatically place the
  category's first project into preview (treated as the actively hovered project). A deliberate
  re-selection of the already-active category MUST be honoured as a fresh category entry,
  restarting the journey at the category's first project.

**Project preview**

- **FR-006**: Wheel hover signals MUST continuously move the preview among the three category
  finalists with cinematic space-level globe movement that keeps the Earth whole or near-whole,
  avoids surface-level zoom, emphasises the destination marker, and updates metadata without
  flicker; new hover signals arriving mid-movement MUST cancel or retarget smoothly.
- **FR-007**: One project MUST always be in preview when a category is active; the experience
  MUST NOT present a neutral three-project overview screen or an on-LED selection menu.

**Confirmation, transitions & landing**

- **FR-008**: Confirming the previewed project MUST trigger a concealed transition into the
  geographic project environment that avoids black frames, visible loading, visibly unloaded
  geographic content, and obvious renderer switching, preserving perceived direction where
  feasible; the reverse journey MUST use the same transition language.
- **FR-009**: Project landing MUST show the project hero view (name, organisation, location,
  geographic environment, approved markers/boundaries/contextual graphics) with no story content
  active and no narration until a content button is pressed.

**Content playback**

- **FR-010**: The experience MUST map five fixed physical content positions per project; signals
  targeting inactive positions MUST be ignored safely with no public-facing effect.
- **FR-011**: Selecting a valid content position MUST interrupt any current sequence and
  voiceover, start the selected story's visual treatment, and automatically start its associated
  voiceover.
- **FR-012**: Content sequences MUST advance automatically through their defined beats without
  visitor input, keep voiceover and visuals aligned, and hold indefinitely on a defined,
  visually complete final composition — never auto-returning to project landing.
- **FR-013**: A deliberate repeated press of the active content position MUST replay the story
  from its complete opening state (sequence timing, visuals, media position, camera path, and
  voiceover all reset); residual effects from the previous run MUST be cancelled.
- **FR-014**: The experience MUST support a reusable content-format library including at minimum:
  text-led composition, text+image, full-screen image, video, image sequence, animated metrics,
  hero numbers, timeline, process/workflow diagram, before-and-after and side-by-side comparison,
  animated map, geographic camera sequence, highlighted region, 3D model/digital twin/reality
  model views, construction sequence, layer reveal, quote, technology breakdown, and multi-step
  narrative sequences — combinable within one content option.

**Return navigation & reset**

- **FR-015**: The back-to-projects action MUST stop voiceover and media, exit content, play the
  reverse concealed transition, and restore the previously previewed project in preview.
- **FR-016**: A manual return-to-idle action MUST stop all playback, clear category/project/
  content presentation, restore all 36 markers, and resume the idle loop; the experience MUST
  NOT apply any inactivity-based automatic reset.
- **FR-017**: Category selection and return-to-idle MUST be honoured from every major state,
  including during transitions and content playback.

**Console input**

- **FR-018**: Experience logic MUST consume validated, protocol-independent semantic actions
  (category selected, preview changed, project selected, content position selected, back,
  return-to-idle, connection status, and operator-only commands including emergency reset);
  transport specifics MUST terminate at a replaceable input boundary. Emergency reset MUST NOT
  be triggerable from visitor-facing console controls.
- **FR-019**: Input priority MUST be explicit and enforced: emergency reset (operator-only) >
  return to idle > category selection > back to preview > project selection > content
  selection/replay > hover changes; the experience MUST remain responsive to higher-priority
  actions during long sequences and transitions.
- **FR-020**: The input boundary MUST filter duplicate identical signals (hardware bounce,
  network duplication, accidental bursts) arriving within 1 second of the previously accepted
  identical signal, and MUST honour an identical press arriving after that window as deliberate
  (content replay or category re-entry); invalid actions, unknown commands, invalid
  slots/references, and unsupported state jumps MUST be rejected safely.
- **FR-021**: The experience MUST monitor console connectivity and expose connected/disconnected
  status, last message time, and last interpreted action to the operator only — never on the
  public LED.
- **FR-022**: A hidden simulator MUST drive every public action and failure scenario (any
  category/project/content selection, replay, back, idle, reset, duplicates, disconnection,
  rapid wheel movement) through the same semantic action interface as the physical console.

**Geographic representation**

- **FR-023**: The experience MUST represent diverse geographic scopes — exact point, site, city,
  district, corridor, river/water system, offshore area, region, country, multi-location, and
  distributed network — in both the preview globe and the project environment, with
  project-specific landing scale.
- **FR-024**: Photorealistic 3D geographic context MUST be the default where suitable, with
  approved alternatives/fallbacks for poor coverage, remote/underground/offshore/confidential
  sites, large regions, and visually unsuitable locations; project content MUST be able to
  treat the geographic canvas (darken, soften, reframe, highlight, restore) rather than fully
  replace it by default.

**Voiceover & audio**

- **FR-025**: The public runtime MUST play only pre-generated, approved voiceover audio mapped
  to content options; voiceover MUST start automatically with its content, stop immediately or
  fade quickly on interruption/navigation/category change/idle, and restart from the beginning
  on replay; display text and voiceover text MUST remain separate editorial assets; the design
  MUST NOT preclude adding captions later.

**Reliability & operation**

- **FR-026**: All critical event content (project data, display text, voiceover, images, video,
  motion assets, required 3D assets, fonts, fallback geographic content) MUST be available
  locally or via event-local delivery; internet-dependent features MUST have documented
  fallbacks that preserve critical journeys.
- **FR-027**: Startup MUST be low-touch: launch into full-screen kiosk presentation, load
  required assets, verify console connectivity, and enter idle without exposing browser chrome
  or requiring developer tools.
- **FR-028**: The experience MUST support soft reset to idle, reload, full restart, console
  reconnect, media and renderer recovery, fallback project landing, and fallback idle; non-
  critical asset failures MUST degrade gracefully with logging; critical failures MUST return
  to a safe visual state with operator notification and no public technical output.

**Performance & endurance**

- **FR-029**: The experience MUST sustain smooth animation, stable frame pacing, and a first
  visible response to every console action within 250 ms at native LED resolution on the event
  playback hardware, with no visible buffering in normal use and no black frames during
  transitions.
- **FR-030**: The experience MUST prepare likely-next content (previewed project's geographic
  target and landing assets; all active content options after selection) and reuse rather than
  re-fetch/re-decode large assets within a session; repeated full-day operation MUST NOT cause
  progressive memory growth or frame degradation.

**Content preparation workflow**

- **FR-031**: The workflow MUST ingest submissions (primarily from ClickUp) including text,
  title, organisation, category, country, location, attachments, media, metrics, product
  references, and links.
- **FR-032**: AI assistance MUST produce draft analysis per project — summary, purpose,
  geographic scope, challenges, distinctive approaches, outcomes, quantitative results, themes,
  text categorisation, statements needing verification, and missing information — plus a draft
  Project Overview and up to four proposed options with visitor-facing titles, rationale,
  linked source passages, draft display text, draft voiceover text, recommended format and
  visuals, and missing-asset requests; it MUST prefer fewer meaningful options over filler.
- **FR-033**: Every publishable item MUST pass human review; editors MUST be able to accept,
  reject, rename, reorder, rewrite display and voiceover text, remove unsupported claims, edit
  metrics, select media, change formats, set geographic framing, and mark content ready or
  returned; AI output MUST NOT publish directly.
- **FR-034**: The workflow MUST retain traceability: source passages, attachment references,
  submitted metrics, original wording, editorial changes, and approval status for every claim,
  metric, and media item; AI-generated/assisted media MUST be identified and reviewed for
  accuracy, rights, resolution, aspect ratio, quality, brand suitability, and relevance.
- **FR-035**: The team MUST be able to preview every public journey (idle, category, preview,
  transition, landing, each content option, voiceover, sequences, final frame, replay, back,
  category change) without the physical console.
- **FR-036**: Pre-publish validation MUST detect at minimum: missing Project Overview, more than
  five options, missing name/organisation/country/location/geographic framing, missing media,
  missing voiceover, missing display text, broken asset references, unsupported formats,
  invalid sequences, missing final frame, empty positions, duplicate project references,
  unapproved content, unverified metrics, and missing rights information.
- **FR-037**: Publishing MUST support full release, project-level update, media/text/voiceover
  replacement, rollback to a previous approved version, content freeze, reproducible event
  builds, and staging/production separation; the live experience MUST consume only validated,
  approved, versioned content.

**Observability & analytics**

- **FR-038**: The experience MUST record interaction and system events (start, reset, console
  connect/disconnect, category/project/content selections, replays, interruptions, returns,
  media/asset/renderer failures, recovery actions) sufficient to analyse popularity, dwell
  time, navigation paths, and reliability — without ever blocking navigation, rendering, media,
  or recovery.

### Operational & Quality Requirements *(mandatory applicability review)*

- **QR-001 — State & Interruption**: One authoritative experience state governs the public
  presentation at all times, with at most one active category, previewed project, selected
  project, content option, sequence, and voiceover. Every state and transition defines its
  success, interruption, and failure destinations plus cleanup outcomes. The priority order in
  FR-019 is externally observable: during any transition or sequence, a higher-priority action
  visibly wins within the response budget in QR-007, and repeated cancellation never produces
  errors, residual audio, stale overlays, or motion artefacts.
- **QR-002 — Sequence & Replay**: Every content sequence declares its opening composition, beat
  timing, synchronization tolerance between visuals/camera/media/voiceover (as defined per
  content template during design, and held after frame drops, interruption, and recovery), a
  visually complete final frame that holds until valid input, and deterministic replay that
  restores the full opening state. Interrupted sequences exit cleanly to their defined
  interruption destination; failed sequences land in a defined safe composition.
- **QR-003 — Input Reliability**: All console input arrives as validated semantic actions;
  deduplication, bounce filtering, burst suppression, ordering policy, and connection
  monitoring occur at the input boundary. Deliberate repeat presses are distinguished from
  accidental duplicates using the 1-second window defined in FR-020. Disconnection never
  corrupts the presentation; reconnection resumes handling without state loss. Rapid hover
  retargeting never queues obsolete destinations. The simulator exercises every action and
  failure scenario through the same interface.
- **QR-004 — Event Reliability**: All critical journeys (idle → category → preview → confirm →
  landing → every published content option → back/idle) operate with public internet
  disconnected, using event-local content. Startup reaches idle without developer intervention.
  Soft reset, reload, restart, media recovery, renderer recovery, and console reconnect are
  operator-executable without development knowledge. Non-critical failures degrade gracefully;
  critical failures land in fallback landing or idle with no public technical output.
- **QR-005 — Content Integrity**: Category list, project set, content options, text, voiceover,
  media, framing, and availability are configurable data — never navigation-code changes. Limits
  (12×3 categories, mandatory Overview, max five options, explicit inactive positions) are
  enforced at validation and at runtime. Every published item is human-approved, source-
  traceable, rights-reviewed, and versioned, with staging/production separation, project-level
  update, rollback, and freeze demonstrated before the event build.
- **QR-006 — Presentation & Accessibility**: Compositions are designed and verified for the
  event LED at its native resolution and expected viewing distance: large readable typography,
  strong contrast, concise text, and clear project identity. Essential meaning never depends on
  colour alone or on motion alone; no rapid flashing. The public surface never shows menus,
  instructions, diagnostics, browser chrome, errors, or operator controls, and remains fully
  operable through console semantic actions only.
- **QR-007 — Performance & Resources**: Measured on the event playback hardware at native LED
  resolution with worst-case published content: the first visible response to every console
  action begins within a hard, release-blocking 250 ms budget, frame pacing remains
  stable through transitions and video, renderer handovers show no black or stale frames, and a
  continuous full-event-day run (including hundreds of category/project changes and repeated
  video/replay cycles) shows no progressive memory growth, frame-rate decline, or resource
  exhaustion. Large assets carry documented budgets and fallback quality levels.
- **QR-008 — Observability & Security**: A hidden operator interface — activated only through a
  concealed button combination or specific input sequence that is not discoverable in normal
  public use (no credential required) — exposes current state, category, preview/selection,
  active content, sequence progress, voiceover/video status, console health, last semantic
  action, renderer status, performance health, asset failures, and reset/recovery/simulation
  controls — fully separated from the public surface. Console actions and published content are
  treated as untrusted input and validated. No credentials, editing functions, arbitrary
  URLs/files, or technical information are reachable from the public experience.
  Logging/analytics failures never affect public operation.
- **QR-009 — Verification Evidence**: Release readiness requires repeatable evidence for: state
  legality and interruption from every major state; sequence opening/final/replay/cleanup
  behaviour; duplicate/invalid/burst input handling; disconnection/reconnection; every project
  landing, content option, voiceover, final frame, replay, and back path (36-project release
  checklist); offline-critical operation; large-format legibility review; and a full-day
  endurance run on representative hardware. Automated tests cover state, input, and sequence
  logic; documented repeatable procedures cover visual, geographic, media, and endurance
  validation where automation is impractical.

### Key Entities

- **Category**: One of 12 configurable award categories; owns exactly three finalist projects
  and an ordered first-preview project.
- **Project**: A finalist entry with identity (name, organisation, country, location), category
  membership, geographic scope and framing, marker representation, up to five content options,
  and readiness/approval status.
- **Content Option**: A visitor-selectable story occupying one of five fixed positions
  (position 1 = mandatory Project Overview); carries visitor-facing title (console-only),
  format(s), sequence definition, display text, voiceover asset, media references, geographic
  treatment, final-frame definition, and availability flag.
- **Content Sequence / Beat**: The ordered, timed steps of a content option (title, visuals,
  camera moves, text, media, metric reveals, final composition) with declared opening state,
  timing model, and final frame.
- **Media Asset**: Image, video, image sequence, diagram, 3D/geographic asset, or motion
  graphic with source, rights status, review status, resolution/quality attributes, and
  fallback.
- **Voiceover Asset**: Pre-generated approved narration audio mapped to exactly one content
  option, with its separately versioned script.
- **Geographic Framing**: A project's approved preview emphasis and landing composition,
  including scope type (point/site/corridor/region/network/multi-location) and any boundaries,
  routes, or highlighted regions.
- **Semantic Console Action**: A validated, transport-independent input event (category select,
  hover change, project select, content select, back, idle, reset, operator command) with
  priority class and dedup identity.
- **Submission**: Source material for a project (primarily from ClickUp): text, attachments,
  metrics, product references, contacts; the traceability root for all derived content.
- **Draft Analysis / Proposed Option**: AI-produced editorial material linked to source
  passages, always in draft status until human-approved.
- **Release / Publication**: A versioned, validated, approved content set consumed by the live
  experience; supports staging/production separation, project-level updates, rollback, and
  freeze.
- **Interaction Event**: A logged navigation, playback, connection, failure, or recovery event
  used for diagnostics and post-event analytics.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the 36 finalist projects are reachable, previewable with correct metadata,
  and openable to an approved geographic landing through console actions alone.
- **SC-002**: First visible response to every console action (hover, selection, content,
  navigation) begins within 250 ms, measured in release validation on event hardware; exceeding
  this budget is release-blocking. Visitors never see buffering, black frames, or unloaded
  geographic content during normal operation.
- **SC-003**: In release validation, 100% of project confirmations and back-navigations complete
  the concealed transition without black frames, visible loading, or evident renderer switching.
- **SC-004**: 100% of published content options play their full automatic sequence with
  voiceover, hold a defined final frame indefinitely, and replay from an identical opening
  state on deliberate re-press.
- **SC-005**: In the input test suite, 0 unintended restarts or state changes result from
  duplicate/burst signals, invalid slots, unknown commands, or out-of-order messages, while
  100% of deliberate replay presses succeed.
- **SC-006**: Every public action and required failure scenario (disconnection, reconnection,
  rapid wheel movement, duplicates) can be fully exercised through the hidden simulator with
  the physical console absent.
- **SC-007**: All critical visitor journeys complete successfully with public internet
  disconnected for the entire test session.
- **SC-008**: A continuous run covering the full event day (including at least several hundred
  category/project changes and repeated video/replay cycles) completes with stable frame
  pacing and no progressive memory growth or required restarts.
- **SC-009**: An event operator can perform startup to idle, soft reset, recovery from a forced
  media failure, and console reconnect using documented procedures only — each in under
  2 minutes and without developer assistance.
- **SC-010**: 0 instances of menus, instructions, diagnostics, browser chrome, error text, or
  operator controls appear on the public LED across the full release-validation pass.
- **SC-011**: 100% of published projects pass the release checklist (correct identity, approved
  Overview, ≤ 5 options, approved text/voiceover/media/framing, verified metrics, verified
  replay and back navigation), and 0 unapproved or AI-draft items are present in the production
  content set.
- **SC-012**: Draft story proposals with source traceability exist for all 36 submissions before
  editorial production begins, and every published claim and metric is traceable to source
  material.

## Assumptions

- The working category list in the PRD is used until the official YII source is confirmed; the
  list remains configurable up to content lock.
- Content position 1 is reserved for Project Overview on the console; the team may revisit the
  physical mapping without affecting the five-position model.
- The event experience is single-language (English) for the first release; captions are not
  included in v1 but must not be architecturally precluded.
- Voiceover is produced through an approved text-to-speech workflow before the event; the live
  runtime never calls a speech service (local pre-generated audio only).
- "Full event day" endurance is assumed to be at least 12 continuous hours until event
  operations confirm the exact schedule.
- The physical console will eventually provide separate hover and select signals and five
  content buttons as described; until then the simulator is the reference input device.
- ClickUp is the primary submission source; the ingestion method (export, API, or manual) is a
  planning decision and does not change the workflow requirements.
- Ambient event audio is fully external; the experience produces only voiceover (and approved
  embedded media audio) on its own output.
- Analytics are collected locally at the event and analysed afterwards; no real-time public
  dashboards are required.
- One LED wall and one playback machine constitute the public deployment; the operator
  interface may run on the same machine or a secondary display, decided in planning.
