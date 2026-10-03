/**
 * Provider-agnostic catalogue of the competitions we ingest, with the
 * identifier each provider uses for them. Adding a provider means adding a
 * column here, not a new list.
 */
export interface TrackedCompetition {
  readonly competitionId: string;
  readonly name: string;
  readonly country: string | null;
  /**
   * `featured` competitions are shown to end users (MVP scope).
   * `support` competitions are ingested only so that opponents met in European
   * cups carry opponent-adjusted ratings from their domestic results.
   */
  readonly role: 'featured' | 'support';
  readonly apiFootballLeagueId: number;
  readonly footballDataCode: string;
}

export const TRACKED_COMPETITIONS: readonly TrackedCompetition[] = [
  { competitionId: 'comp-ucl', name: 'UEFA Champions League', country: null, role: 'featured', apiFootballLeagueId: 2, footballDataCode: 'CL' },
  { competitionId: 'comp-pl', name: 'Premier League', country: 'England', role: 'featured', apiFootballLeagueId: 39, footballDataCode: 'PL' },
  { competitionId: 'comp-laliga', name: 'La Liga', country: 'Spain', role: 'featured', apiFootballLeagueId: 140, footballDataCode: 'PD' },
  { competitionId: 'comp-bundesliga', name: 'Bundesliga', country: 'Germany', role: 'support', apiFootballLeagueId: 78, footballDataCode: 'BL1' },
  { competitionId: 'comp-seriea', name: 'Serie A', country: 'Italy', role: 'support', apiFootballLeagueId: 135, footballDataCode: 'SA' },
  { competitionId: 'comp-ligue1', name: 'Ligue 1', country: 'France', role: 'support', apiFootballLeagueId: 61, footballDataCode: 'FL1' },
];

export function competitionIdForApiFootballLeague(leagueId: number): string | null {
  return (
    TRACKED_COMPETITIONS.find((item) => item.apiFootballLeagueId === leagueId)
      ?.competitionId ?? null
  );
}

export function competitionIdForFootballDataCode(code: string): string | null {
  return (
    TRACKED_COMPETITIONS.find((item) => item.footballDataCode === code)
      ?.competitionId ?? null
  );
}
