import { expect, type Page } from '@playwright/test';

interface CapturedFrame {
  meanLuma: number;
  litPixelRatio: number;
  signature: number[];
}

export interface VisibleFrameCheckOptions {
  frameCount?: number;
  intervalMs?: number;
}

/**
 * Captures the pixels that Playwright actually sees, then uses the browser's native image decoder
 * to calculate a compact luminance signature. This avoids trusting renderer-owned test hooks for
 * the zero-black/stale-frame assertion.
 */
async function captureStageFrame(page: Page): Promise<CapturedFrame> {
  const screenshot = await page.locator('#stage').screenshot();

  return page.evaluate(async (pngBase64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${pngBase64}`;
    await image.decode();

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Unable to create a 2D frame-analysis context.');
    context.drawImage(image, 0, 0);

    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    const columns = 8;
    const rows = 8;
    const cellTotals = Array.from({ length: columns * rows }, () => 0);
    const cellCounts = Array.from({ length: columns * rows }, () => 0);
    let totalLuma = 0;
    let litPixels = 0;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixelOffset = (y * width + x) * 4;
        const alpha = data[pixelOffset + 3] ?? 0;
        const red = data[pixelOffset] ?? 0;
        const green = data[pixelOffset + 1] ?? 0;
        const blue = data[pixelOffset + 2] ?? 0;
        const luma = ((red * 0.2126 + green * 0.7152 + blue * 0.0722) * alpha) / 255;
        const cell =
          Math.min(rows - 1, Math.floor((y / height) * rows)) * columns +
          Math.min(columns - 1, Math.floor((x / width) * columns));

        totalLuma += luma;
        if (luma > 8) litPixels += 1;
        cellTotals[cell] = (cellTotals[cell] ?? 0) + luma;
        cellCounts[cell] = (cellCounts[cell] ?? 0) + 1;
      }
    }

    return {
      meanLuma: totalLuma / (width * height),
      litPixelRatio: litPixels / (width * height),
      signature: cellTotals.map((total, index) => total / (cellCounts[index] ?? 1)),
    };
  }, screenshot.toString('base64'));
}

function signatureDistance(first: readonly number[], second: readonly number[]): number {
  return (
    first.reduce((total, value, index) => total + Math.abs(value - (second[index] ?? value)), 0) /
    first.length
  );
}

/**
 * Samples the public stage through a handover. Every sample must contain visible pixels, and at
 * least one sampled frame must visually differ from the first. It is intentionally reusable for
 * both forward and reverse handover journeys.
 */
export async function expectVisibleTransitionFrames(
  page: Page,
  options: VisibleFrameCheckOptions = {},
): Promise<void> {
  const frameCount = options.frameCount ?? 7;
  const intervalMs = options.intervalMs ?? 65;
  const frames: CapturedFrame[] = [];

  for (let index = 0; index < frameCount; index += 1) {
    frames.push(await captureStageFrame(page));
    if (index < frameCount - 1) await page.waitForTimeout(intervalMs);
  }

  for (const [index, frame] of frames.entries()) {
    expect(frame.litPixelRatio, `frame ${index} must not be blank or black`).toBeGreaterThan(0.005);
    expect(frame.meanLuma, `frame ${index} must contain visible scene luminance`).toBeGreaterThan(
      0.5,
    );
  }

  const first = frames[0];
  if (!first) throw new Error('Expected at least one transition frame.');
  const largestDifference = Math.max(
    ...frames.slice(1).map((frame) => signatureDistance(first.signature, frame.signature)),
  );
  expect(largestDifference, 'handover frames must not remain visually stale').toBeGreaterThan(0.15);
}
