import { readFile } from 'node:fs/promises';
import { generateSampleRelease, parseSampleTileTier } from '../seed/sample.ts';
import { runAnalyzeCommand } from './analyze.ts';
import { runIngestCommand } from './ingest.ts';
import { runIngestDraftsCommand } from './ingest-drafts.ts';
import { runReviewCommand } from '../review/cli.ts';
import { runValidateCommand } from './validate.ts';
import {
  promoteRelease,
  publishRelease,
  rollbackChannel,
  setProductionFreeze,
} from '../publish/release.ts';

export interface CliCommand {
  name: string;
  description: string;
  run: (args: string[]) => Promise<void> | void;
}

function valueAfter(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

async function runPublishCommand(args: string[]): Promise<void> {
  const root = valueAfter(args, '--root');
  const candidateFile = valueAfter(args, '--candidate');
  const channel = valueAfter(args, '--channel');
  if (!root || !candidateFile || (channel !== 'staging' && channel !== 'production')) {
    throw new Error(
      'Usage: publish --root <content-root> --candidate <candidate.json> --channel staging|production.',
    );
  }
  const candidate = JSON.parse(await readFile(candidateFile, 'utf8')) as Parameters<
    typeof publishRelease
  >[0]['candidate'];
  const release = await publishRelease({
    root,
    candidate,
    channel,
    ...(valueAfter(args, '--base-version')
      ? { baseVersion: valueAfter(args, '--base-version') }
      : {}),
  });
  console.log(`[content-pipeline] published ${release.version} to ${channel}.`);
}

async function runRollbackCommand(args: string[]): Promise<void> {
  const root = valueAfter(args, '--root');
  const channel = valueAfter(args, '--channel');
  if (!root || (channel !== 'staging' && channel !== 'production')) {
    throw new Error('Usage: rollback --root <content-root> --channel staging|production.');
  }
  await rollbackChannel({ root, channel });
  console.log(`[content-pipeline] rolled ${channel} back to its prior retained release.`);
}

async function runFreezeCommand(args: string[]): Promise<void> {
  const root = valueAfter(args, '--root');
  if (!root) throw new Error('Usage: freeze --root <content-root> [--unfreeze].');
  await setProductionFreeze({ root, frozen: !args.includes('--unfreeze') });
  console.log(
    `[content-pipeline] production channel ${args.includes('--unfreeze') ? 'unfrozen' : 'frozen'}.`,
  );
}

// Stub subcommand registry (T003). Each command is fleshed out by its owning task:
// ingest → T057-ish ingestion tasks, analyze → drafting pipeline, review → editorial workflow,
// validate/publish/rollback/freeze → PH9 publishing tasks, seed:sample → T018.
export const commands: CliCommand[] = [
  {
    name: 'ingest',
    description: 'Ingest submissions from ClickUp or a manual export (research R10).',
    run: runIngestCommand,
  },
  {
    name: 'analyze',
    description:
      'Run provider-agnostic LLM drafting analysis on ingested submissions (research R9).',
    run: runAnalyzeCommand,
  },
  {
    name: 'ingest-drafts',
    description: 'Import externally produced draft analyses (e.g. Copilot agent workflow output).',
    run: runIngestDraftsCommand,
  },
  {
    name: 'review',
    description: 'Open the editorial review/approval workflow for proposed content options.',
    run: runReviewCommand,
  },
  {
    name: 'validate',
    description:
      'Validate a content package against the schema and the FR-036 rule set before publish.',
    run: runValidateCommand,
  },
  {
    name: 'publish',
    description: 'Bundle and publish a validated release to a channel (staging or production).',
    run: runPublishCommand,
  },
  {
    name: 'promote',
    description: 'Promote a retained validated release to the production channel.',
    run: async (args) => {
      const root = valueAfter(args, '--root');
      const version = valueAfter(args, '--version');
      if (!root || !version)
        throw new Error('Usage: promote --root <content-root> --version <semver>.');
      await promoteRelease({ root, version });
      console.log(`[content-pipeline] promoted ${version} to production.`);
    },
  },
  {
    name: 'rollback',
    description: 'Roll a release channel back to a previously retained version.',
    run: runRollbackCommand,
  },
  {
    name: 'freeze',
    description: 'Freeze the production channel to block further overwrites.',
    run: runFreezeCommand,
  },
  {
    name: 'seed:sample',
    description:
      'Generate a schema-valid sample release (12 categories x 3 projects) for local dev/tests (T018; optional --tile-tier).',
    run: async (args: string[]): Promise<void> => {
      const outputFlagIndex = args.indexOf('--output');
      const outputDir = outputFlagIndex !== -1 ? args[outputFlagIndex + 1] : undefined;
      const tileTierFlagIndex = args.indexOf('--tile-tier');
      if (tileTierFlagIndex !== -1 && !args[tileTierFlagIndex + 1]) {
        throw new Error('seed:sample --tile-tier requires a value.');
      }
      const tileTierValue =
        tileTierFlagIndex !== -1 ? args[tileTierFlagIndex + 1] : process.env.YII_SAMPLE_TILE_TIER;
      const result = await generateSampleRelease({
        outputDir,
        tileTier: parseSampleTileTier(tileTierValue),
      });
      console.log(
        `[content-pipeline] seed:sample generated release "${result.version}" ` +
          `(${result.categories.length} categories x ${result.projects.length / result.categories.length} projects; ${result.projects[0]?.geographicFraming.tileTier ?? 'unknown'} tiles) at ${result.outputDir}`,
      );
    },
  },
];
