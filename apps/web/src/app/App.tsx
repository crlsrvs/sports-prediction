import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AdminGate } from '../features/admin/AdminGate.js';
import { MatchAnalysisPage } from '../features/analysis/MatchAnalysisPage.js';
import { TodayDashboard } from '../features/today/TodayDashboard.js';
import styles from './App.module.css';

function HeaderCopy() {
  const { pathname } = useLocation();

  if (pathname.startsWith('/matches/')) {
    return (
      <>
        <h1 className={styles.title}>Análisis del partido</h1>
        <p className={styles.subtitle}>
          Factores deterministas, comparación y confiabilidad del modelo.
        </p>
      </>
    );
  }

  if (pathname.startsWith('/admin')) {
    return (
      <>
        <h1 className={styles.title}>Panel administrativo</h1>
        <p className={styles.subtitle}>
          Fuentes, entidades, predicciones y backtesting interno.
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className={styles.title}>Partidos de hoy</h1>
      <p className={styles.subtitle}>
        Análisis y marcador estimado generados por un motor matemático reproducible.
      </p>
    </>
  );
}

export function App() {
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.brandRow}>
          <p className={styles.brand}>Sports Prediction</p>
          <nav className={styles.nav}>
            <Link to="/">Hoy</Link>
            <Link to="/admin">Admin</Link>
          </nav>
        </div>
        <HeaderCopy />
      </header>
      <main>
        <Routes>
          <Route path="/" element={<TodayDashboard />} />
          <Route path="/matches/:id" element={<MatchAnalysisPage />} />
          <Route path="/admin" element={<AdminGate />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
