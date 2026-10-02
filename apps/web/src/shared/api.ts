import type {
  MatchAnalysis,
  MatchCard,
  Prediction,
  Sport,
  Team,
} from '@sports-prediction/domain';

export interface DataSourceDto {
  readonly id: string;
  readonly name: string;
  readonly kind: 'api' | 'web';
  readonly active: boolean;
  readonly health: 'healthy' | 'warning' | 'broken' | 'disabled';
  readonly lastSuccessAt: string | null;
  readonly lastFailureAt: string | null;
  readonly consecutiveFailures: number;
}

export interface ScrapingJobDto {
  readonly id: string;
  readonly sourceId: string;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly status: 'queued' | 'running' | 'success' | 'partial' | 'failed';
  readonly recordsFound: number;
  readonly recordsProcessed: number;
  readonly recordsFailed: number;
  readonly error: string | null;
}

export interface UnresolvedEntityDto {
  readonly id: string;
  readonly incomingName: string;
  readonly sourceId: string;
  readonly createdAt: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`Error API ${response.status} en ${path}`);
  }

  return (await response.json()) as T;
}

export const api = {
  getTodayMatches: () => request<MatchCard[]>('/matches/today'),
  getMatchAnalysis: (id: string) =>
    request<MatchAnalysis>(`/matches/${id}/analysis`),
  getSports: () => request<Sport[]>('/sports'),
  getAdminHealth: () =>
    request<{
      sources: number;
      healthySources: number;
      jobs: number;
      unresolvedEntities: number;
      predictions: number;
    }>('/admin/health'),
  getSources: () => request<DataSourceDto[]>('/admin/sources'),
  testSource: (id: string) =>
    request<DataSourceDto>(`/admin/sources/${id}/test`, { method: 'POST' }),
  getJobs: () => request<ScrapingJobDto[]>('/admin/scraping/jobs'),
  getUnresolved: () => request<UnresolvedEntityDto[]>('/admin/entities/unresolved'),
  resolveEntity: (body: {
    unresolvedId: string;
    teamId: string;
    alias: string;
  }) =>
    request<Team>('/admin/entities/match', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getPredictions: () => request<Prediction[]>('/admin/predictions'),
  runBacktest: () =>
    request<{
      samples: number;
      exactScoreRate: number;
      winnerRate: number;
      maeGoals: number;
    }>('/admin/backtests'),
  generatePredictions: () =>
    request<{ generated: number }>('/admin/predictions/generate', {
      method: 'POST',
    }),
};
