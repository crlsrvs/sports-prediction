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
  readonly provisionalTeamId: string | null;
}

export interface TeamMergeResultDto {
  readonly team: Team;
  readonly mergedTeamId: string;
  readonly movedMatches: number;
}

export interface ResolveEntityResultDto {
  readonly team: Team;
  readonly mergedTeamId: string | null;
  readonly movedMatches: number;
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

export interface LiveEvaluationDto {
  readonly modelVersion: string;
  readonly since: string;
  readonly liveOnly: boolean;
  readonly backfilled: number;
  readonly firstKickoffAt: string | null;
  readonly lastKickoffAt: string | null;
  readonly samples: number;
  readonly exactScoreRate: number;
  readonly winnerRate: number;
  readonly maeGoals: number;
  readonly brierScore: number | null;
  readonly logLoss: number | null;
  readonly byCompetition: readonly BacktestCompetitionDto[];
  readonly baselines: readonly BacktestBaselineDto[];
  readonly calibration: readonly BacktestCalibrationDto[];
}

export interface ScheduleDto {
  readonly id: string;
  readonly name: string;
  readonly cron: string;
  readonly description: string;
  readonly nextRunAt: string | null;
  readonly registered: boolean;
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
  enqueueJob: (input: { name: string; season?: number; chain?: boolean }) =>
    request<{ jobId: string; name: string }>('/admin/jobs', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  getJobs: () => request<ScrapingJobDto[]>('/admin/scraping/jobs'),
  getSchedules: () => request<ScheduleDto[]>('/admin/schedules'),
  getUnresolved: () => request<UnresolvedEntityDto[]>('/admin/entities/unresolved'),
  resolveEntity: (body: {
    unresolvedId: string;
    teamId: string;
    alias: string;
  }) =>
    request<ResolveEntityResultDto>('/admin/entities/match', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  mergeTeams: (body: { sourceTeamId: string; targetTeamId: string }) =>
    request<TeamMergeResultDto>('/admin/teams/merge', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getPredictions: () => request<Prediction[]>('/admin/predictions'),
  runBacktest: (model?: string) =>
    request<BacktestRunDto>('/admin/backtests', {
      method: 'POST',
      body: JSON.stringify(model ? { model } : {}),
    }),
  getBacktestHistory: () => request<BacktestRunDto[]>('/admin/backtests'),
  getModels: () => request<ModelsDto>('/admin/models'),
  getLiveEvaluation: (options: { model?: string; since?: string; liveOnly?: boolean }) => {
    const params = new URLSearchParams();
    if (options.model) params.set('model', options.model);
    if (options.since) params.set('since', options.since);
    if (options.liveOnly === false) params.set('liveOnly', 'false');
    const query = params.toString();
    return request<LiveEvaluationDto>(
      `/admin/evaluations/summary${query ? `?${query}` : ''}`,
    );
  },
  generatePredictions: () =>
    request<{ generated: number }>('/admin/predictions/generate', {
      method: 'POST',
    }),
  regeneratePredictions: (options: { force?: boolean } = {}) =>
    request<{ regenerated: number; modelVersion: string }>(
      '/admin/predictions/regenerate',
      { method: 'POST', body: JSON.stringify(options) },
    ),
};
