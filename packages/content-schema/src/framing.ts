import { z } from 'zod';
import { packageRelativePathSchema } from './shared.js';

// GeographicFraming — data-model.md §1. Drives both the custom-globe preview emphasis and the
// CesiumStageAdapter landing camera (plan.md Architecture, research.md R4).

export const GEOGRAPHIC_SCOPE_TYPES = [
  'point',
  'site',
  'city',
  'district',
  'corridor',
  'water-system',
  'offshore',
  'region',
  'country',
  'multi-location',
  'network',
] as const;
export type GeographicScopeType = (typeof GEOGRAPHIC_SCOPE_TYPES)[number];

export const TILE_TIERS = ['photorealistic', 'local-fallback-scene', 'safe-composition'] as const;
export type TileTier = (typeof TILE_TIERS)[number];

/** Cesium-native camera pose: lat/lon in degrees, height/range in metres (research.md R4). */
export const cameraPoseSchema = z
  .object({
    destination: z
      .object({
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
        height: z.number(),
      })
      .strict(),
    orientation: z
      .object({
        heading: z.number(),
        pitch: z.number(),
        roll: z.number(),
      })
      .strict(),
    range: z.number().positive(),
  })
  .strict();

export type CameraPose = z.infer<typeof cameraPoseSchema>;

export const previewEmphasisSchema = z
  .object({
    markerScale: z.number().positive().optional(),
    arc: z.boolean().optional(),
    regionGlow: z.boolean().optional(),
  })
  .catchall(z.unknown());

export const canvasTreatmentSchema = z
  .object({
    darken: z.number().min(0).max(1).optional(),
    soften: z.number().min(0).max(1).optional(),
    reframe: z.record(z.string(), z.unknown()).optional(),
    highlight: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const geographicFramingSchema = z
  .object({
    scopeType: z.enum(GEOGRAPHIC_SCOPE_TYPES),
    landingCamera: cameraPoseSchema,
    previewEmphasis: previewEmphasisSchema,
    boundaries: z.array(packageRelativePathSchema).optional(),
    routes: z.array(packageRelativePathSchema).optional(),
    regions: z.array(packageRelativePathSchema).optional(),
    tileTier: z.enum(TILE_TIERS),
    canvasTreatment: canvasTreatmentSchema,
  })
  .strict();

export type GeographicFraming = z.infer<typeof geographicFramingSchema>;
