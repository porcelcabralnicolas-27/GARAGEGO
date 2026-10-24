import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';

import { Button, Callout } from '../ui/primitives';
import { Field } from '../ui/controls';
import { useAuth } from './AuthProvider';

export function LoginPage() {
  const { user, isLoading, configError, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    const result = await signIn(email.trim(), password);
    if (result.error) setError(result.error);
    setIsSubmitting(false);
  };

  return (
    <div className="gg-login">
      <div className="gg-login__card">
        <div className="gg-login__brand">
          <span className="gg-sidebar__logo">GG</span>
          <div>
            <div className="gg-login__title">GarageGo</div>
            <div style={{ color: 'var(--gg-text-soft)', fontSize: 'var(--gg-fs-sm)' }}>
              Panel de administración
            </div>
          </div>
        </div>

        {configError ? (
          <Callout tone="danger">
            <div>
              <strong>Falta configurar el entorno.</strong>
              <p style={{ marginTop: 4 }}>{configError}</p>
            </div>
          </Callout>
        ) : (
          <form onSubmit={onSubmit}>
            <Field label="Email">
              <input
                className="gg-input"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>

            <Field label="Contraseña">
              <input
                className="gg-input"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>

            {error ? (
              <div style={{ marginBottom: 'var(--gg-s3)' }}>
                <Callout tone="danger">{error}</Callout>
              </div>
            ) : null}

            <Button
              type="submit"
              variant="primary"
              block
              disabled={isSubmitting || isLoading}
            >
              {isSubmitting ? 'Ingresando…' : 'Ingresar'}
            </Button>

            <p
              style={{
                marginTop: 'var(--gg-s4)',
                fontSize: 'var(--gg-fs-sm)',
                color: 'var(--gg-text-faint)',
                lineHeight: 1.5,
              }}
            >
              Acceso restringido al equipo interno. Se usa la misma cuenta que en la app, pero
              tiene que estar habilitada como administradora.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
