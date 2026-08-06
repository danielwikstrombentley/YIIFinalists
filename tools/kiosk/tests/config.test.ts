import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getKioskCesiumConfigurationWarning,
  loadKioskLocalEnv,
  type KioskConfig,
} from '../src/config.js';

const TEST_ENV_KEY = 'YII_KIOSK_LOCAL_ENV_TEST';
const temporaryDirectories: string[] = [];

afterEach(async () => {
  delete process.env[TEST_ENV_KEY];
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('kiosk local environment configuration', () => {
  it('loads a root-style local environment file without overriding a shell-provided value', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'yii-kiosk-env-'));
    temporaryDirectories.push(directory);
    const envFile = join(directory, '.env.local');
    await writeFile(envFile, `${TEST_ENV_KEY}=from-file\n`, 'utf8');

    loadKioskLocalEnv(envFile);
    expect(process.env[TEST_ENV_KEY]).toBe('from-file');

    process.env[TEST_ENV_KEY] = 'from-shell';
    loadKioskLocalEnv(envFile);
    expect(process.env[TEST_ENV_KEY]).toBe('from-shell');
  });

  it('warns safely when an ion token is paired with a non-numeric asset ID', () => {
    const config: KioskConfig = {
      port: 4174,
      staticRoot: '/tmp/static',
      contentRoot: '/tmp/content',
      logDir: '/tmp/logs',
      ionAccessToken: 'long-token-kept-private',
      ionGoogleTilesAssetId: 'not-an-ion-asset-id',
    };

    expect(getKioskCesiumConfigurationWarning(config)).toMatch(
      /positive numeric Cesium ion asset ID/i,
    );
  });
});
