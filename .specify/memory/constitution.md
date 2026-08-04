<!--
Sync Impact Report
- Version change: unratified template -> 1.0.0
- Modified principles: None (initial ratification).
- Added principles:
	- I. Deterministic State and Interruption Safety
	- II. Deterministic Motion and Sequence Orchestration
	- III. Protocol-Independent Semantic Input
	- IV. Local-First Event Reliability
	- V. Content-Driven Reusable Architecture
	- VI. Cinematic, Console-Owned, Accessible Presentation
	- VII. Human Authority and Content Traceability
	- VIII. Measured Performance and Explicit Resource Ownership
	- IX. Verification, Observability, and Secure Operation
- Added sections: Architecture Constraints; Quality Gates; Development and Review Rules.
- Removed sections: None.
- Templates requiring updates:
	- ✅ .specify/templates/plan-template.md — explicit constitutional gate and evidence review.
	- ✅ .specify/templates/spec-template.md — scope, applicability, and quality requirements.
	- ✅ .specify/templates/tasks-template.md — mandatory verification and release-gate work.
- Installed command guidance:
	- ✅ .github/agents/speckit.specify.agent.md — constitution applicability required.
	- ✅ .github/agents/speckit.plan.agent.md — gate evidence and exception handling required.
	- ✅ .github/agents/speckit.tasks.agent.md — verification is no longer optional when mandated.
	- ✅ Remaining installed Spec Kit agent and prompt files reviewed; no changes required.
- Runtime guidance:
	- ✅ Docs/YII_2026_Interactive_LED_Experience_PRD.md reviewed as authoritative product context;
		no change required.
- Follow-up TODOs: None.
-->
# YII 2026 Interactive LED Experience Constitution

## Core Principles

### I. Deterministic State and Interruption Safety

- The public experience MUST be governed by an explicit state machine with named states,
	validated events, legal transitions, guards, and deterministic entry and exit behaviour.
- Application state MUST have one authoritative owner. React component state, animation
	timelines, media callbacks, renderer callbacks, and console transports MUST NOT independently
	determine the active experience state.
- The application MUST allow no more than one active category, previewed project, selected project,
  content option, content sequence, voiceover, and relevant media playback at a time.
- Every asynchronous operation associated with a state MUST be owned by that state or by an
	explicitly documented parent scope.
- Leaving a state MUST cancel or complete its owned camera movements, animations, renderer
	operations, media playback, timers, subscriptions, callbacks, and asset requests according to
	a defined exit policy.
- Cancellation and cleanup MUST be idempotent. Repeated cancellation MUST leave the application
	in the same valid state without errors or residual effects.
- Emergency reset, return to idle, category selection, and other designated safety or navigation
	actions MUST pre-empt lower-priority activity.
- Invalid commands, unsupported state jumps, stale callbacks, late asynchronous completions, and
	duplicate completion events MUST be rejected or ignored safely.
- Every transition MUST define its successful destination, interruption destination, failure
	destination, and cleanup responsibilities.
- Failures MUST recover to a known visual state without exposing a blank screen, browser error,
	development information, stale content, or technical diagnostics to visitors.

**Rationale**: The installation is continuously operated through external hardware and must
remain responsive while complex asynchronous presentation systems are running.

### II. Deterministic Motion and Sequence Orchestration

- All multi-step motion MUST run through one application-owned sequence orchestration boundary.
- The application SHOULD use one default general-purpose animation engine to avoid competing
	control models. Subsystem-native animation APIs, including Cesium camera flights, MAY be used
	only through adapters controlled by the same orchestration boundary.
- The animation engine MUST NOT own application state. Timelines and callbacks MAY report
	progress or completion to the state machine, but MUST NOT independently initiate unsupported
	state transitions.
- Every animation, camera movement, renderer handover, audio item, video item, timer, callback,
	and automatic content sequence MUST expose explicit start, completion, cancellation, replay,
	reset, and cleanup behaviour.
- Every sequence MUST define a known opening state, final held state, interruption state, and
	failure state.
