#!/usr/bin/env node
// Thin shim: the CLI lives in src/cli and compiles to dist/cli/main.js so the
// dashboard and the CLI share one implementation of every rule.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, '..', 'dist', 'cli', 'main.js');

if (!existsSync(entry)) {
  console.error('LaunchOS CLI is not built yet. Run:\n\n  npm run build:core\n');
  process.exit(1);
}
createRequire(import.meta.url)(entry);
