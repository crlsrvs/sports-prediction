import type {
  Competition,
  FeatureSnapshot,
  Match,
  Prediction,
  Team,
} from './entities.js';

export interface TeamComparisonMetric {
  readonly label: string;
  readonly homeValue: number;
  readonly awayValue: number;
}

export interface PredictionEvaluation {
  readonly predictedHome: number;
  readonly predictedAway: number;
  readonly actualHome: number;
  readonly actualAway: number;
  readonly exactScore: boolean;
  readonly winnerImpliedMatch: boolean;
}

export interface MatchCard {
  readonly match: Match;
  readonly competition: Competition;
  readonly homeTeam: Team;
  readonly awayTeam: Team;
  readonly homeForm: readonly string[];
  readonly awayForm: readonly string[];
  readonly prediction: Prediction | null;
}

export interface MatchAnalysis {
  readonly match: Match;
  readonly competition: Competition;
  readonly homeTeam: Team;
  readonly awayTeam: Team;
  readonly featureSnapshot: FeatureSnapshot | null;
  readonly prediction: Prediction | null;
  readonly unavailableReason: string | null;
  readonly comparison: readonly TeamComparisonMetric[];
  readonly evaluation: PredictionEvaluation | null;
}
