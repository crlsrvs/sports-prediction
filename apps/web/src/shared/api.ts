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
  readonly status:
    | 'queued'
    | 'running'
    | 'success'
    | 'partial'
    | 'failed'
    | 'skipped';
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

export interface TestSourceResult {
  readonly source: DataSourceDto;
  readonly detail: string;
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
    let detail = `Error API ${response.status} en ${path}`;
    try {
      const body = (await response.json()) as { message?: string | string[] };
      if (typeof body.message === 'string') detail = body.message;
      else if (Array.isArray(body.message)) detail = body.message.join(', ');
    } catch {
      // keep default
    }
    throw new Error(detail);
  }

  return (await response.json()) as T;
}

export const api = {
  getTodayMatches: () => request<MatchCard[]>('/matches/today'),
  getMatchAnalysis: (id: string) =>
    request<MatchAnalysis>(`/matches/${id}/analysis`),
  getSports: () => request<Sport[]>('/sports'),
  getTeams: () => request<Team[]>('/teams'),
  getCompetitions: () =>
    request<Array<{ id: string; name: string; sportId: string }>>(
      '/competitions',
    ),
  getMeta: () =>
    request<{ dataMode: 'seed' | 'live' }>('/meta'),
  getAdminHealth: () =>
    request<{
      sources: number;
      healthySources: number;
      jobs: number;
      unresolvedEntities: number;
      predictions: number;
      dataMode: 'seed' | 'live';
    }>('/admin/health'),
  getSources: () => request<DataSourceDto[]>('/admin/sources'),
  testSource: (id: string) =>
    request<TestSourceResult>(`/admin/sources/${id}/test`, { method: 'POST' }),
  enqueueJob: (name: string) =>
    request<{ jobId: string; name: string }>('/admin/jobs', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
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
