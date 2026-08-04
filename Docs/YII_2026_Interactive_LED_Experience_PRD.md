# YII 2026 Interactive LED Experience — Product Requirements Document

**Document status:** Draft for product and design alignment  
**Version:** 0.1  
**Date:** 31 July 2026  
**Primary product surface:** Large-format LED wall web application  
**Supporting surface:** Content ingestion, AI-assisted content preparation, review, and publishing workflow  
**Target stack already agreed:** React + CesiumJS  
**Control method:** External fabricated console table; final transport protocol remains undecided

---

## 1. Executive Summary

The YII 2026 Interactive LED Experience is a large-format, single-user, interactive storytelling application designed for display on a large LED wall at the Year in Infrastructure event.

The LED wall application is controlled entirely from a separately fabricated physical console table. The console allows a visitor to:

1. Select one of 12 YII award categories.
2. Preview one of three finalist projects within that category.
3. Confirm a project selection.
4. Explore up to five project-specific content stories.
5. Return to the project preview state, choose another project, choose another category, or return to idle.

The experience is built around two visual environments:

- A custom, highly cinematic, non-Cesium globe used during idle, category selection, and project preview.
- A CesiumJS geographic environment used after a project is selected, serving as the canvas for project-specific storytelling.

Each finalist project has a geographical representation and up to five content options. “Project Overview” is always present and counts as one of the five. The remaining content options are determined from the project submission material and should explain what is distinctive, technically important, visually compelling, or impactful about the project.

Project submissions will primarily be sourced from ClickUp. An AI-assisted content preparation workflow will analyse each submission, identify meaningful story themes, categorise supporting text, recommend content options, suggest appropriate media treatments, and prepare structured draft content for human review. The live event application must never depend on live AI generation during use.

This PRD describes the complete product behaviour and feature scope. It intentionally does not decide backend architecture, detailed data schemas, transport protocols, database technology, content-management implementation, or final infrastructure.

---

## 2. Product Vision

Create a premium, museum-quality interactive experience that transforms YII finalist submissions into short, visually rich project stories.

The experience should feel:

- Cinematic rather than website-like.
- Deliberate rather than menu-driven.
- Geographic and global in scale.
- Clear enough to operate through a physical console without instructions on the LED wall.
- Flexible enough to represent 36 different projects without building 36 separate applications.
- Reliable enough to run continuously during a major live event.
- Easy to update as project assets and editorial content change.

The LED wall should function as the storytelling surface, while the console functions as the control surface.

---

## 3. Product Goals

### 3.1 Primary goals

The product must:

- Present all 36 YII finalist projects across 12 categories.
- Allow a visitor to move from category selection to project preview, project selection, and project storytelling.
- Represent every project geographically.
- Give each project a distinctive narrative based on its submission.
- Support up to five content options per project.
- Use Project Overview as a consistent content option across all projects.
- Combine geographic storytelling with images, video, text, metrics, diagrams, timelines, 3D content, and other visual formats.
- React reliably to signals from the physical console.
- Remain independent of the final console communication protocol.
- Run as a polished, full-screen installation experience on a large LED.
- Continue operating even if internet access is unreliable or temporarily unavailable.
- Support last-minute content updates without requiring major application redevelopment.

### 3.2 Secondary goals

The product should:

- Encourage exploration of multiple categories and projects.
- Make the geographic scale of YII visible.
- Communicate complex infrastructure stories in a concise, accessible way.
- Allow the project team to use AI to accelerate editorial preparation without reducing human control.
- Allow testing and operation before the physical console is available.
- Provide internal diagnostics and recovery tools without exposing them to event visitors.
- Capture useful interaction data for post-event analysis.

---

## 4. Non-Goals

The following are outside the scope of this PRD unless later added:

- The industrial design or fabrication specification of the physical console.
- The physical behaviour, lighting, labelling, mechanics, or display technology of console buttons, screens, wheels, switches, or indicators.
- The final hardware communication protocol.
- The external ambient music system.
- Multi-user interaction.
- Direct touch, pointer, keyboard, or mouse interaction on the LED wall during public use.
- A general-purpose public website.
- A public CMS for arbitrary third-party users.
- Live generative AI output during the event experience.
- Automatically publishing unreviewed AI-generated summaries.
- A detailed backend architecture.
- A final data schema.
- A final database decision.
- A final deployment provider.
- A final media-server architecture.
- A final content authoring interface design.
- A guarantee that every project will use every supported content format.

---

## 5. Users and Stakeholders

### 5.1 Primary visitor

The primary visitor is an event attendee using the physical console to control the LED wall.

Characteristics:

- May have no prior knowledge of the project.
- May spend only a few minutes with the experience.
- May be surrounded by other visitors.
- Receives operational guidance from the console, not the LED.
- Expects immediate visual feedback from physical inputs.
- Should not need to understand the application structure.

### 5.2 Event operator

The event operator is responsible for starting, monitoring, resetting, and recovering the installation.

The operator needs:

- A clear indication that the application is running.
- A way to verify console connectivity.
- A way to simulate console commands.
- A way to reset the application.
- A way to recover from failed media or renderer states.
- A way to inspect current category, project, content, and playback state.
- A way to restart the application without specialist development knowledge.

### 5.3 Content editor or producer

The content editor prepares project stories before the event.

The editor needs:

- Access to submission text and attachments.
- AI-assisted recommendations for content sections.
- The ability to edit and approve all display text and voiceover text.
- The ability to assign or replace media.
- The ability to define geographic framing and project scope.
- The ability to preview the final experience.
- Validation warnings for missing or invalid content.
- A controlled publishing process.

### 5.4 Development and creative technology team

The development team needs:

- A deterministic state model.
- A protocol-independent input layer.
- Reusable content templates.
- Clear separation between live presentation and content preparation.
- Test and simulation tools.
- Logging and diagnostics.
- A maintainable way to support 36 projects and future content revisions.

### 5.5 UX, motion, and visual design teams

These teams need:

- A clear interaction hierarchy.
- Defined states and transitions.
- Known content limits.
- Known display constraints.
- A library of supported content treatments.
- Freedom to design content sequences without changing the core navigation model.

---

## 6. Product Scope

The product consists of two related areas.

### 6.1 Live LED wall application

The live application includes:

- Idle globe experience.
- Category activation.
- Project preview.
- Transition from custom globe to Cesium.
- Project landing.
- Project content playback.
- Automatic multi-step sequences.
- Voiceover playback.
- Return navigation.
- Console input handling.
- Asset loading and media playback.
- Error handling and recovery.
- Diagnostics and operator controls.
- Interaction logging.

### 6.2 Content preparation and publishing workflow

The supporting workflow includes:

