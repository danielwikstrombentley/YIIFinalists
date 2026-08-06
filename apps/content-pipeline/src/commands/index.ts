import { generateSampleRelease, parseSampleTileTier } from '../seed/sample.ts';

export interface CliCommand {
  name: string;
  description: string;
  run: (args: string[]) => Promise<void> | void;
}

const notYetImplemented = (name: string) => async (): Promise<void> => {
  console.log(
    `[content-pipeline] "${name}" is not implemented yet (scaffolded in T003; real behaviour lands in later PH8/PH9 tasks).`,
  );
};

// Stub subcommand registry (T003). Each command is fleshed out by its owning task:
// ingest → T057-ish ingestion tasks, analyze → drafting pipeline, review → editorial workflow,
// validate/publish/rollback/freeze → PH9 publishing tasks, seed:sample → T018.
export const commands: CliCommand[] = [
  {
    name: 'ingest',
    description: 'Ingest submissions from ClickUp or a manual export (research R10).',
    run: notYetImplemented('ingest'),
  },
  {
    name: 'analyze',
    description:
      'Run provider-agnostic LLM drafting analysis on ingested submissions (research R9).',
    run: notYetImplemented('analyze'),
  },
  {
    name: 'ingest-drafts',
    description: 'Import externally produced draft analyses (e.g. Copilot agent workflow output).',
    run: notYetImplemented('ingest-drafts'),
  },
  {
    name: 'review',
    description: 'Open the editorial review/approval workflow for proposed content options.',
    run: notYetImplemented('review'),
  },
  {
    name: 'validate',
    description:
      'Validate a content package against the schema and the FR-036 rule set before publish.',
    run: notYetImplemented('validate'),
  },
  {
    name: 'publish',
    description: 'Bundle and publish a validated release to a channel (staging or production).',
    run: notYetImplemented('publish'),
  },
  {
    name: 'rollback',
    description: 'Roll a release channel back to a previously retained version.',
    run: notYetImplemented('rollback'),
  },
  {
    name: 'freeze',
    description: 'Freeze the production channel to block further overwrites.',
    run: notYetImplemented('freeze'),
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
