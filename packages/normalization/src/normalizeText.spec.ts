import { describe, expect, it } from 'vitest';
import { normalizeClubName, normalizeEntityText } from './normalizeText.js';

describe('normalizeEntityText', () => {
  it('lowercases, strips accents and transliterates nordic letters', () => {
    // Arrange
    const inputs = ['Atlético de Madrid', 'FK Bodø/Glimt', 'Bayern München'];

    // Act
    const result = inputs.map(normalizeEntityText);

    // Assert
    expect(result).toEqual(['atletico de madrid', 'fk bodo glimt', 'bayern munchen']);
  });
});

describe('normalizeClubName', () => {
  it('drops legal forms and years but keeps distinguishing words', () => {
    // Arrange & Act
    const leverkusen = normalizeClubName('Bayer 04 Leverkusen');
    const mainz = normalizeClubName('1. FSV Mainz 05');
    const united = normalizeClubName('Manchester United FC');
    const empty = normalizeClubName('FC 1904');

    // Assert
    expect(leverkusen).toBe('bayer leverkusen');
    expect(mainz).toBe('mainz');
    expect(united).toBe('manchester united');
    expect(empty).toBe('');
  });
});