- Retrieval of project submissions from ClickUp.
- Extraction of text and attachments.
- AI-assisted project analysis.
- Draft project summaries.
- Proposed content options.
- Categorisation of source text.
- Identification of metrics, claims, locations, organisations, Bentley products, project challenges, methods, and outcomes.
- Suggested visual treatments.
- Identification of missing assets.
- Human editing and approval.
- Voiceover script preparation.
- Geographic framing preparation.
- Preview and validation.
- Publishing approved content for use by the live application.

The content workflow may eventually be implemented as one interface, several tools, or a combination of services. This PRD defines what it must support, not how it must be built.

---

## 7. Core Information Structure

The live experience contains:

- 12 YII categories.
- 3 finalist projects per category.
- 36 finalist projects in total.
- Up to 5 content options per project.
- Project Overview as a mandatory option for every project.
- Between 0 and 4 additional project-specific options.

The official category names should be imported or maintained from the approved YII source. The working category list is:

1. Bridges and Tunnels
2. Cities and Facilities
3. Construction
4. Energy Production
5. Geospatial and Reality Modeling
6. Project Delivery
7. Rail and Transit
8. Roads and Highways
9. Structural Engineering
10. Subsurface Modeling and Analysis
11. Transmission and Distribution
12. Water and Wastewater

The category list must remain configurable because naming or editorial decisions may change before content lock.

---

## 8. Experience Principles

### 8.1 The LED is a cinematic canvas

The LED should not resemble a desktop website, dashboard, or nested menu system.

The experience should favour:

- Large-scale visual compositions.
- Smooth camera movement.
- Minimal on-screen interface chrome.
- Strong hierarchy.
- Short, focused text.
- Clear visual transitions.
- High-quality imagery and video.
- Geographic context.

### 8.2 The console owns navigation

The LED does not display instructions, button prompts, content menus, or navigation labels.

The console is responsible for communicating:

- Which category is active.
- Which project is being previewed.
- Which content options are available.
- Which controls can be pressed.

The LED is responsible for presenting the resulting state clearly.

### 8.3 One active selection at a time

The application is a single-user experience.

At any moment, there is only one:

- Active category.
- Previewed project.
- Selected project.
- Active content option.
- Active voiceover.
- Active content sequence.

### 8.4 Content is project-specific but structurally consistent

Every project can tell a different story, but the application should use reusable presentation capabilities and a predictable navigation structure.

### 8.5 The experience must be interruptible

Visitors should not become trapped in long transitions or content sequences.

Back, reset, category change, and new content selection must remain responsive according to the input rules defined later in this document.

---

## 9. End-to-End User Journey

### 9.1 Idle

The application begins in an idle state showing a custom, non-Cesium Earth.

All 36 finalist projects are represented as pins or equivalent geographic markers.

The globe should appear alive and premium through:

- High-resolution, hyper-realistic Earth textures.
- A separate animated cloud layer.
- A looping day and night cycle.
- Atmospheric rendering.
- Subtle continuous motion.
- Carefully controlled camera movement.
- High-quality lighting and shading.
- A seamless loop suitable for long periods without interaction.

No instructional UI appears on the LED.

Category controls remain available on the console.

### 9.2 Category selection

When the visitor selects a category:

1. The current experience is interrupted safely.
2. Any active content sequence ends.
3. Any active voiceover stops.
4. The application returns through the idle state, even if only briefly.
5. The newly selected category becomes active.
6. All finalist pins outside that category disappear.
7. The first project in the category becomes the automatically previewed project.
8. The custom globe moves to present that project.

The first project must also be treated as the active hovered project from the console perspective.

### 9.3 Project preview

The visitor uses a physical wheel knob to move between the three projects in the selected category.

One project is always in `PROJECT_PREVIEW`; there is no neutral three-project overview screen.

When a project is previewed, the LED displays:

- Project name.
- Organisation.
- Country.

The associated geographic marker is emphasised.

The globe remains viewed from space. Switching projects should:

- Move the camera.
- Rotate the globe as needed.
- Keep the Earth visible as a whole or near-whole presentation object.
- Bring the new project location into the intended composition.
- Update the project information.
- Avoid unnecessary zooming to surface level.

The transition between previewed projects should feel cinematic but remain fast enough for physical wheel interaction.

All projects outside the selected category remain hidden.

### 9.4 Project confirmation

When the visitor confirms the previewed project:

1. The selected project becomes fixed.
2. The application begins the transition from the custom globe to Cesium.
3. The target Cesium scene and relevant project assets are prepared.
4. The renderer transition is concealed.
5. The camera journey continues into the geographic project context.
6. The application arrives at the project landing state.

### 9.5 Concealed transition to Cesium

The custom globe and Cesium are visually distinct systems, but the visitor should experience them as one continuous journey.

The transition should use a visual concealment strategy such as:

- Rapid approach toward the atmosphere.
- Passing through clouds.
- Temporary atmospheric bloom or haze.
- Motion blur.
- Controlled darkness.
- A project-specific transition layer.
- Another full-frame visual treatment approved by the motion team.

The exact technique remains a design and engineering decision.

The transition must:

- Avoid black frames.
- Avoid exposing unloaded Cesium tiles.
- Avoid obvious renderer switching.
- Preserve geographic orientation where feasible.
- Continue smoothly into the project location.
- Be reversible when returning to project preview.

The return journey from Cesium to the custom globe uses the same transition language in reverse.

### 9.6 Project landing

After the Cesium camera arrives, the application enters `PROJECT_LANDING`.

This state shows a clean project hero view containing:

- Project name.
- Organisation.
- Location.
- The project’s geographic environment.
- Any approved project marker, boundary, corridor, highlighted region, or contextual graphic.

No project story is active yet.

No voiceover begins automatically.

The visitor must press one of the five physical content buttons to activate content.

### 9.7 Content selection

The console has five fixed physical content positions.

For each project:

- Position 1 should be reserved for Project Overview unless later changed by the team.
- Project Overview is always available.
- Positions 2 to 5 contain project-specific content options.
- A project may use fewer than five options.
- Unavailable positions are treated as inactive by the web application.
- Signals targeting inactive positions are ignored safely.
- The physical presentation of inactive positions is outside this PRD.

The content labels exist on the console only.

The LED does not display a content menu.

When a valid content position is selected:

1. Any current sequence is interrupted.
2. Any active voiceover stops.
3. The selected content title or story begins through its designed visual treatment.
4. The appropriate display text, media, Cesium movement, graphics, or sequence appears.
5. The associated voiceover begins automatically.
6. The content sequence continues without further user input unless interrupted.

### 9.8 Content completion

A content option may be:

- A single static composition.
- A single media item.
- A timed sequence.
- A sequence of several visual and geographic beats.

When the content finishes, the application holds on its final composition.

It does not automatically return to project landing.

The final frame remains until the visitor:

- Selects another content option.
- Replays the current content.
- Returns to project preview.
- Selects another category.
- Returns to idle.
- Triggers another supported navigation command.

### 9.9 Content replay

A deliberate second press of the currently active content button restarts that content from the beginning.

Replay must:

