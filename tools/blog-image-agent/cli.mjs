#!/usr/bin/env node
import { parseArgs } from "./src/core.mjs";
import { runCommand } from "./src/commands.mjs";

const help = `Blog Image Agent

Usage:
  blog-images scan [--out <file>] [--root <dir>] [--config <file>]
  blog-images plan [--scan <file>] [--out <file>]
  blog-images generate --manifest <file> [--provider manifest|openai]
  blog-images import --manifest <file> --id <image-id> --file <image>
  blog-images apply --manifest <file> [--dry-run]
  blog-images check-assets --manifest <file>
  blog-images check --manifest <file>
  blog-images pipeline [--provider manifest|openai] [--out <manifest>] [--dry-run]
`;

try {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (!command || command === "help" || options.help) {
    process.stdout.write(help);
    process.exitCode = command ? 0 : 1;
  } else {
    const result = await runCommand(command, options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`blog-image-agent: ${error.message}\n`);
  process.exitCode = 1;
}