- Sequence replay MUST restore the complete opening state before playback, including visual
	properties, camera framing, media position, voiceover, timing, renderer effects, and temporary
	overlays.
- Sequence choreography MUST NOT be implemented as unowned chains of `setTimeout()`, delayed
	callbacks, unrelated React effects, or independent animation loops.
- Each content sequence MUST declare its timing model and authoritative timebase. Visual beats,
	camera movement, video, and voiceover MUST remain within synchronization tolerances defined by
	the applicable specification or plan after frame drops, interruption, replay, and recovery.
- Cesium camera movement MUST be accessed through an adapter supporting native completion and
	cancellation. A general-purpose animation engine MUST NOT mutate the Cesium camera concurrently
	with a native Cesium camera flight.
- Rapid project-preview input MUST cancel or retarget existing globe movement without queuing
	obsolete camera destinations.
- Renderer handovers MUST prevent black frames, stale frames, visible unloaded scenes, and
	simultaneous uncontrolled rendering states.
- Project-specific sequences SHOULD be composed from reusable, validated, data-driven steps to
	preserve consistent cancellation and replay; bespoke effects require a documented exception.
- Timing values, easing curves, transition durations, motion tokens, and final-frame rules SHOULD
	be centrally defined to prevent contradictory behaviour; intrinsically local values MAY remain
	local only when their ownership and rationale are documented.
- Essential meaning MUST remain understandable without rapid movement, flashing, or animation
	alone.
- Non-essential motion MUST provide an approved reduced-motion or operator-safe fallback whenever
	required by an applicable accessibility, design, or operations requirement.
- Selection of an animation library MUST be recorded as an architecture decision containing the
	alternatives considered, React integration, supported targets, cancellation semantics, cleanup
	behaviour, media synchronization, performance evidence, license, versioning policy, and rollback
	strategy.

**Rationale**: Motion is a core product capability, but reliability depends on central ownership,
deterministic timing, interruption, and cleanup rather than on any particular animation package.

### III. Protocol-Independent Semantic Input

- Product logic MUST consume validated semantic actions rather than transport-specific messages.
- MIDI, OSC, MQTT, WebSocket, serial communication, and future transports MUST be isolated behind
	replaceable input adapters.
- Transport adapters MUST NOT contain experience-navigation logic.
- The semantic input contract MUST represent category selection, project preview change, project
	confirmation, content selection, back to project preview, return to idle, reset, connection
	status, and approved operator actions.
- Incoming actions MUST be validated before they reach the state machine.
- Deduplication, debounce, hardware-bounce filtering, message validation, ordering policy,
	connection monitoring, and reconnection MUST occur at the input boundary or another explicitly
	documented shared input layer.
- The system MUST distinguish deliberate content replay from accidental duplicate or burst input.
- Input priority MUST be explicit and testable. Safety and global-navigation actions MUST outrank
	content and hover actions.
- The operator simulator MUST use the same semantic action interface as the physical console.
- The simulator MUST support every public action and required failure scenario, including
	duplicates, invalid actions, rapid wheel movement, disconnection, reconnection, and interruption
	during transitions.

**Rationale**: The final hardware protocol is undecided and may change without altering the
experience model.

### IV. Local-First Event Reliability

- Essential public operation MUST NOT depend on public internet access or a live external service.
- Approved project data, display text, voiceover, images, video, fonts, required custom 3D assets,
	motion assets, and critical fallbacks MUST be available locally or through event-local
	infrastructure.
- Live generative AI, live text summarization are prohibited in the
	public runtime. Live text-to-speech calls to eleven labs could be approved, but local is prefered.
- Required third-party geographic services MUST have documented availability assumptions, failure
	handling, and an approved fallback strategy.
- The application MUST support low-touch startup, entry into a known idle state, soft reset,
	renderer recovery, media recovery, console reconnection, reload, and full restart.
- Recovery procedures MUST be executable by an event operator without specialist development
	knowledge.
- A non-critical asset failure MUST degrade gracefully, log the problem, and preserve navigation.
- A critical failure MUST return the presentation to a controlled fallback, safe project landing,
	or idle state.
