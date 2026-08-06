#!/usr/bin/env node
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { commands } from './commands/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const localEnvFile = join(here, '..', '..', '..', '.env.local');

/** Loads developer-local configuration while preserving explicitly exported shell values. */
function loadLocalEnv(): void {
  try {
    process.loadEnvFile(localEnvFile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
}

function printHelp(): void {
  console.log('YII 2026 content-pipeline CLI\n');
  console.log('Usage: content-pipeline <command> [...args]\n');
  console.log('Commands:');
  const width = Math.max(...commands.map((c) => c.name.length));
  for (const command of commands) {
    console.log(`  ${command.name.padEnd(width + 2)}${command.description}`);
  }
}

async function main(): Promise<void> {
  loadLocalEnv();
  const [, , commandName, ...rest] = process.argv;

  if (!commandName || commandName === '--help' || commandName === '-h') {
    printHelp();
    return;
  }

  const command = commands.find((c) => c.name === commandName);
  if (!command) {
    console.error(`Unknown command: "${commandName}"\n`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  await command.run(rest);
}

void main();
