import styles from './MatchAnalysisPage.module.css';

interface PredictionProvenanceProps {
  readonly hasSnapshot: boolean;
  readonly generatedAt: Date | string;
  readonly kickoffAt: Date | string;
}

export function PredictionProvenance({ hasSnapshot, generatedAt, kickoffAt }: PredictionProvenanceProps) {
  const retrospective = new Date(generatedAt).getTime() >= new Date(kickoffAt).getTime();
  return (
    <>
      {!hasSnapshot ? (
        <p role="status" className={styles.meta}>
          Predicción antigua sin datos originales guardados. No es posible
          reproducir este cálculo ni mostrar su comparación original.
        </p>
      ) : null}
      {retrospective ? (
        <p role="status" className={styles.meta}>
          Reconstrucción retrospectiva: este cálculo se generó al inicio o después
          del inicio del partido, no como pronóstico previo.
        </p>
      ) : null}
    </>
  );
}
