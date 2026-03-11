#!/usr/bin/env node
import { satisfies } from 'semver';
import { red } from './src/utils/logging';

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const NODE_VERSION_RANGE = '>=18.17.0';

// Have to run this above the other imports because they are importing clack that
// has the problematic imports.
if (!satisfies(process.version, NODE_VERSION_RANGE)) {
  red(
    `Opik CLI requires Node.js ${NODE_VERSION_RANGE}. You are using Node.js ${process.version}. Please upgrade your Node.js version.`,
  );
  process.exit(1);
}

import type { WizardOptions } from './src/utils/types';
import { runWizard } from './src/run';
import { runDoctor } from './src/doctor';
import clack from './src/utils/clack';

yargs(hideBin(process.argv))
  .scriptName('opik-ts')
  .env('OPIK_TS')
  // global options
  .options({
    debug: {
      default: false,
      describe: 'Enable verbose logging\nenv: OPIK_TS_DEBUG',
      type: 'boolean',
    },
    default: {
      default: true,
      describe: 'Use default options for all prompts\nenv: OPIK_TS_DEFAULT',
      type: 'boolean',
    },
  })
  .command(
    'configure',
    'Run the Opik SDK setup configure',
    (yargs) => {
      return yargs.options({
        'force-install': {
          default: false,
          describe:
            'Force install packages even if peer dependency checks fail\nenv: OPIK_TS_FORCE_INSTALL',
          type: 'boolean',
        },
        'install-dir': {
          describe:
            'Directory to install Opik SDK in\nenv: OPIK_TS_INSTALL_DIR',
          type: 'string',
        },
        'use-local': {
          default: false,
          describe:
            'Configure for local deployment (skips API key/workspace setup)\nenv: OPIK_TS_USE_LOCAL',
          type: 'boolean',
        },
        'deployment-type': {
          choices: ['cloud', 'self-hosted', 'local'] as const,
          describe:
            'Configure a specific deployment type without prompting\nenv: OPIK_TS_DEPLOYMENT_TYPE',
          type: 'string',
        },
        url: {
          describe:
            'Base URL for your Opik instance (used for local or self-hosted setup)\nenv: OPIK_TS_URL',
          type: 'string',
        },
        'api-key': {
          describe:
            'Opik API key for cloud or self-hosted setup\nenv: OPIK_TS_API_KEY',
          type: 'string',
        },
        workspace: {
          describe:
            'Workspace name override for cloud or self-hosted setup. If omitted, configure uses your default workspace from the API key\nenv: OPIK_TS_WORKSPACE',
          type: 'string',
        },
        'project-name': {
          describe:
            'Project name to write into the generated configuration\nenv: OPIK_TS_PROJECT_NAME',
          type: 'string',
        },
        'package-manager': {
          choices: ['npm', 'pnpm', 'yarn', 'bun'] as const,
          describe:
            'Package manager to use when auto-detection is ambiguous\nenv: OPIK_TS_PACKAGE_MANAGER',
          type: 'string',
        },
      });
    },
    async (argv) => {
      const options = { ...argv };
      try {
        await runWizard(options as unknown as WizardOptions);
      } catch (error) {
        clack.log.error(
          `Error: ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exit(1);
      }
    },
  )
  .command(
    'doctor',
    'Run health checks for Opik SDK installation',
    () => {},
    async () => {
      try {
        await runDoctor();
      } catch (error) {
        clack.log.error(
          `Error: ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exit(1);
      }
    },
  )
  .demandCommand(1, 'Error: command required')
  .showHelpOnFail(true)
  .help()
  .alias('help', 'h')
  .version()
  .alias('version', 'v')
  .wrap(process.stdout.isTTY ? process.stdout.columns || 80 : 80)
  .parseAsync()
  .catch((error) => {
    console.error(
      `Fatal error: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