- Console disconnection MUST NOT crash or corrupt the active presentation.
- Logging, monitoring, and analytics MUST never block navigation, media, rendering, reset, or
	recovery.

**Rationale**: The application must operate continuously during a live event where network access
and external services cannot be assumed.

### V. Content-Driven Reusable Architecture

- The experience MUST represent finalist projects through validated content and reusable
	presentation capabilities rather than separate application forks.
- The category list, project identities, geographic framing, content options, display text,
	voiceover, media, sequence definitions, and availability MUST be configurable.
- The approved event release MUST support 12 categories, exactly three finalists per category,
	and 36 finalists in total.
- Every published project MUST contain an approved Project Overview.
- A public project MUST NOT expose more than five content options.
- Unavailable content positions MUST be represented explicitly and ignored safely when selected.
- Ordinary editorial changes, media replacement, voiceover replacement, geographic adjustments,
	and project-level updates MUST NOT require changes to core navigation logic.
- Live presentation, content preparation, review, validation, publishing, and release delivery
	MUST be separated through explicit contracts.
- The production live application MUST consume only validated, approved, versioned content.
- Publishing MUST support staging and production separation, project-level updates, rollback,
	content freeze, and reproducible event builds without prescribing the underlying infrastructure.
- Project-specific application code requires a documented exception demonstrating why an existing
	or new reusable capability cannot represent the requirement.

**Rationale**: Thirty-six distinctive stories must remain maintainable without creating
thirty-six independent applications.

### VI. Cinematic, Console-Owned, Accessible Presentation

- The LED wall is a cinematic storytelling surface, and the physical console owns public
	navigation.
- The public LED presentation MUST NOT expose content menus, button instructions, browser chrome,
	editor controls, operator controls, credentials, arbitrary URLs, stack traces, or technical
	diagnostics.
- Visual compositions MUST prioritize large-format legibility, strong hierarchy, concise text,
	geographic context, immediate feedback, and stable framing.
- Project identity and critical meaning MUST remain clear at the viewing distance and LED
	resolution defined by the applicable specification or release plan.
- Essential meaning MUST NOT depend on colour alone.
- Motion MUST avoid rapid flashing and MUST remain understandable in a busy event environment.
- Transitions MUST be intentional, consistent with the approved motion language, and interruptible
	wherever the state and input-priority rules require.
- Renderer handovers and content changes MUST avoid black frames, stale frames, visible buffering,
	visibly unloaded geographic content, and abrupt technical discontinuities.
- Every automatic sequence MUST define a visually complete final frame that remains held until
	valid input is received.
- The public experience MUST remain fully operable through semantic console actions without
	pointer, keyboard, touch, or direct LED interaction.

**Rationale**: The product must feel like a premium installation rather than a website while
remaining legible, understandable, and safe.

### VII. Human Authority and Content Traceability

- AI-generated analysis, summaries, titles, scripts, recommendations, and media MUST remain draft
	material until explicitly approved by a human editor.
- AI-generated content MUST NOT publish directly to the live application.
- Display claims, metrics, geographic facts, voiceover, project outcomes, and media MUST be
	traceable to source material and review status.
- Unsupported, conflicting, or unverified claims MUST NOT be published.
- Editorial changes and approval state MUST remain auditable.
- Editors MUST be able to identify relevant source passages, attachment references, original
	wording, submitted metrics, and later revisions.
- Media MUST be reviewed for factual accuracy, rights, permissions, resolution, aspect ratio,
	relevance, technical performance, brand suitability, and approval status.
- AI-generated or AI-assisted media MUST be identified in the content workflow and MUST NOT
	misrepresent the real project.
- Approved display text and approved voiceover text MUST remain separately editable and versioned.
- The live runtime MUST consume only pre-generated and approved voiceover.

**Rationale**: AI accelerates preparation but cannot replace editorial, rights-management, or
factual accountability.

### VIII. Measured Performance and Explicit Resource Ownership

