import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

type MetricCardProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'warn';
  /** Si se pasa, la tarjeta entera es un link. Se usa para conectar el dashboard con la cola. */
  to?: string;
};

export function MetricCard({ label, value, hint, tone = 'default', to }: MetricCardProps) {
  const className = `gg-metric ${tone === 'warn' ? 'gg-metric--warn' : ''}`;

  const body = (
    <>
      <div className="gg-metric__label">{label}</div>
      <div className="gg-metric__value">{value}</div>
      {hint ? <div className="gg-metric__hint">{hint}</div> : null}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={className} style={{ color: 'inherit' }}>
        {body}
      </Link>
    );
  }

  return <div className={className}>{body}</div>;
}