- Reset all sequence timing.
- Restore the intended opening visual state.
- Restart the voiceover.
- Reset videos or animations.
- Reset any Cesium camera path.
- Cancel any residual effects from the previous run.

Rapid repeated signals caused by hardware bounce or accidental duplication should be filtered and must not cause repeated restarts.

### 9.10 Back to project preview

When the visitor returns to projects:

1. Active voiceover stops.
2. Active media stops or resets.
3. The content overlay exits.
4. The application begins the concealed transition back to the custom globe.
5. The custom globe returns to the same project that was previously previewed.
6. That project remains in `PROJECT_PREVIEW`.
7. Its project name, organisation, and country are shown.
8. The visitor can rotate the physical wheel to another project or confirm the same project again.

There is never a three-project summary screen.

### 9.11 Category change from any state

Category controls are always available on the console.

A new category selection can occur during:

- Idle.
- Project preview.
- Transition.
- Project landing.
- Content playback.
- Final-frame hold.

When a new category is selected:

1. Current media and voiceover stop.
2. Current transitions or sequences cancel safely.
3. The application returns through idle.
4. The new category becomes active.
5. Only the three projects in the new category remain visible.
6. The first project is automatically previewed.
7. The globe presents the first project.

### 9.12 Return to idle

A dedicated return-to-idle action may be triggered from the console.

It must:

- Stop voiceover.
- Stop active media.
- Cancel project-specific animation.
- Clear active category, project, and content presentation.
- Restore all 36 finalist markers.
- Resume the idle globe loop.

There is no inactivity-based automatic reset.

All resets are triggered manually through console or operator input.

---

## 10. Application State Requirements

The product should support the following high-level states.

### 10.1 `IDLE`

Purpose:

- Present the global YII finalist landscape.
- Wait for category selection.

Visible behaviour:

- Custom Earth.
- All finalists visible.
- Day/night loop.
- Cloud animation.
- Subtle ambient motion.

### 10.2 `CATEGORY_TRANSITION`

Purpose:

- Exit the current state.
- Route through idle.
- Activate the new category.
- Remove unrelated project markers.
- Prepare the first project preview.

### 10.3 `PROJECT_PREVIEW`

Purpose:

- Present one of the three projects in the selected category.
- Respond continuously to physical wheel hover signals.

Visible behaviour:

- Space-level globe view.
- Active project marker.
- Project name.
- Organisation.
- Country.
- Other two category projects available through wheel movement.
- All other projects hidden.

### 10.4 `TRANSITION_TO_CESIUM`

Purpose:

- Prepare and reveal the geographic project environment.
- Conceal the renderer transition.

Possible internal phases:

- Preloading.
- Globe approach.
- Concealment.
- Renderer handover.
- Cesium approach.
- Final framing.

### 10.5 `PROJECT_LANDING`

Purpose:

- Present the selected project before story content begins.

Visible behaviour:

- Cesium project environment.
- Project name.
- Organisation.
- Location.
- No active content story.
- No narration.

### 10.6 `PROJECT_CONTENT`

Purpose:

- Play the selected project story.

Possible internal phases:

- Entering.
- Voiceover start.
- Playing sequence.
- Switching content.
- Holding final frame.
- Replaying.

### 10.7 `TRANSITION_TO_GLOBE`

Purpose:

- Exit the Cesium project environment.
- Conceal the renderer transition.
- Restore the previously previewed project on the custom globe.

### 10.8 `RESETTING`

Purpose:

- Stop all active systems.
- Restore a known state.
- Return safely to idle.

### 10.9 `ERROR`

Purpose:

- Maintain a controlled visual output when content, media, renderer, input, or network failures occur.
- Avoid exposing browser errors, blank screens, or development information.

The exact state-machine implementation remains open, but the visible behaviour described above is required.

---

## 11. Input and Console Integration Requirements

### 11.1 Protocol independence

The physical table may use MIDI, OSC, MQTT, WebSocket, serial communication, or another transport.

The application must not make its experience logic dependent on one specific transport.

The console integration must be able to express semantic actions including:

- Category selected.
- Project preview changed.
- Project selected.
- Content position selected.
- Back to project preview.
- Return to idle.
- Reset.
- Optional operator commands.

The exact signal names, payloads, transport, and network topology will be decided later.

### 11.2 Hover and selection are separate

The console provides separate project hover and project selection signals.

Hover:

- Is continuous.
- Comes from a physical wheel.
- Always identifies one of the three projects.
- Updates `PROJECT_PREVIEW`.

Selection:

- Confirms the currently previewed project.
- Begins the transition to Cesium.

### 11.3 Input priority

The application must prioritise navigation and safety actions.

Recommended priority order:

1. Emergency reset.
2. Return to idle.
3. Category selection.
4. Back to project preview.
5. Project selection.
6. Content selection or replay.
7. Project hover changes.

The final priority rules can be refined during implementation, but the application must not become unresponsive during long content or camera sequences.

### 11.4 Interruptibility

The application should allow:

- Category change during any long transition.
- Return to idle during any long transition.
- Back to project preview from project landing or content.
- New content selection during content playback.
- Replay after content has begun or completed.

Very short transitions may temporarily reject lower-priority inputs to avoid visual corruption.

### 11.5 Duplicate filtering

The input layer must distinguish between:

- A deliberate repeated selection.
- Hardware bounce.
- Network duplication.
- Rapid accidental repeated messages.

The active content may be deliberately replayed, but unintentional bursts must not produce repeated restarts.

### 11.6 Connection monitoring

The application must be able to determine whether it is receiving console communication.

Operator-facing diagnostics should show:

- Connected or disconnected status.
- Last received message time.
- Last interpreted action.
- Current active state.
- Current category.
- Current previewed project.
- Current selected project.
- Current content option.

The public LED view must not expose technical connection diagnostics.

### 11.7 Input simulation

A hidden debug control surface must allow the development and operations teams to simulate all console actions without the physical table.

It should support:

- Selecting any category.
- Previewing any project.
- Selecting a project.
- Selecting any content position.
- Replaying content.
- Returning to project preview.
- Returning to idle.
- Resetting.
- Simulating duplicate messages.
- Simulating disconnection.
- Simulating rapid wheel movement.

---

## 12. Custom Globe Requirements

### 12.1 Purpose

The custom globe is the presentation environment used before project selection.

It must support:

- Idle.
- Category activation.
- Project preview.
- Return from Cesium.

### 12.2 Visual quality

The globe should support:

- Hyper-realistic surface textures.
- High-resolution appearance suitable for a large LED.
- Dynamic or looping day/night lighting.
- Visible night-side illumination where appropriate.
- A separate cloud layer.
- Cloud movement.
- Atmospheric scattering or equivalent visual treatment.
- Realistic edge glow.
- Smooth rotation.
- Smooth camera motion.
- Controlled star field or background environment if approved.
- Avoidance of obvious texture repetition, seams, or low-resolution artefacts.

