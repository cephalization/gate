#!/usr/bin/env node

import { createProgram, ROOT_HELP_TEXT } from "./program.js";

const program = createProgram();

if (process.argv.length === 2) {
  console.log(ROOT_HELP_TEXT);
  process.exit(0);
}

// Parse arguments
program.parse();
