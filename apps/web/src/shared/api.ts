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

export interface BacktestCompetitionDto {
  readonly competitionId: string;
  readonly competitionName: string;
  readonly samples: number;
  readonly winnerRate: number;
  readonly exactScoreRate: number;
  readonly brierScore: number | null;
}

export interface BacktestBaselineDto {
  readonly label: string;
  readonly winnerRate: number;
  readonly brierScore: number;
  readonly logLoss: number;
}

export interface BacktestCalibrationDto {
  readonly rangeStart: number;
  readonly rangeEnd: number;
  readonly samples: number;
  readonly averageConfidence: number;
  readonly observedAccuracy: number;
}

export interface BacktestRunDto {
  readonly id: string;
  readonly modelVersion: string;
  readonly ranAt: string;
  readonly samples: number;
  readonly exactScoreRate: number;
  readonly winnerRate: number;
  readonly maeGoals: number;
  readonly brierScore: number | null;
  readonly logLoss: number | null;
  readonly details: {
    readonly byCompetition: readonly BacktestCompetitionDto[];
    readonly baselines: readonly BacktestBaselineDto[];
    readonly calibration: readonly BacktestCalibrationDto[];
  };
}

export interface ModelsDto {
  readonly default: string;
  readonly available: readonly string[];
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
  enqueueJob: (input: { name: string; season?: number }) =>
    request<{ jobId: string; name: string }>('/admin/jobs', {
      method: 'POST',
      body: JSON.stringify(input),
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
  runBacktest: (model?: string) =>
    request<BacktestRunDto>(
      model ? `/admin/backtests?model=${encodeURIComponent(model)}` : '/admin/backtests',
    ),
  getBacktestHistory: () => request<BacktestRunDto[]>('/admin/backtests/history'),
  getModels: () => request<ModelsDto>('/admin/models'),
  generatePredictions: () =>
    request<{ generated: number }>('/admin/predictions/generate', {
      method: 'POST',
    }),
  regeneratePredictions: () =>
    request<{ regenerated: number; modelVersion: string }>(
      '/admin/predictions/regenerate',
      { method: 'POST' },
    ),
};
