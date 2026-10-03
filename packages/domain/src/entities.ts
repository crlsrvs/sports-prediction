import type {
  CompetitionId,
  DataSourceId,
  MatchId,
  PredictionId,
  SeasonId,
  SportId,
  TeamId,
  VenueId,
} from './ids.js';

export type MatchStatus =
  | 'scheduled'
  | 'live'
  | 'finished'
  | 'postponed'
  | 'cancelled';

export interface Sport {
  readonly id: SportId;
  readonly name: string;
  readonly slug: string;
  readonly active: boolean;
}

export interface Competition {
  readonly id: CompetitionId;
  readonly sportId: SportId;
  readonly name: string;
  readonly country: string | null;
  readonly active: boolean;
}

export interface Team {
  readonly id: TeamId;
  readonly sportId: SportId;
  readonly canonicalName: string;
  readonly aliases: readonly string[];
}

export interface Match {
  readonly id: MatchId;
  readonly sportId: SportId;
  readonly competitionId: CompetitionId;
  readonly seasonId: SeasonId | null;
  readonly homeTeamId: TeamId;
  readonly awayTeamId: TeamId;
  readonly scheduledAt: Date;
  readonly venueId: VenueId | null;
  readonly status: MatchStatus;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  readonly sourceId: DataSourceId | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type PredictionFactorDirection = 'positive' | 'negative' | 'neutral';

export interface PredictionFactor {
  readonly feature: string;
  readonly value: number;
  readonly impact: number;
  readonly direction: PredictionFactorDirection;
  readonly explanation: string;
}

export interface PredictedScore {
  readonly home: number;
  readonly away: number;
}

export interface ExpectedGoals {
  readonly home: number;
  readonly away: number;
}

export type MatchOutcome = 'home' | 'draw' | 'away';

/** Probabilities for each 1X2 outcome; they sum to ~1. */
export interface OutcomeProbabilities {
  readonly home: number;
  readonly draw: number;
  readonly away: number;
}

export interface Prediction {
  readonly id: PredictionId;
  readonly matchId: MatchId;
  readonly generatedAt: Date;
  /** Exclusive upper bound of data allowed into the model. */
  readonly dataCutoffAt: Date;
  readonly modelVersion: string;
  readonly predictedScore: PredictedScore;
  readonly expectedGoals: ExpectedGoals;
  readonly confidence: number;
  readonly factors: readonly PredictionFactor[];
  /** Null for models that do not produce a score distribution. */
  readonly outcomeProbabilities: OutcomeProbabilities | null;
}

/**
 * Team strength ratings fitted jointly on all results before the cutoff
 * (Dixon-Coles). Attack is relative to league average (1 = average); defense is
 * expressed in goals conceded per match against an average attack.
 */
export interface MatchRatings {
  readonly model: 'dixon-coles';
  readonly homeAttack: number;
  readonly homeDefense: number;
  readonly awayAttack: number;
  readonly awayDefense: number;
  readonly homeAdvantage: number;
  /** Low-score dependency parameter; negative values boost 0-0 and 1-1. */
  readonly rho: number;
  readonly leagueAverageGoals: number;
  /** Number of prior matches that informed each team's rating. */
  readonly homeMatches: number;
  readonly awayMatches: number;
}

export interface FeatureSnapshot {
  readonly matchId: MatchId;
  readonly dataCutoffAt: Date;
  /** Null when ratings were not fitted for this snapshot. */
  readonly ratings: MatchRatings | null;
  readonly homeForm: readonly string[];
  readonly awayForm: readonly string[];
  readonly homeAttack: number;
  readonly awayAttack: number;
  readonly homeDefense: number;
  readonly awayDefense: number;
  readonly homeStrength: number;
  readonly awayStrength: number;
  readonly restDaysHome: number | null;
  readonly restDaysAway: number | null;
  readonly injuryImpactHome: number;
  readonly injuryImpactAway: number;
  readonly squadChangeHome: number;
  readonly squadChangeAway: number;
  readonly dataCompleteness: number;
}