### 12.3 Idle behaviour

The idle globe must:

- Loop indefinitely.
- Avoid obvious starts and stops.
- Avoid drifting into visually weak angles.
- Keep finalist pins legible.
- Support subtle autonomous motion without distracting from category selection.
- Resume gracefully after returning from another state.

### 12.4 Project markers

The globe must represent project locations.

Markers should support:

- Default finalist state.
- Active category state.
- Previewed project state.
- Hidden state.
- Optional animation or pulse.
- Optional region, corridor, or area representation for projects without a single-point footprint.

In idle, all finalists are visible.

When a category is selected, all unrelated project markers disappear.

### 12.5 Project preview movement

The globe must support movement between the three projects in a category while retaining a space-level perspective.

The movement should:

- Rotate the globe.
- Move or reframe the camera.
- Keep the destination marker readable.
- Update project metadata cleanly.
- Avoid excessive duration.
- Handle rapid wheel changes.
- Cancel or retarget smoothly when a new hover signal arrives before the previous movement finishes.

### 12.6 Geographic flexibility

Not every project is represented by the same geographic scale.

The globe and Cesium experience must support:

- Exact point.
- Construction site.
- City.
- Urban district.
- Rail or road corridor.
- River or water system.
- Offshore area.
- State or region.
- Country.
- Multi-location project.
- Network or distributed asset system.

The visual treatment may vary accordingly.

---

## 13. Cesium Project Environment Requirements

### 13.1 Purpose

CesiumJS becomes the geographic canvas after a project is selected.

It must support:

- Geographic arrival.
- Project landing.
- Project content backgrounds.
- Camera sequences.
- Project boundaries and highlighted regions.
- 3D context.
- Integration of additional project-specific assets.

### 13.2 Default geographic content

Google Photorealistic 3D Tiles should be the default environmental layer where appropriate and available.

The product must also support alternatives or fallbacks for:

- Poor coverage.
- Remote locations.
- Underground projects.
- Offshore projects.
- Confidential sites.
- Projects spanning large regions.
- Projects better represented through custom models or imagery.
- Locations where photorealistic tiles are visually unsuitable.

### 13.3 Project framing

Each project must define an appropriate geographic landing composition.

The landing may show:

- A specific building or site.
- A city-scale view.
- A corridor.
- A region.
- Multiple highlighted locations.
- A project boundary.
- A route.
- A water network.
- An underground alignment represented above ground.
- A stylised geographic overview.

The zoom level is project-specific.

### 13.4 Cesium as persistent canvas

Project content appears over the Cesium environment rather than fully replacing it by default.

The application should support content treatments including:

- Darkening the Cesium background.
- Reducing contrast.
- Blurring or softening the background if technically appropriate.
- Shifting camera composition to create space for text or media.
- Vignetting.
- Adding depth or atmospheric overlays.
- Fading geographic layers.
- Highlighting project geometry.
- Temporarily minimising geographic detail.
- Restoring the hero scene after content transitions.

### 13.5 Camera control

The app must support:

- Project arrival camera paths.
- Content-specific camera paths.
- Automatic sequence timing.
- Safe interruption.
- Reset to project landing.
- Replay from a known starting camera.
- Smooth transition between content options.
- Region-scale framing.
- Site-scale framing.
- Optional orbit or controlled movement.
- No user-controlled free navigation during the public experience.

### 13.6 Project overlays

The Cesium canvas should support overlays such as:

- Pins.
- Labels.
- Project boundaries.
- Highlighted regions.
- Corridors.
- Routes.
- Animated paths.
- Data layers.
- 3D models.
- Digital twin assets.
- Point clouds.
- Reality meshes.
- Before-and-after layers.
- Construction stages.
- Timelines.
- Metrics attached to locations.
- Icons.
- Callouts.

Not every project needs every overlay type.

---

## 14. Project Content Requirements

### 14.1 Content-option limits

Each project contains up to five content options.

Rules:

- Project Overview is mandatory.
- Project Overview counts toward the maximum of five.
- Projects should preferably use all five options where meaningful.
- The product must not force weak or repetitive content merely to fill all five positions.
- Fewer than five options are acceptable.
- More than five options are not supported in the public experience.

### 14.2 Project Overview

Project Overview should provide the clearest concise explanation of:

- What the project is.
- Where it is.
- Who delivered it.
- Why it matters.
- The broad challenge or opportunity.
- The overall outcome.

It should not attempt to include every technical detail.

It should be suitable as the visitor’s starting point.

### 14.3 Project-specific content options

The remaining options should focus on the most distinctive parts of the project.

Possible themes include:

- Engineering challenge.
- Construction methodology.
- Digital twin.
- Reality capture.
- Design coordination.
- Sustainability.
- Carbon reduction.
- Risk reduction.
- Operational efficiency.
- Safety.
- Community impact.
- Environmental protection.
- Data integration.
- AI or automation.
- Collaboration.
- Schedule acceleration.
- Cost reduction.
- Resilience.
- Asset management.
- Complex geometry.
- Underground conditions.
- Remote or hazardous environments.
- Scale of implementation.
- Before-and-after transformation.
- Measurable outcomes.

The content-option titles should be editorial and visitor-facing, not merely copied submission headings.

### 14.4 Content formats

The app must support a broad library of content formats.

At minimum:

- Text-led composition.
- Text and image.
- Full-screen image.
- Video.
- Image sequence.
- Animated metrics.
- Large numerical impact statement.
- Timeline.
- Process diagram.
- Workflow diagram.
- Before-and-after comparison.
- Side-by-side comparison.
- Animated map.
- Cesium camera sequence.
- Highlighted geographic region.
- 3D model.
- Digital twin view.
- Reality model or point cloud.
- Construction sequence.
- Layer reveal.
- Quote or testimonial.
- Product and technology breakdown.
- Multi-step narrative sequence.

A content option may combine multiple formats.

### 14.5 Automatic sequences

A content option may contain several timed beats.

For example:

1. Content title.
2. Introductory visual.
3. Camera move.
4. Supporting text.
5. Video or animation.
6. Metric reveal.
7. Final composition.

Sequences must:

- Advance automatically.
- Be interruptible.
- Restart cleanly.
- Have a clearly defined final frame.
- Hold on the final frame.
- Keep voiceover and visuals aligned.
- Avoid depending on visitor actions within the sequence.

### 14.6 Display text

Display text should be optimised for a large LED and event environment.

It should:

- Be concise.
- Use large, readable typography.
- Avoid long paragraphs.
- Use strong hierarchy.
- Avoid complex technical wording unless essential.
- Be readable from the expected viewing distance.
- Remain visually balanced with geographic and media content.

### 14.7 Voiceover text

Each content option has an associated voiceover script.

The voiceover script:

