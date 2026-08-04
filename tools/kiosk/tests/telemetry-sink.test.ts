import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TelemetrySink } from '../src/telemetry-sink.js';

// T019 Tests (part 1/3): sink appends valid JSONL; malformed entries are dropped individually
// (never fatal to the batch, never a thrown error toward the caller).

describe('TelemetrySink', () => {
  let logDir: string;

  beforeEach(async () => {
    logDir = await mkdtemp(join(tmpdir(), 'yii-kiosk-logs-'));
  });

  afterEach(async () => {
    await rm(logDir, { recursive: true, force: true });
  });

  it('appends valid events as one JSON object per line', async () => {
    const sink = new TelemetrySink(logDir);
    const at = new Date('2026-10-14T09:30:12.345Z');
    const events = [
      { v: 1, ts: '2026-10-14T09:30:12.345Z', sessionId: 'boot-1', seq: 1, kind: 'start' },
      {
        v: 1,
        ts: '2026-10-14T09:30:13.000Z',
        sessionId: 'boot-1',
        seq: 2,
        kind: 'content',
        stateBefore: 'projectLanding',
        stateAfter: 'contentPlaying',
        refs: { categoryId: 'roads', projectId: 'p-017', position: 2 },
        latencyMs: 87,
      },
    ];

    const result = await sink.appendBatch(events, at);
    expect(result).toEqual({ accepted: 2, rejected: 0, errors: [] });

    const raw = await readFile(join(logDir, 'telemetry-2026-10-14.jsonl'), 'utf8');
    const lines = raw.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toMatchObject({ kind: 'start' });
    expect(JSON.parse(lines[1]!)).toMatchObject({ kind: 'content', latencyMs: 87 });
  });

  it('drops malformed events individually without throwing, and still appends the valid ones', async () => {
    const sink = new TelemetrySink(logDir);
    const at = new Date('2026-10-14T09:30:12.345Z');
    const events = [
      { v: 1, ts: '2026-10-14T09:30:12.345Z', sessionId: 'boot-1', seq: 1, kind: 'start' },
      { v: 1, kind: 'not-a-real-kind' }, // malformed: missing required fields + unknown kind
    ];

    const result = await sink.appendBatch(events, at);
    expect(result.accepted).toBe(1);
    expect(result.rejected).toBe(1);
    expect(result.errors).toHaveLength(1);

    const raw = await readFile(join(logDir, 'telemetry-2026-10-14.jsonl'), 'utf8');
    expect(raw.trim().split('\n')).toHaveLength(1);
  });

  it('appends to a new file per UTC day', async () => {
    const sink = new TelemetrySink(logDir);
    await sink.appendBatch(
      [{ v: 1, ts: '2026-10-14T23:59:00.000Z', sessionId: 'a', seq: 1, kind: 'start' }],
      new Date('2026-10-14T23:59:00.000Z'),
    );
    await sink.appendBatch(
      [{ v: 1, ts: '2026-10-15T00:01:00.000Z', sessionId: 'a', seq: 2, kind: 'reset' }],
      new Date('2026-10-15T00:01:00.000Z'),
    );

    const day1 = await readFile(join(logDir, 'telemetry-2026-10-14.jsonl'), 'utf8');
    const day2 = await readFile(join(logDir, 'telemetry-2026-10-15.jsonl'), 'utf8');
    expect(day1.trim().split('\n')).toHaveLength(1);
    expect(day2.trim().split('\n')).toHaveLength(1);
  });

  it('never throws even when every event in the batch is malformed', async () => {
    const sink = new TelemetrySink(logDir);
    await expect(sink.appendBatch([{ garbage: true }, null, 42])).resolves.toEqual({
      accepted: 0,
      rejected: 3,
      errors: expect.any(Array),
    });
  });
});
