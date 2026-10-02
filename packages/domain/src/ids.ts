export type SportId = string & { readonly __brand: 'SportId' };
export type CompetitionId = string & { readonly __brand: 'CompetitionId' };
export type SeasonId = string & { readonly __brand: 'SeasonId' };
export type TeamId = string & { readonly __brand: 'TeamId' };
export type PlayerId = string & { readonly __brand: 'PlayerId' };
export type VenueId = string & { readonly __brand: 'VenueId' };
export type MatchId = string & { readonly __brand: 'MatchId' };
export type DataSourceId = string & { readonly __brand: 'DataSourceId' };
export type PredictionId = string & { readonly __brand: 'PredictionId' };

export function asSportId(value: string): SportId {
  return value as SportId;
}

export function asCompetitionId(value: string): CompetitionId {
  return value as CompetitionId;
}

export function asTeamId(value: string): TeamId {
  return value as TeamId;
}

export function asMatchId(value: string): MatchId {
  return value as MatchId;
}

export function asDataSourceId(value: string): DataSourceId {
  return value as DataSourceId;
}

export function asPredictionId(value: string): PredictionId {
  return value as PredictionId;
}
