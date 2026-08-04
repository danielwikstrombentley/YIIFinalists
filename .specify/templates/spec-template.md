# Feature Specification: [FEATURE NAME]

**Feature Branch**: `[###-feature-name]`

**Created**: [DATE]

**Status**: Draft

**Input**: User description: "$ARGUMENTS"

## Scope & Boundaries *(mandatory)*

### In Scope

- [Externally observable capability or outcome included in this feature]

### Out of Scope

- [Explicitly excluded product behaviour or responsibility]

### Open Decisions & Dependencies

<!--
  Record unresolved product decisions and external dependencies that affect behaviour or
  acceptance. Do not select implementation technologies, protocols, providers, storage,
  renderer mounting, animation packages, AI services, or publishing mechanisms here.
-->

- [Open product decision or dependency, its owner, and when it must be resolved]

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.

  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - [Brief Title] (Priority: P1)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently - e.g., "Can be fully tested by [specific action] and delivers [specific value]"]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]
2. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 2 - [Brief Title] (Priority: P2)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 3 - [Brief Title] (Priority: P3)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

[Add more user stories as needed, each with an assigned priority]

### Edge Cases

<!--
  Include every applicable boundary, interruption, failure, and recovery class. Remove examples
  that genuinely do not apply only after recording the rationale in the Constitution Check.
-->

- What happens when a higher-priority navigation or safety action interrupts each long-running
  state or sequence?
- How are duplicate, invalid, stale, out-of-order, or burst actions handled?
- What opening state is restored for replay, and what final composition remains held?
- What known visual destination follows media, asset, renderer, or external-dependency failure?
- What happens during console disconnection, reconnection, and rapid project-preview changes?
- How are unavailable content positions and unapproved or malformed content rejected safely?

## Constitution Check *(mandatory)*

<!--
  Review every area. Mark it Applicable and link concrete requirement and acceptance-scenario IDs,
  or mark it Not Applicable with a feature-specific rationale. Express WHAT is observable here;
  implementation mechanisms belong in the plan. No blank or generic applicability claims remain
  in a completed specification.
-->

| Principle Area | Applicability & Rationale | Linked Requirements / Acceptance Scenarios |
|----------------|---------------------------|--------------------------------------------|
| Deterministic state and interruption safety | [Applicable / Not Applicable — why] | [FR/QR and scenario IDs] |
| Motion and sequence orchestration | [Applicable / Not Applicable — why] | [FR/QR and scenario IDs] |
| Protocol-independent semantic input | [Applicable / Not Applicable — why] | [FR/QR and scenario IDs] |
| Local-first event reliability and recovery | [Applicable / Not Applicable — why] | [FR/QR and scenario IDs] |
| Reusable, validated content architecture | [Applicable / Not Applicable — why] | [FR/QR and scenario IDs] |
| Cinematic, console-owned, accessible presentation | [Applicable / Not Applicable — why] | [FR/QR and scenario IDs] |
| Human approval and content traceability | [Applicable / Not Applicable — why] | [FR/QR and scenario IDs] |
| Measured performance and resource ownership | [Applicable / Not Applicable — why] | [FR/QR and scenario IDs] |
| Verification, observability, and secure operation | [Applicable / Not Applicable — why] | [FR/QR and scenario IDs] |

## Requirements *(mandatory)*

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right functional requirements.
-->

### Functional Requirements

- **FR-001**: System MUST [specific capability, e.g., "allow users to create accounts"]
- **FR-002**: System MUST [specific capability, e.g., "validate email addresses"]
- **FR-003**: Users MUST be able to [key interaction, e.g., "reset their password"]
- **FR-004**: System MUST [data requirement, e.g., "persist user preferences"]
- **FR-005**: System MUST [behavior, e.g., "log all security events"]

*Example of marking unclear requirements:*

- **FR-006**: System MUST authenticate users via [NEEDS CLARIFICATION: auth method not specified - email/password, SSO, OAuth?]
- **FR-007**: System MUST retain user data for [NEEDS CLARIFICATION: retention period not specified]

### Operational & Quality Requirements *(mandatory applicability review)*

<!--
  Replace each applicable prompt with a testable requirement and omit only when the Constitutional
  Alignment table contains a concrete Not Applicable rationale. Use additional QR identifiers as
  needed. Do not prescribe implementation mechanisms.
-->

- **QR-001 — State & Interruption**: [Define authoritative state, legal action priority,
  interruption destinations, failure destinations, and cleanup outcomes visible to users/operators]
- **QR-002 — Sequence & Replay**: [Define opening state, completion, final-frame hold, timing and
  synchronization tolerance, interruption, replay, reset, and failure behaviour]
- **QR-003 — Input Reliability**: [Define semantic actions, validation, duplicate/burst handling,
  disconnection/reconnection, rapid retargeting, and simulator scenarios]
- **QR-004 — Event Reliability**: [Define event-local critical operation, external-dependency
  fallback, startup, reset, recovery, and graceful degradation]
- **QR-005 — Content Integrity**: [Define configurability, content limits, validation, approval,
  source/rights traceability, versioning, staging, and rollback outcomes]
- **QR-006 — Presentation & Accessibility**: [Define target viewing conditions, legibility,
  contrast, non-colour-dependent meaning, safe/reduced motion, console-only operation, and no
  public diagnostics]
- **QR-007 — Performance & Resources**: [Define representative hardware, target resolution,
  response/frame/memory budgets, repeated-use stability, cleanup, fallback quality, and endurance]
- **QR-008 — Observability & Security**: [Define operator diagnostics and recovery controls,
  public/operator separation, untrusted-input handling, credential protection, and non-blocking
  logging/analytics]
- **QR-009 — Verification Evidence**: [Identify automated or repeatable evidence required for every
  affected acceptance criterion and release-validation path]

### Key Entities *(include if feature involves data)*

- **[Entity 1]**: [What it represents, key attributes without implementation]
- **[Entity 2]**: [What it represents, relationships to other entities]

## Success Criteria *(mandatory)*

<!--
  ACTION REQUIRED: Define measurable success criteria.
  These must be technology-agnostic and measurable.
  Include applicable interruption, recovery, accessibility, performance, repeated-use, and
  operational outcomes. Name the representative environment and threshold without prescribing the
  implementation.
-->

### Measurable Outcomes

- **SC-001**: [Measurable metric, e.g., "Users can complete account creation in under 2 minutes"]
- **SC-002**: [Measurable metric, e.g., "System handles 1000 concurrent users without degradation"]
- **SC-003**: [User satisfaction metric, e.g., "90% of users successfully complete primary task on first attempt"]
- **SC-004**: [Business metric, e.g., "Reduce support tickets related to [X] by 50%"]

## Assumptions

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right assumptions based on reasonable defaults
  chosen when the feature description did not specify certain details.
-->

- [Assumption about target users, e.g., "Users have stable internet connectivity"]
- [Assumption about scope boundaries, e.g., "Mobile support is out of scope for v1"]
- [Assumption about data/environment, e.g., "Existing authentication system will be reused"]
- [Dependency on existing system/service, e.g., "Requires access to the existing user profile API"]