- May match the display text exactly.
- May be longer or more conversational.
- May contain context not displayed on screen.
- Must remain editorially aligned with the on-screen content.
- Must be approved before publishing.
- Should be suitable for generation through ElevenLabs or another approved text-to-speech workflow.

Display text and voiceover text are separate editorial assets.

### 14.8 Content title visibility

Content labels and selection names appear on the console.

The LED should not show a persistent content menu.

The LED may visually introduce the selected story through motion or typography if the UX team chooses, but it must not depend on an on-screen navigation list.

### 14.9 Media sourcing

Project media may come from:

- Submission attachments.
- Additional assets requested from project teams.
- Bentley-owned media.
- Existing approved project photography.
- Existing approved video.
- Screen recordings.
- Rendered 3D content.
- Custom motion graphics.
- AI-generated or AI-assisted video, including tools such as Runway.
- AI-generated imagery, where approved.
- Geographic data.
- Digital twin exports.
- Custom project visualisations.

All media must be reviewed for:

- Accuracy.
- Rights and permissions.
- Resolution.
- Aspect ratio.
- Visual quality.
- Brand suitability.
- Technical performance.
- Relevance to the story.

### 14.10 Missing content

The preparation workflow should identify missing material.

Examples:

- No suitable hero image.
- No usable video.
- No confirmed geographic location.
- Insufficient project metrics.
- No visual proof of a claimed outcome.
- No assets for a proposed content story.
- Missing organisation name or country.
- Unclear rights.
- Low-resolution attachment.
- Conflicting submission details.

The system should help the team produce an actionable request list.

---

## 15. Voiceover and Audio Requirements

### 15.1 Voiceover behaviour

When a content option is selected:

- The voiceover begins automatically.
- It remains associated with that content sequence.
- It stops immediately or fades quickly when another content option is selected.
- The new content voiceover begins.
- It stops when returning to projects.
- It stops when changing category.
- It stops when returning to idle.
- It restarts from the beginning when the content is replayed.

### 15.2 Voiceover generation

The expected workflow uses ElevenLabs.

The product should support:

- Pre-generated audio files.
- Multiple revisions.
- Replacement without application-code changes.
- Consistent chosen voice or approved set of voices.
- Script approval before generation.
- Regeneration after editorial edits.
- Clear mapping between content option and audio file.

The live application should use pre-generated, approved audio rather than calling a text-to-speech service during public operation.

### 15.3 Captions and display-text relationship

The product must allow display text and voiceover text to differ.

This allows:

- Concise on-screen copy.
- More natural spoken explanation.
- Accessibility or event-environment adaptation.
- Editorial control over pacing.

The final decision on full captions is still open. The application should not prevent captions from being added later.

### 15.4 Ambient music

Ambient music is handled by an external media server.

The LED application is not responsible for:

- Starting ambient music.
- Stopping ambient music.
- Mixing ambient music.
- Ducking ambient music.
- Synchronising the external ambient track.

Any future requirement for coordination with the media server should be treated as an integration addition.

---

## 16. AI-Assisted Content Preparation Requirements

### 16.1 Purpose

AI should reduce the manual work required to turn 36 submissions into structured, project-specific stories.

AI does not replace editorial review.

### 16.2 Submission ingestion

The workflow should retrieve or receive:

- Submission text.
- Project title.
- Organisation.
- Category.
- Country.
- Location information.
- Attachments.
- Images.
- Videos.
- Supporting documents.
- Metrics.
- Product references.
- Links.
- Contact information where appropriate.

ClickUp is the expected source for project submissions.

The final integration method remains open.

### 16.3 AI analysis

For each project, the workflow should be able to identify:

- Core project summary.
- Project purpose.
- Geographic scope.
- Main engineering or delivery challenge.
- Distinctive technical approach.
- Bentley products and workflows mentioned.
- Outcomes.
- Quantitative results.
- Sustainability impact.
- Safety impact.
- Schedule impact.
- Cost impact.
- Collaboration approach.
- Community or social impact.
- Visual opportunities.
- Statements needing verification.
- Duplicate or repetitive text.
- Missing information.
- Potential story themes.

### 16.4 Content-option generation

The AI should propose:

- A Project Overview.
- Up to four additional content options.
- Visitor-facing titles.
- A rationale for each option.
- Relevant source passages.
- Suggested display text.
- Suggested voiceover text.
- Recommended content format.
- Recommended visuals.
- Recommended geographic treatment.
- Missing asset requests.

The AI should prefer fewer meaningful options over filling all five with weak content.

### 16.5 Text categorisation

The workflow should classify source text into useful editorial groupings, such as:

- Overview.
- Challenge.
- Solution.
- Technology.
- Process.
- Innovation.
- Outcomes.
- Metrics.
- Sustainability.
- Safety.
- Community.
- Geography.
- Organisation.
- Bentley product usage.
- Quote.
- Supporting evidence.
- Unverified claim.

The categories listed here describe required editorial capabilities, not a final schema.

### 16.6 Human review

Every project must pass through human review before publication.

Editors must be able to:

- Accept or reject proposed options.
- Rename content options.
- Reorder content options.
- Rewrite display text.
- Rewrite voiceover text.
- Remove unsupported claims.
- Edit metrics.
- Select final media.
- Change the suggested format.
- Set geographic framing.
- Approve generated visuals.
- Mark content ready.
- Return content for revision.

### 16.7 Traceability

Editors should be able to understand where AI-generated content came from.

The workflow should retain or expose:

- Relevant source passages.
- Attachment references.
- Submitted metrics.
- Original wording.
- Editorial changes.
- Approval status.

This reduces the risk of unsupported summaries or hallucinated claims.

### 16.8 Media recommendations

The AI-assisted workflow should suggest whether a story is best represented through:

- Image.
- Video.
- Diagram.
- Timeline.
- Metric.
- Cesium movement.
- Region highlight.
- 3D model.
- Before-and-after.
- Generated animation.
- Screen capture.
- Combination sequence.

Suggestions remain subject to creative and editorial review.

### 16.9 AI-generated media

Where project assets are insufficient, the team may create media using tools such as Runway.

The workflow should support tracking:

- What needs to be generated.
- What prompt or creative brief is needed.
- Whether generated media is illustrative or factual.
- Review status.
- Approval status.
- Replacement status.
- Rights and usage information.

Generated content must not misrepresent the real project.

---

## 17. Content Authoring, Review, and Publishing Requirements

### 17.1 Project overview dashboard

The content team should be able to see all projects and their readiness.

Useful statuses include:

- Not imported.
- Imported.
- AI analysis pending.
- Draft generated.
- Editorial review.
- Asset request required.
- Media production.
- Geographic setup.
- Voiceover pending.
- Internal review.
- Approved.
- Published.
- Blocked.

The exact terminology remains open.

### 17.2 Project editing

For each project, editors should be able to manage:

