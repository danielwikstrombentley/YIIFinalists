import { mkdir, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

// Telemetry sink (T019, contracts/analytics-events.md): appends batched, validated events to
// `logs/telemetry-YYYY-MM-DD.jsonl`. Never blocks or fails loudly toward the caller in a way that
// could affect the runtime (Principle IV/FR-038) — malformed entries are dropped individually and
// reported back, never a 5xx.

const EVENT_KINDS = [
  'start',
  'reset',
  'connect',
  'disconnect',
  'category',
  'preview',
  'select',
  'content',
  'replay',
  'interrupt',
  'return',
  'mediaFailure',
  'assetFailure',
  'rendererFailure',
  'recovery',
] as const;

export const telemetryEventSchema = z
  .object({
    v: z.literal(1),
    ts: z.iso.datetime({ offset: true }),
    sessionId: z.string().min(1),
    seq: z.number().int().nonnegative(),
    kind: z.enum(EVENT_KINDS),
    stateBefore: z.string().optional(),
    stateAfter: z.string().optional(),
    refs: z.record(z.string(), z.unknown()).optional(),
    latencyMs: z.number().nonnegative().optional(),
    detail: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type TelemetryEvent = z.infer<typeof telemetryEventSchema>;

export interface AppendBatchResult {
  accepted: number;
  rejected: number;
  errors: string[];
}

export class TelemetrySink {
  constructor(private readonly logDir: string) {}

  /** Validates each event individually; malformed entries are dropped, not fatal to the batch. */
  async appendBatch(rawEvents: unknown[], at: Date = new Date()): Promise<AppendBatchResult> {
    const result: AppendBatchResult = { accepted: 0, rejected: 0, errors: [] };
    const lines: string[] = [];

    for (const raw of rawEvents) {
      const parsed = telemetryEventSchema.safeParse(raw);
      if (parsed.success) {
        lines.push(JSON.stringify(parsed.data));
        result.accepted += 1;
      } else {
        result.rejected += 1;
        result.errors.push(parsed.error.issues.map((issue) => issue.message).join('; '));
      }
    }

    if (lines.length > 0) {
      await mkdir(this.logDir, { recursive: true });
      await appendFile(this.logFilePath(at), `${lines.join('\n')}\n`, 'utf8');
    }

    return result;
  }

  private logFilePath(at: Date): string {
    const day = at.toISOString().slice(0, 10); // YYYY-MM-DD
    return join(this.logDir, `telemetry-${day}.jsonl`);
  }
}
