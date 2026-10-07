import { resolve } from 'node:path';
import { prepareSyntheticPublication } from './publication-preparation.mjs';

const outputDirectory = resolve(
  process.argv[2] ?? './.artifacts/appwrite-live-acceptance',
);

const result = await prepareSyntheticPublication({ outputDirectory });
process.stdout.write(
  `${JSON.stringify(
    {
      outputDirectory,
      commandPlan: result.commandPlan,
      generation: result.generation,
    },
    null,
    2,
  )}\n`,
);