- Project identity.
- Category.
- Organisation.
- Country.
- Location.
- Geographic scope.
- Preview metadata.
- Project Overview.
- Additional content options.
- Display text.
- Voiceover text.
- Media.
- Sequence order.
- Geographic movement.
- Final-frame behaviour.
- Content availability.
- Review status.

### 17.3 Preview

The team must be able to preview:

- Idle globe.
- Category activation.
- Project preview.
- Transition to Cesium.
- Project landing.
- Each content option.
- Voiceover.
- Automatic sequence.
- Final frame.
- Replay.
- Return to projects.
- Category change.

Preview should be possible without the physical console.

### 17.4 Validation

Before publishing, the workflow should detect problems such as:

- Missing Project Overview.
- More than five content options.
- Missing project name.
- Missing organisation.
- Missing country.
- Missing geographic framing.
- Missing media.
- Missing voiceover.
- Missing display text.
- Broken asset path.
- Unsupported media format.
- Incorrect duration.
- Empty content position.
- Invalid sequence.
- Missing final frame.
- Low-resolution media.
- Duplicate project IDs or references.
- Unapproved content.
- Unverified metrics.
- Missing rights information where required.

The final validation rules will depend on the chosen content model.

### 17.5 Publishing

Only approved content should be available to the live application.

Publishing should support:

- Full release.
- Project-level update.
- Media replacement.
- Text correction.
- Voiceover replacement.
- Rollback to a previous approved version.
- Content freeze.
- Event build.
- Staging and production separation.

The implementation mechanism remains open.

---

## 18. Media Playback Requirements

### 18.1 Video

Video playback must:

- Start reliably.
- Support full-screen and embedded compositions.
- Support preloading.
- Avoid visible buffering.
- Stop when interrupted.
- Restart from the beginning on replay.
- Hold or transition cleanly at the end.
- Respect sequence timing.
- Support silent video when voiceover is present.
- Support videos with approved embedded audio where required.

### 18.2 Images

Image handling must support:

- High-resolution assets.
- Cropping or framing appropriate to the LED.
- Pan and zoom.
- Crossfade.
- Layered compositions.
- Image sequences.
- Before-and-after treatment.
- Safe fallback if an asset fails.

### 18.3 3D and interactive visual assets

The product should support prepared 3D assets that can be shown within or alongside Cesium.

Possible content includes:

- iTwin-derived models.
- 3D Tiles.
- Reality meshes.
- Point clouds.
- Digital twin assets.
- Construction stages.
- Animated models.
- Simplified explanatory geometry.

The live visitor does not directly manipulate these assets.

### 18.4 Timelines and diagrams

The application should support:

- Animated timeline progression.
- Step-by-step process reveal.
- Highlighted nodes and connections.
- Construction phases.
- Data-flow diagrams.
- Engineering workflows.
- Comparative states.

### 18.5 Metrics

Metric presentations should support:

- Single hero number.
- Several related metrics.
- Animated count-up.
- Before-and-after value.
- Percentage improvement.
- Time saved.
- Cost saved.
- Carbon reduction.
- Risk reduction.
- Scale indicators.
- Contextual units.

Metrics must be verified during editorial review.

---

## 19. Transition and Motion Requirements

### 19.1 Motion principles

Transitions should:

- Feel intentional.
- Maintain geographic continuity where possible.
- Support interruption.
- Avoid sudden cuts unless creatively justified.
- Avoid excessive duration.
- Preserve readability.
- Hide technical loading.
- Use consistent motion language across projects.

### 19.2 Category transition

A category change should:

- Briefly return through idle.
- Clear unrelated pins.
- Establish the new category.
- Move to the first project.

### 19.3 Project-preview transition

Changing project hover should:

- Retarget smoothly.
- Keep a space-level view.
- Avoid surface zoom.
- Update metadata without flicker.
- Handle quick wheel movement.

### 19.4 Renderer transition

The custom-globe-to-Cesium transition and reverse transition should:

- Use a concealed handover.
- Avoid visible loading.
- Preserve perceived direction.
- Work across different geographic scales.
- Allow interruption by high-priority commands.
- Fail safely to a known visual state.

### 19.5 Content transition

Switching content should:

- Stop old voiceover.
- Cancel old sequence.
- Remove or transform previous overlays.
- Reframe Cesium as needed.
- Enter the new composition.
- Begin new voiceover.
- Avoid showing stale frames.

### 19.6 Final frame

Every automatic content sequence must define a final held composition.

The final frame should:

- Remain visually complete.
- Avoid appearing frozen accidentally.
- Preserve useful project context.
- Remain until input.
- Transition cleanly into replay or another content option.

---

## 20. Reliability and Event Operation Requirements

### 20.1 Continuous operation

The application should be able to run for the full event day.

It should tolerate:

- Long idle periods.
- Frequent category switching.
- Repeated project selection.
- Repeated video playback.
- Many transition cycles.
- Console disconnect and reconnect.
- Temporary internet loss.
- Browser or renderer recovery.

### 20.2 Offline and local operation

The installation should not depend on live external services for essential operation.

Critical content should be available locally or through an event-local delivery method, including:

- Project data.
- Display text.
- Voiceover audio.
- Images.
- Video.
- Motion assets.
- Required custom 3D assets.
- Fonts and UI assets.
- Fallback geographic content where needed.

Dependencies that require internet access must be identified and mitigated.

### 20.3 Startup

The application should support unattended or low-touch startup.

Expected behaviour:

- Launch automatically or through a simple operator action.
- Enter full-screen kiosk mode.
- Load required assets.
- Verify console connection.
- Enter idle.
- Avoid exposing browser chrome.
- Avoid requiring developer tools.

### 20.4 Recovery

The application should support:

- Soft reset to idle.
- Reload.
- Full restart.
- Console reconnect.
- Media-player reset.
- Renderer reset.
- Recovery from failed content.
- Recovery from failed project load.
- Fallback project landing.
- Fallback idle state.

### 20.5 Graceful degradation

If a non-critical asset fails:

- The application should continue operating.
- It should show a suitable fallback.
- It should log the failure.
- It should avoid blank or broken compositions.

If a critical state cannot load:

- The application should return to a safe visual state.
- The operator should receive a diagnostic indication.
- The public should not see technical error text.

### 20.6 Memory and resource management

The application must manage:

- WebGL resources.
- Video memory.
- Decoded video buffers.
- Cesium tiles.
- Custom globe textures.
- 3D assets.
- Audio buffers.
- Repeated playback.
- Repeated transitions.

Long-running operation must not cause progressive degradation, memory leaks, or unstable frame rate.

---

## 21. Performance Requirements

Exact targets will be determined after the LED resolution, playback hardware, and content complexity are confirmed.

The product should aim for:

- Smooth real-time animation.
- Stable frame pacing.
- Responsive console feedback.
- Minimal delay between physical input and visible response.
- Preloaded project preview data.
- Preloaded likely-next Cesium content where feasible.
- No visible buffering during normal use.
- No black frames during renderer transition.
- Rapid content switching.
- Reliable replay.