- Performance requirements MUST be measured on representative playback hardware at the target LED
	resolution.
- Performance decisions MUST account for the custom globe, Cesium, 3D Tiles, project overlays,
	images, video, audio, motion graphics, post-processing, and renderer handovers.
- Every renderer, WebGL resource, Cesium layer, tileset, 3D asset, video element, audio source,
	animation timeline, timer, subscription, event listener, object URL, and asynchronous request
	MUST have explicit ownership and cleanup.
- Per-frame animation MUST NOT rely on React state updates when a direct renderer, DOM,
	motion-value, or animation-engine update is more appropriate.
- The application MUST avoid duplicate `requestAnimationFrame` loops, competing tickers,
	unnecessary layout work, uncontrolled allocation, and simultaneous writers to the same animated
	property.
- Likely-next project and content assets SHOULD be preloaded to reduce input latency unless
	measurements show that preloading compromises current-state responsiveness or memory stability.
- Large assets MUST have documented budgets and fallback quality levels.
- The application MUST avoid repeatedly downloading, decoding, or allocating the same large assets
	during a session when safe reuse is possible.
- Repeated transitions, replay, project changes, and media playback MUST NOT cause progressive
	memory growth, frame-rate degradation, event-listener accumulation, or resource exhaustion.
- Production readiness MUST include full-day endurance testing on representative hardware using
	realistic worst-case content.

**Rationale**: A visually successful sequence is unacceptable if repeated execution causes
instability during the event.

### IX. Verification, Observability, and Secure Operation

- Every feature specification and implementation plan MUST define verifiable acceptance criteria
	derived from relevant product requirements and constitutional principles.
- State transitions, command priority, interruption, replay, duplicate input, invalid input,
	disabled content, disconnection, reconnection, media failure, renderer failure, and recovery MUST
	have automated tests or documented repeatable verification where automation is impractical.
- Motion-heavy features MUST verify opening state, completion, final-frame hold, interruption at
	representative points, rapid retargeting, replay, cleanup, state restoration, and repeated
	execution.
- Applicable plans MUST include functional, integration, geographic, media, accessibility,
	performance, recovery, and endurance testing.
- Every project landing, content option, voiceover, media asset, geographic framing, final frame,
	replay path, and back-navigation path MUST pass release validation.
- A hidden operator interface MUST expose current application state, active category, previewed
	project, selected project, active content, sequence progress, voiceover status, video status,
	console health, last semantic action, renderer status, performance health, asset failures, and
	recovery controls.
- Public and operator interfaces MUST remain clearly separated.
- Incoming console actions and published content MUST be validated as untrusted input.
- Operator controls MUST be hidden or protected from public use.
- Credentials, tokens, arbitrary local files, arbitrary remote URLs, editing functions, and
	technical information MUST NOT be exposed through the public experience.
- Analytics and logging failures MUST NOT affect public operation.

**Rationale**: A live installation requires public simplicity and sufficient internal visibility
to diagnose and recover from failure.

## Architecture Constraints

- React and CesiumJS are agreed foundations.
- A custom non-Cesium globe provides idle, category-selection, and project-preview presentation.
- Cesium provides selected-project geographic landing and project-storytelling presentation.
- The explicit experience state machine is the sole source of truth for public navigation state.
- Motion and media execution are coordinated through an application-owned sequence orchestration
	boundary.
- One default general-purpose animation engine SHOULD be selected during technical planning to
	maintain a single control model. This constitution does not mandate GSAP, Anime.js, Motion, or
	another package.
- Cesium camera movement, custom-globe movement, DOM animation, audio, video, and renderer handover
	remain subsystem capabilities accessed through cancellable adapters.
- Renderer implementation, animation engine, input transport, backend, content storage, publishing
	architecture, analytics storage, and deployment provider remain replaceable behind explicit
	boundaries until separately decided.
- Public runtime and content preparation or publishing are separate operational concerns.
- Project-specific behaviour SHOULD be data-driven to preserve reuse; deviation is acceptable only
	through the documented exception process when a reusable capability is demonstrably unsuitable.
