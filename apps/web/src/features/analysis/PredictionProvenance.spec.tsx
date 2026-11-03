import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PredictionProvenance } from './PredictionProvenance.js';

describe('PredictionProvenance', () => {
  it('identifies legacy forecasts without attributing reconstructed inputs to them', () => {
    // Arrange
    const props = { hasSnapshot: false, generatedAt: '2026-11-03T10:00:00Z', kickoffAt: '2026-11-03T18:00:00Z' };

    // Act
    const html = renderToStaticMarkup(<PredictionProvenance {...props} />);

    // Assert
    expect(html).toContain('sin datos originales guardados');
    expect(html).not.toContain('Reconstrucción retrospectiva');
  });

  it.each(['2026-11-03T18:00:00Z', '2026-11-03T19:00:00Z'])(
    'labels calculations generated at or after kickoff (%s) as retrospective', (generatedAt) => {
      // Arrange
      const kickoffAt = '2026-11-03T18:00:00Z';

      // Act
      const html = renderToStaticMarkup(
        <PredictionProvenance hasSnapshot generatedAt={generatedAt} kickoffAt={kickoffAt} />,
      );

      // Assert
      expect(html).toContain('Reconstrucción retrospectiva');
      expect(html).toContain('no como pronóstico previo');
      expect(html).not.toContain('sin datos originales guardados');
    },
  );

  it('does not flag a stored pre-match calculation as legacy or retrospective', () => {
    // Arrange / Act
    const html = renderToStaticMarkup(<PredictionProvenance
      hasSnapshot generatedAt={new Date('2026-11-03T17:59:59.999Z')}
      kickoffAt={new Date('2026-11-03T18:00:00Z')}
    />);

    // Assert
    expect(html).toBe('');
  });
});
