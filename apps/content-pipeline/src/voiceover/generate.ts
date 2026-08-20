import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { EditorialOption, RichTextBlock, VoiceoverAsset } from '@yii/content-schema';
import { assertDeliveryWithinBudget, masterVoiceover } from './master.ts';
import type { TtsProvider } from './tts-adapter.ts';

export interface VoiceoverGenerationOption {
  projectId: string;
  position: number | null;
  reviewState: EditorialOption['reviewState'];
  draftVoiceoverText: EditorialOption['draftVoiceoverText'];
  voiceoverTextVersion: number;
}

export interface GenerateVoiceoverOptions {
  projectId: string;
  option: VoiceoverGenerationOption;
  outputRoot: string;
  provider: TtsProvider;
  voiceId: string;
  params?: Record<string, unknown>;
  captionText?: RichTextBlock[];
  previousAsset?: VoiceoverAsset;
  now?: () => Date;
  masterDelivery?: (wav: Buffer) => Buffer;
}

export interface GeneratedVoiceover {
  asset: VoiceoverAsset;
  masterPath: string;
  deliveryPath: string;
  regenerated: boolean;
  /** A script replacement is new generated media and must receive a new human review. */
  reviewRequired: boolean;
}

function scriptVersion(option: VoiceoverGenerationOption): string {
  return `voiceover-text-v${String(option.voiceoverTextVersion)}`;
}

export async function generateVoiceover(
  options: GenerateVoiceoverOptions,
): Promise<GeneratedVoiceover> {
  if (options.option.reviewState !== 'approved') {
    throw new Error('Voiceover generation requires a human-approved editorial option.');
  }
  if (options.option.position === null) {
    throw new Error('Voiceover generation requires an assigned content-option position.');
  }

  const generated = await options.provider.synthesize({
    text: options.option.draftVoiceoverText.text,
    voiceId: options.voiceId,
    ...(options.params ? { params: options.params } : {}),
  });
  const mastered = options.masterDelivery ? undefined : masterVoiceover(generated.wav);
  const delivery = options.masterDelivery?.(generated.wav) ?? mastered!.delivery;
  const extension = mastered?.extension ?? 'opus';
  assertDeliveryWithinBudget(delivery, generated.durationMs);

  const version = scriptVersion(options.option);
  const relativeDirectory = `projects/${options.projectId}/voiceover`;
  const filename = `option-${String(options.option.position)}-v${String(options.option.voiceoverTextVersion)}`;
  const outputDirectory = resolve(options.outputRoot, relativeDirectory);
  const masterPath = join(outputDirectory, `${filename}.wav`);
  const deliveryPath = join(outputDirectory, `${filename}.${extension}`);
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(masterPath, generated.wav),
    writeFile(deliveryPath, delivery),
  ]);

  const regenerated = options.previousAsset?.scriptVersion !== undefined &&
    options.previousAsset.scriptVersion !== version;
  return {
    asset: {
      file: `${relativeDirectory}/${filename}.${extension}`,
      scriptVersion: version,
      voiceId: options.voiceId,
      ...(options.params ? { params: options.params } : {}),
      durationMs: generated.durationMs,
      captionText: options.captionText ?? [],
    },
    masterPath,
    deliveryPath,
    regenerated,
    reviewRequired: regenerated,
  };
}