- Transport-specific messages MUST terminate at the input adapter boundary.
- Unapproved editorial or AI-preparation data MUST NOT cross into the production runtime content
	boundary.

## Quality Gates

Every applicable implementation plan and production release MUST record evidence for these gates:

1. State-machine legality, ownership, command priority, interruption, failure, and recovery.
2. Sequence opening state, final state, cancellation, replay, reset, timing, media synchronization,
	 and idempotent cleanup.
3. Animation-engine and Cesium integration without competing camera writers, tickers, render
	 loops, or stale callbacks.
4. Protocol independence, semantic-action validation, deduplication, and simulator coverage.
5. Offline or event-local operation for critical assets and approved fallback behaviour for
	 external dependencies.
6. Content validation, human approval, source traceability, metric verification, media rights,
	 versioning, and rollback.
7. Large-format legibility, contrast, non-colour-dependent meaning, safe motion, and approved
	 final-frame behaviour.
8. Performance budgets, frame-time measurement, memory stability, resource cleanup, worst-case
	 content testing, and endurance evidence.
9. Operator diagnostics, public/operator separation, reset and recovery paths, and secure handling
	 of inputs, credentials, and content.
10. Verification evidence for every affected acceptance criterion.

A gate MAY be marked not applicable only with a concrete rationale. A failed mandatory gate MUST
block production release unless a formal, time-bounded exception is approved under Governance.

## Development and Review Rules

- Feature specifications MUST describe externally observable behaviour and acceptance criteria
	without prematurely selecting implementation details.
- Technical plans MUST document architecture boundaries, state ownership, sequence ownership,
	cancellation semantics, resource ownership, failure handling, testing, and operational recovery.
- Tasks MUST include the testing, diagnostics, content validation, performance, accessibility,
	cleanup, and operational work required by this constitution.
- New third-party runtime dependencies MUST have a documented purpose, maintenance status, license,
	version policy, offline impact, performance impact, failure mode, and removal or replacement
	strategy.
- A second general-purpose animation engine MUST NOT be introduced without an architecture decision
	that establishes a strict ownership boundary and proves the existing engine cannot satisfy the
	requirement.
- Native subsystem animation MAY be used where it provides required domain behaviour, but MUST
	remain controlled by the central sequence orchestrator.
- Temporary prototypes MAY relax production architecture only when clearly isolated, excluded from
	production builds, and accompanied by explicit evaluation criteria.

## Governance

- This constitution governs all specifications, implementation plans, tasks, tests, reviews,
	releases, and operational procedures.
- Detailed product behaviour remains governed by approved specifications and the PRD; this
	constitution defines cross-cutting engineering and product-integrity rules.
- Every specification, plan, pull request, and release review MUST include a Constitution Check
	covering all applicable principles and quality gates.
- Compliance claims MUST cite concrete design decisions, tests, measurements, validation output,
	or operational evidence. Unsupported statements of compliance are insufficient.
- Any exception requires a documented decision containing:
	- The exact rule being waived.
	- The business or technical rationale.
	- The responsible owner.
	- Affected requirements and components.
	- Risks and user impact.
	- Mitigations.
	- Fallback and recovery plan.
	- Approval authority.
	- Expiration or review date.
	- Removal or remediation plan.
- Exceptions MUST be narrow, time-bounded, reviewable, and visible in release documentation.
- Constitutional amendments require impact analysis across existing specifications, plans,
	templates, implementation, tests, content workflows, and operations.
- Constitution versions MUST follow semantic versioning:
	- MAJOR for removal or incompatible redefinition of a principle or governance rule.
	- MINOR for a new principle, section, quality gate, or materially expanded obligation.
	- PATCH for clarification, wording improvements, or non-semantic corrections.
- The ratification date MUST remain the original adoption date.
- The last-amended date MUST change whenever constitutional content changes.
- Production releases MUST NOT proceed with unexplained constitutional violations.

**Version**: 1.0.0 | **Ratified**: 2026-08-03 | **Last Amended**: 2026-08-03
