import { spawnSync } from 'node:child_process';

const workspaces = [
  '@sports-prediction/shared',
  '@sports-prediction/domain',
  '@sports-prediction/normalization',
  '@sports-prediction/prediction',
  '@sports-prediction/features',
  '@sports-prediction/scraping',
  '@sports-prediction/database',
  '@sports-prediction/api',
  '@sports-prediction/worker',
];

if (process.env['SKIP_WEB'] !== '1') {
  workspaces.push('@sports-prediction/web');
}

for (const workspace of workspaces) {
  const result = spawnSync('npm', ['run', 'build', `--workspace=${workspace}`], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
