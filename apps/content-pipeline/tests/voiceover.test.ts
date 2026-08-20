import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateVoiceover } from '../src/voiceover/generate.ts';
import type { TtsProvider } from '../src/voiceover/tts-adapter.ts';

const FIXED_NOW = '2026-08-19T10:00:00.000Z';
let outputRoot: string;

const approvedOption = {
  projectId: 'project-one',
  position: 1,
  reviewState: 'approved' as const,
  draftVoiceoverText: {
    text: 'Approved narration for the project.',
    sourceLinks: [{ submissionId: 'project-one', passageId: 'description-1' }],
  },
  voiceoverTextVersion: 2,
};

const tts: TtsProvider = {
  id: 'mock-tts',
  synthesize: vi.fn(async () => ({
    wav: Buffer.from('master-wave-audio'),
    durationMs: 2_500,
  })),
};

beforeEach(async () => {
  outputRoot = await mkdtemp(join(tmpdir(), 'yii-voiceover-'));
  vi.mocked(tts.synthesize).mockClear();
});

afterEach(async () => {
  await rm(outputRoot, { recursive: true, force: true });
});

describe('generateVoiceover', () => {
  it('generates a mastered local delivery asset linked to the approved script version', async () => {
    const result = await generateVoiceover({
      projectId: 'project-one',
      option: approvedOption,
      outputRoot,
      provider: tts,
      voiceId: 'editorial-voice',
      params: { stability: 0.6 },
      captionText: [{ type: 'paragraph', text: approvedOption.draftVoiceoverText.text }],
      now: () => new Date(FIXED_NOW),
    });

    expect(tts.synthesize).toHaveBeenCalledWith({
      text: approvedOption.draftVoiceoverText.text,
      voiceId: 'editorial-voice',
      params: { stability: 0.6 },
    });
    expect(result.asset).toMatchObject({
      file: 'projects/project-one/voiceover/option-1-v2.opus',
      scriptVersion: 'voiceover-text-v2',
      voiceId: 'editorial-voice',
      durationMs: 2_500,
    });
    await expect(readFile(result.masterPath)).resolves.toEqual(Buffer.from('master-wave-audio'));
    await expect(readFile(result.deliveryPath)).resolves.toEqual(Buffer.from('master-wave-audio'));
    expect(result.regenerated).toBe(false);
  });

  it('rejects any narration whose editorial option is not human-approved', async () => {
    await expect(
      generateVoiceover({
        projectId: 'project-one',
        option: { ...approvedOption, reviewState: 'draft' },
        outputRoot,
        provider: tts,
        voiceId: 'editorial-voice',
      }),
    ).rejects.toThrow(/approved/i);
    expect(tts.synthesize).not.toHaveBeenCalled();
  });

  it('detects a script-version replacement and requires the regenerated asset to re-enter review', async () => {
    const first = await generateVoiceover({
      projectId: 'project-one',
      option: approvedOption,
      outputRoot,
      provider: tts,
      voiceId: 'editorial-voice',
    });
    const replacement = await generateVoiceover({
      projectId: 'project-one',
      option: { ...approvedOption, voiceoverTextVersion: 3 },
      outputRoot,
      provider: tts,
      voiceId: 'editorial-voice',
      previousAsset: first.asset,
    });

    expect(replacement.regenerated).toBe(true);
    expect(replacement.reviewRequired).toBe(true);
    expect(replacement.asset.scriptVersion).toBe('voiceover-text-v3');
  });

  it('rejects delivery audio over the 192 kbps budget', async () => {
    await expect(
      generateVoiceover({
        projectId: 'project-one',
        option: approvedOption,
        outputRoot,
        provider: {
          ...tts,
          synthesize: async () => ({ wav: Buffer.alloc(50_000), durationMs: 1_000 }),
        },
        voiceId: 'editorial-voice',
        masterDelivery: () => Buffer.alloc(50_000),
      }),
    ).rejects.toThrow(/192 kbps/i);
  });
});
