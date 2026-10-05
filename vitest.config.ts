import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

/** Tests import workspace packages from source, without a prior build. */
const workspaceAlias = [
  'shared',
  'domain',
  'normalization',
  'prediction',
  'features',
  'scraping',
  'database',
].map((name) => ({
  find: `@sports-prediction/${name}`,
  replacement: path.join(root, 'packages', name, 'src', 'index.ts'),
}));

export default defineConfig({
  resolve: { alias: workspaceAlias },
  test: {
    include: [
      'packages/*/src/**/*.spec.ts',
      'apps/*/src/**/*.spec.ts',
      'apps/*/src/**/*.spec.tsx',
    ],
  },
});
