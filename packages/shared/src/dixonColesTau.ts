/**
 * Dixon-Coles low-score dependency correction. Returns the multiplicative
 * adjustment applied to the independent Poisson probability of (home, away)
 * goals given expected goals `lambda` (home) and `mu` (away).
 * Negative `rho` boosts 0-0 and 1-1 and dampens 1-0 and 0-1.
 */
export function dixonColesTau(
  home: number,
  away: number,
  lambda: number,
  mu: number,
  rho: number,
): number {
  if (home === 0 && away === 0) return 1 - lambda * mu * rho;
  if (home === 0 && away === 1) return 1 + lambda * rho;
  if (home === 1 && away === 0) return 1 + mu * rho;
  if (home === 1 && away === 1) return 1 - rho;
  return 1;
}
