import type {
  BacktestBaselineMetrics,
  BacktestCalibrationBucket,
  BacktestCompetitionMetrics,
} from '@sports-prediction/database';
import type {
  MatchOutcome,
  OutcomeProbabilities,
  PredictionEvaluation,
} from '@sports-prediction/domain';
import { brierScore, logLoss } from '@sports-prediction/prediction';

export interface BacktestSample {
  readonly competitionId: string;
  readonly competitionName: string;
  readonly confidence: number;
  readonly evaluation: PredictionEvaluation;
  readonly actualOutcome: MatchOutcome;
}

export interface BacktestSummary {
  readonly samples: number;
  readonly exactScoreRate: number;
  readonly winnerRate: number;
  readonly maeGoals: number;
  readonly brierScore: number | null;
  readonly logLoss: number | null;
  readonly byCompetition: readonly BacktestCompetitionMetrics[];
  readonly baselines: readonly BacktestBaselineMetrics[];
  readonly calibration: readonly BacktestCalibrationBucket[];
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * Naive reference models to judge whether the engine adds real signal.
 * - always_home: predicts home win with historical 1X2 frequencies.
 * - uniform: 1/3 for each outcome.
 * - frequency: predicts the most common outcome with observed base rates.
 */
function buildBaselines(samples: readonly BacktestSample[]): BacktestBaselineMetrics[] {
  if (samples.length === 0) return [];

  const counts: Record<MatchOutcome, number> = { home: 0, draw: 0, away: 0 };
  for (const sample of samples) counts[sample.actualOutcome] += 1;
  const total = samples.length;
  const baseRates: OutcomeProbabilities = {
    home: counts.home / total,
    draw: counts.draw / total,
    away: counts.away / total,
  };
  const uniform: OutcomeProbabilities = { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };

  const mostCommon: MatchOutcome =
    baseRates.home >= baseRates.draw && baseRates.home >= baseRates.away
      ? 'home'
      : baseRates.away >= baseRates.draw
        ? 'away'
        : 'draw';

  const score = (
    label: string,
    pick: MatchOutcome,
    probabilities: OutcomeProbabilities,
  ): BacktestBaselineMetrics => ({
    label,
    winnerRate: counts[pick] / total,
    brierScore: mean(
      samples.map((sample) => brierScore(probabilities, sample.actualOutcome)),
    ),
    logLoss: mean(
      samples.map((sample) => logLoss(probabilities, sample.actualOutcome)),
    ),
  });

  return [
    score('always_home', 'home', baseRates),
    score('uniform', mostCommon, uniform),
    score('base_rates', mostCommon, baseRates),
  ];
}

function buildCalibration(
  samples: readonly BacktestSample[],
): BacktestCalibrationBucket[] {
  const edges = [0, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0001];
  const buckets: BacktestCalibrationBucket[] = [];
  for (let index = 0; index < edges.length - 1; index += 1) {
    const rangeStart = edges[index] ?? 0;
    const rangeEnd = edges[index + 1] ?? 1;
    const inBucket = samples.filter((sample) => {
      const confidence = sample.confidence / 100;
      return confidence >= rangeStart && confidence < rangeEnd;
    });
    if (inBucket.length === 0) continue;
    buckets.push({
      rangeStart,
      rangeEnd: Math.min(1, rangeEnd),
      samples: inBucket.length,
      averageConfidence: mean(inBucket.map((sample) => sample.confidence / 100)),
      observedAccuracy: mean(
        inBucket.map((sample) => (sample.evaluation.winnerImpliedMatch ? 1 : 0)),
      ),
    });
  }
  return buckets;
}

function buildByCompetition(
  samples: readonly BacktestSample[],
): BacktestCompetitionMetrics[] {
  const groups = new Map<string, BacktestSample[]>();
  for (const sample of samples) {
    const list = groups.get(sample.competitionId) ?? [];
    list.push(sample);
    groups.set(sample.competitionId, list);
  }

  return [...groups.entries()]
    .map(([competitionId, list]) => {
      const briers = list
        .map((sample) => sample.evaluation.brierScore)
        .filter((value): value is number => value !== null);
      return {
        competitionId,
        competitionName: list[0]?.competitionName ?? competitionId,
        samples: list.length,
        winnerRate: mean(
          list.map((sample) => (sample.evaluation.winnerImpliedMatch ? 1 : 0)),
        ),
        exactScoreRate: mean(
          list.map((sample) => (sample.evaluation.exactScore ? 1 : 0)),
        ),
        brierScore: briers.length > 0 ? mean(briers) : null,
      };
    })
    .sort((a, b) => b.samples - a.samples);
}

export function summarizeBacktest(
  samples: readonly BacktestSample[],
): BacktestSummary {
  const total = samples.length;
  const briers = samples
    .map((sample) => sample.evaluation.brierScore)
    .filter((value): value is number => value !== null);
  const losses = samples
    .map((sample) => sample.evaluation.logLoss)
    .filter((value): value is number => value !== null);

  return {
    samples: total,
    exactScoreRate: mean(
      samples.map((sample) => (sample.evaluation.exactScore ? 1 : 0)),
    ),
    winnerRate: mean(
      samples.map((sample) => (sample.evaluation.winnerImpliedMatch ? 1 : 0)),
    ),
    maeGoals: mean(
      samples.map(
        (sample) =>
          Math.abs(sample.evaluation.predictedHome - sample.evaluation.actualHome) +
          Math.abs(sample.evaluation.predictedAway - sample.evaluation.actualAway),
      ),
    ),
    brierScore: briers.length > 0 ? mean(briers) : null,
    logLoss: losses.length > 0 ? mean(losses) : null,
    byCompetition: buildByCompetition(samples),
    baselines: buildBaselines(samples),
    calibration: buildCalibration(samples),
  };
}
