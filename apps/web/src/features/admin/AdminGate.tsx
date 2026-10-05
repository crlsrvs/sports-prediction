import { useState, useSyncExternalStore } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  adminCredential,
  api,
  setAdminSessionToken,
  subscribeAdminSession,
} from '../../shared/api.js';
import { AdminPage } from './AdminPage.js';
import styles from './AdminPage.module.css';

/**
 * Asks for ADMIN_PASSWORD and keeps the resulting session in sessionStorage.
 * The password never ships in the bundle. A build-time VITE_ADMIN_TOKEN still
 * works for deployments that have not switched to a password yet.
 */
export function AdminGate() {
  const credential = useSyncExternalStore(subscribeAdminSession, adminCredential, () => '');
  const [password, setPassword] = useState('');
  const session = useQuery({
    queryKey: ['admin', 'session'],
    queryFn: api.getAdminSession,
  });
  const login = useMutation({
    mutationFn: api.loginAdmin,
    onSuccess: (result) => {
      if (result.token) setAdminSessionToken(result.token);
    },
  });

  if (session.isPending) {
    return (
      <section className={styles.panel}>
        <p className={styles.message}>Comprobando acceso…</p>
      </section>
    );
  }

  const locked = session.data?.required === true && credential === '';
  if (!locked) return <AdminPage />;

  return (
    <section className={styles.panel}>
      <Link to="/" className={styles.backLink}>
        ← Volver al dashboard
      </Link>
      <h1 className={styles.title}>Administración</h1>
      {session.data?.passwordLogin ? (
        <form
          className={styles.actions}
          onSubmit={(event) => {
            event.preventDefault();
            login.mutate(password);
          }}
        >
          <p className={styles.message}>
            Introduce la contraseña de administración. La sesión dura 12 horas en esta pestaña.
          </p>
          <input
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
          />
          <button type="submit" disabled={login.isPending || password.length === 0}>
            {login.isPending ? 'Entrando…' : 'Entrar'}
          </button>
          {login.error ? <span className={styles.message}>{login.error.message}</span> : null}
        </form>
      ) : (
        <p className={styles.message}>
          Este entorno exige un token estático configurado al construir el frontend
          (VITE_ADMIN_TOKEN). Para iniciar sesión desde el navegador, define ADMIN_PASSWORD
          en la API.
        </p>
      )}
    </section>
  );
}
