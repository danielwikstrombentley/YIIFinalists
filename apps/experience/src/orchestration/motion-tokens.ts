// Centrally defined durations/easings (T016) — feature code never hard-codes motion values;
// everything routes through this module so the motion language stays consistent (plan.md
// Accessibility & Presentation: "consistent motion language").

export const MOTION_DURATIONS_MS = {
  previewRetarget: 400,
  categoryPreviewEntry: 1200,
  idleReturn: 1200,
  handover: 1800,
  beatDefault: 600,
} as const;

export const MOTION_EASINGS = {
  standard: 'power2.inOut',
  emphatic: 'power3.out',
  gentle: 'sine.inOut',
  linear: 'none',
} as const;

export type MotionEasing = (typeof MOTION_EASINGS)[keyof typeof MOTION_EASINGS];