Performance testing should cover:

- Native LED output resolution.
- Worst-case project assets.
- Highest-resolution video.
- Most complex Cesium scene.
- Fast wheel movement.
- Rapid category changes.
- Repeated replay.
- Full-day runtime.

---

## 22. Preloading and Asset Strategy Requirements

Without defining the technical implementation, the application should support intelligent preparation of likely next content.

### 22.1 At idle

The app should have ready:

- Custom globe.
- All finalist markers.
- Category and project metadata.
- Initial preview assets.

### 22.2 During category preview

The app should prioritise:

- The currently previewed project.
- The other two projects in the active category.
- Project metadata.
- Geographic framing.
- Initial Cesium target.
- Project landing assets.

### 22.3 During project preview

Because one project is always hovered, the application can prepare that project before confirmation.

It should prepare where feasible:

- Cesium view.
- Project geographic assets.
- Landing overlays.
- Overview content.
- Voiceover metadata.
- First media assets.

### 22.4 During project landing

The app should prepare all active content options for the selected project.

### 22.5 Cache behaviour

The app should avoid repeatedly downloading or decoding the same large assets during a session.

The final caching strategy remains open.

---

## 23. Operator and Debug Features

A hidden operator interface should provide:

- Current application state.
- Current category.
- Current previewed project.
- Current selected project.
- Current content option.
- Current sequence progress.
- Voiceover status.
- Video status.
- Console connection status.
- Last input.
- Asset-load failures.
- Renderer status.
- Frame-rate or performance indicator.
- Reset controls.
- Reload controls.
- Simulation controls.
- Project-jump controls.
- Log access.
- Optional safe mode.

This interface must not be visible in normal public operation.

---

## 24. Logging and Analytics

The application should record useful events such as:

- Application started.
- Application reset.
- Console connected.
- Console disconnected.
- Category selected.
- Project previewed.
- Project selected.
- Content selected.
- Content replayed.
- Content interrupted.
- Returned to projects.
- Returned to idle.
- Media failed.
- Asset failed.
- Renderer error.
- Recovery action.

Analytics should allow the team to understand:

- Most selected categories.
- Most selected projects.
- Most selected content options.
- Average time spent per project.
- Frequency of replays.
- Common navigation paths.
- Error frequency.
- Console reliability.

Analytics must not interfere with live operation.

The final storage and privacy approach remains open.

---

## 25. Accessibility and Legibility

Although the experience is operated through a console, the LED content should follow accessibility-conscious design.

Requirements include:

- Large readable typography.
- Strong contrast.
- Avoidance of excessive text.
- No reliance on colour alone to communicate essential meaning.
- Motion that remains understandable.
- Avoidance of rapid flashing.
- Clear project identification.
- Voiceover text available separately from display text.
- Future ability to add captions.
- Visual compositions that remain clear in a busy event environment.

The physical console’s accessibility is outside this PRD.

---

## 26. Visual and Brand Requirements

The application should feel aligned with:

- YII.
- Bentley Systems.
- Premium architectural exhibitions.
- Museum-quality digital installations.
- High-end real-time visualisation.

The visual system should support:

- Consistent typography.
- Consistent motion language.
- Consistent project metadata presentation.
- Flexible project-specific colour or imagery.
- Controlled use of Bentley and YII branding.
- High-quality geographic visualisation.
- Strong contrast on the LED.
- Cohesion across 36 projects.

The final design system is a UX and visual-design deliverable.

---

## 27. Security and Content Control

The live application should:

- Avoid exposing editing controls publicly.
- Avoid exposing credentials in the public interface.
- Use approved, published content only.
- Avoid live AI generation.
- Avoid visitor access to arbitrary URLs or files.
- Recover safely from malformed input.
- Validate incoming console actions.
- Prevent unsupported state jumps.
- Keep operator tools hidden or protected.
- Support controlled content release.

The final authentication and hosting model remains open.

---

## 28. Testing Requirements

### 28.1 Functional testing

Test all major journeys:

- Idle to category.
- Category to first preview.
- Wheel movement across all three projects.
- Project selection.
- Transition to Cesium.
- Project landing.
- Each content position.
- Disabled content position.
- Content replay.
- Content interruption.
- Back to projects.
- Category change during content.
- Return to idle.
- Reset.

### 28.2 Input testing

Test:

- Valid hover messages.
- Valid select messages.
- Duplicate messages.
- Out-of-order messages.
- Rapid wheel changes.
- Selection during movement.
- Category change during renderer transition.
- Content selection during playback.
- Disconnection.
- Reconnection.
- Invalid content slot.
- Invalid project reference.
- Unknown command.

### 28.3 Media testing

Test:

- Every image.
- Every video.
- Every voiceover.
- Every 3D asset.
- Every automatic sequence.
- Every final frame.
- Replay.
- Interruption.
- Fallback behaviour.

### 28.4 Geographic testing

Test:

- Every project landing.
- Region-scale projects.
- Site-scale projects.
- Corridors.
- Multi-location projects.
- Poor photorealistic coverage.
- Reverse transition.
- Camera retargeting.

### 28.5 Endurance testing

Run the application continuously under representative event use.

Test:

- Full-day operation.
- Repeated idle loops.
- Hundreds of project changes.
- Repeated video playback.
- Repeated Cesium transitions.
- Memory stability.
- Frame-rate stability.
- Console reconnection.
- Recovery after forced media failure.

### 28.6 Content validation

Every project should pass a release checklist covering:

- Correct category.
- Correct project name.
- Correct organisation.
- Correct country.
- Correct location.
- Project Overview present.
- No more than five options.
- Display text approved.
- Voiceover approved.
- Media approved.
- Metrics verified.
- Geographic framing approved.
- Final frame approved.
- Replay verified.
- Back navigation verified.

---

## 29. Acceptance Criteria

The first production-ready release should be considered acceptable when:

1. All 12 categories are represented.
2. Each category contains exactly three finalist projects.
3. All 36 projects can be previewed.
4. Selecting a category routes through idle and previews its first project.
5. Wheel hover changes project preview reliably.
6. Project preview shows project name, organisation, and country.
7. All unrelated project markers disappear when a category is active.
8. Project selection triggers a concealed transition to Cesium.
9. Every project has an approved geographic landing.
10. Project landing shows project name, organisation, and location.
11. No narration begins before a content button is pressed.
12. Every project has Project Overview.
13. No project has more than five content options.
14. Disabled content positions are ignored safely.
15. Valid content options begin their visual content and voiceover.
16. Automatic sequences progress without further visitor input.
17. Completed sequences hold on their final composition.
18. A deliberate repeated press replays the current content.
19. Rapid accidental duplicate signals are filtered.
20. New content interrupts the current content cleanly.
21. Returning to projects uses the reverse concealed transition.
22. The previously previewed project remains active after returning.
23. Category selection works from any major state.
24. Return to idle works from any major state.
25. No inactivity timeout changes the visitor’s state.
26. The experience can be operated through a debug simulator without the console.
27. The experience can recover from a console disconnect.
28. Critical event content can operate without dependable public internet.
29. No unapproved AI-generated content is shown.
30. The application can run continuously for the expected event period without progressive failure.

