import { resolve } from 'node:path';
import { validateReleaseCandidate } from '../validate/run.ts';

function valueAfter(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

export async function runValidateCommand(args: string[]): Promise<void> {
  const root = resolve(
    valueAfter(args, '--root') ?? valueAfter(args, '--release-candidate') ?? 'content',
  );
  const version = valueAfter(args, '--version');
  const report = await validateReleaseCandidate({ root, version });
  console.log(
    `[content-pipeline] validation ${report.valid ? 'passed' : 'failed'} for ${report.candidateVersion} with ${String(report.issues.length)} issue(s).`,
  );
  for (const issue of report.issues) {
    console.log(`- [${issue.rule}] ${issue.path}: ${issue.message}`);
  }
  if (!report.valid) process.exitCode = 1;
}