---

## 30. Dependencies

The product depends on:

- Final list of YII 2026 categories and finalists.
- Complete project submissions in ClickUp.
- Confirmed project names, organisations, countries, and locations.
- Media rights and approvals.
- Additional media supplied by project teams.
- Content editorial resources.
- Voiceover approval and generation.
- UX and motion design.
- Console interaction specification.
- Console signal specification.
- LED resolution and hardware.
- Playback computer specification.
- Cesium and geographic data availability.
- Google Photorealistic 3D Tiles suitability and licensing.
- Custom 3D and geographic assets.
- Event network and local infrastructure.
- External ambient audio system.

---

## 31. Risks

### 31.1 Content quality risk

Some submissions may not contain five meaningful stories.

Mitigation:

- Allow fewer than five options.
- Use AI to identify strong themes.
- Request additional information.
- Avoid filler content.

### 31.2 Asset availability risk

Some projects may lack suitable images or video.

Mitigation:

- Create an early asset-gap report.
- Request media from project teams.
- Produce diagrams and maps.
- Create approved generated media.
- Use geographic storytelling where appropriate.

### 31.3 Geographic representation risk

Some projects may not have a visually strong or precise location.

Mitigation:

- Support region, corridor, network, and multi-location views.
- Use custom overlays.
- Use alternative geographic assets.
- Define project-specific zoom levels.

### 31.4 Renderer-transition risk

Switching between the custom globe and Cesium may expose loading or discontinuity.

Mitigation:

- Preload.
- Use concealed transitions.
- Test all projects.
- Maintain fallback transition treatments.

### 31.5 Performance risk

Large video, Cesium tiles, custom 3D, and high LED resolution may exceed playback hardware capability.

Mitigation:

- Define asset budgets.
- Preload.
- Optimise media.
- Test on final hardware.
- Use per-project fallback quality levels.

### 31.6 Console-integration risk

The communication method may remain undecided until late.

Mitigation:

- Use protocol-independent semantic commands.
- Build a simulator.
- Define an adapter boundary.
- Test with mocked input.

### 31.7 AI accuracy risk

AI may invent or distort project facts.

Mitigation:

- Maintain source traceability.
- Require human approval.
- Verify metrics.
- Do not publish directly from AI output.

### 31.8 Event reliability risk

A browser, renderer, media file, or network dependency may fail during the event.

Mitigation:

- Localise critical assets.
- Provide operator controls.
- Provide reset and restart paths.
- Use graceful fallback.
- Perform endurance testing.

---

## 32. Open Decisions for Later Team Workshops

This PRD intentionally leaves the following decisions open:

### 32.1 Backend and data

- Content storage method.
- Database choice.
- API design.
- Data schema.
- Versioning mechanism.
- Publishing architecture.
- Staging and production architecture.
- Asset-delivery strategy.
- Offline packaging method.

### 32.2 Console integration

- MIDI, OSC, MQTT, WebSocket, serial, or another protocol.
- Exact signal payloads.
- Network topology.
- Console acknowledgement.
- Heartbeat.
- Reconnection rules.
- Hardware debounce.
- Physical inactive-button treatment.

### 32.3 Rendering

- Custom globe rendering technology.
- Whether globe and Cesium remain mounted simultaneously.
- Exact transition concealment.
- Tile preloading strategy.
- Project fallback environments.
- Exact camera-path authoring method.

### 32.4 Content authoring

- Whether the authoring workflow is a custom CMS, internal tool, script-based pipeline, or combination.
- Exact AI model or service.
- ClickUp integration method.
- Review workflow.
- Approval roles.
- Content-versioning model.
- Media-review process.

### 32.5 Voiceover

- Final ElevenLabs voice.
- Number of voices.
- Audio mastering.
- Caption policy.
- Voiceover revision workflow.
- Maximum recommended duration.

### 32.6 Analytics and operations

- Event analytics storage.
- Operator dashboard location.
- Log retention.
- Privacy review.
- Alerting.
- Monitoring.
- Remote support.

### 32.7 Visual design

- Final typography.
- Final YII visual language.
- Pin design.
- Project-preview layout.
- Project-landing layout.
- Content-template design.
- Final-frame design.
- Motion timing.
- Transition treatment.

---

## 33. Recommended Next Product Deliverables

The following documents should follow this PRD:

1. **Experience state specification**  
   Formal state definitions, transition rules, command priority, and interruption behaviour.

2. **Content-template catalogue**  
   Approved visual and narrative templates available to project stories.

3. **Project content authoring guide**  
   Rules for Project Overview, option titles, display text, voiceover, metrics, and media.

4. **Content ingestion and AI workflow specification**  
   ClickUp import, AI analysis, human review, validation, and publishing flow.

5. **Console integration contract**  
   Protocol-independent command definitions before transport selection.

6. **Geographic authoring specification**  
   Project location types, framing, camera paths, overlays, and fallback cases.

7. **Media production specification**  
   Resolution, aspect ratio, codecs, duration, compression, audio, and naming.

8. **Operations runbook**  
   Startup, health checks, reset, recovery, failure handling, and shutdown.

9. **Testing and acceptance plan**  
   Functional, performance, endurance, media, geographic, and hardware-integration testing.

10. **Technical architecture document**  
    Backend, frontend, data, deployment, storage, caching, offline operation, and monitoring decisions.

---

## 34. Final Product Summary

The YII 2026 LED application is a deterministic, console-controlled, cinematic project-storytelling experience.

Its defining behaviour is:

```text
IDLE
→ CATEGORY SELECTED
→ FIRST PROJECT AUTOMATICALLY PREVIEWED
→ PROJECT PREVIEW CHANGED BY PHYSICAL WHEEL
→ PROJECT CONFIRMED
→ CONCEALED TRANSITION FROM CUSTOM GLOBE TO CESIUM
→ PROJECT LANDING
→ CONTENT BUTTON PRESSED
→ AUTOMATIC PROJECT STORY AND VOICEOVER
→ FINAL COMPOSITION HELD
```

From there, the visitor can:

- Select another content option.
- Replay the current content.
- Return to the same project preview.
- Preview another project.
- Select another category.
- Return to idle.

The application presents 12 categories, 36 projects, and up to five content options per project. It uses a custom cinematic globe for global navigation and CesiumJS as the project storytelling canvas. Project content is prepared in advance through an AI-assisted, human-reviewed workflow based primarily on ClickUp submissions.

The product should remain visually premium, operationally reliable, content-driven, protocol-independent, and flexible enough to represent widely different infrastructure projects without custom-building the navigation experience for each one.
