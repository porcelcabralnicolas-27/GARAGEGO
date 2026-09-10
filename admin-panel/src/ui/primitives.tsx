import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { initials } from '../lib/format';

/* ---------------------------------------------------------------- Button */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'md' | 'sm';
  block?: boolean;
};

export function Button({
  variant = 'secondary',
  size = 'md',
  block,
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    'gg-btn',
    `gg-btn--${variant}`,
    size === 'sm' ? 'gg-btn--sm' : '',
    block ? 'gg-btn--block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <button type={type} className={classes} {...rest} />;
}

/* ---------------------------------------------------------------- Badge */

export type BadgeTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'accent';

export function Badge({
  tone = 'neutral',
  dot,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={`gg-badge gg-badge--${tone}`}>
      {dot ? <span className="gg-badge__dot" /> : null}
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- Card */

export function Card({
  title,
  actions,
  children,
  className = '',
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`gg-card ${className}`}>
      {title || actions ? (
        <header className="gg-card__head">
          {title ? <h2 className="gg-card__title">{title}</h2> : null}
          {actions ? <div className="gg-card__head-actions">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/* ---------------------------------------------------------------- Callout */

export function Callout({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'info' | 'warn' | 'danger';
  children: ReactNode;
}) {
  // Los hijos van envueltos siempre: `.gg-callout` es flex, y sin este wrapper cada nodo de
  // texto y cada <strong> se convierte en un item aparte y la frase se corta en pedazos.
  return (
    <div className={`gg-callout gg-callout--${tone}`}>
      <div>{children}</div>
    </div>
  );
}

/** Nota al pie en gris chico: aclara una limitación o el alcance de una pantalla. */
export function SchemaNote({ children }: { children: ReactNode }) {
  return <p className="gg-schema-note">{children}</p>;
}

/* ---------------------------------------------------------------- Toggle */

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`gg-toggle ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="gg-toggle__knob" />
    </button>
  );
}

/* ---------------------------------------------------------------- Avatar */

export function Avatar({
  person,
  size = 28,
}: {
  person: { firstName: string; lastName: string };
  size?: number;
}) {
  return (
    <span
      className="gg-avatar"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden
    >
      {initials(person)}
    </span>
  );
}

/** Celda de usuario: avatar + nombre y, opcionalmente, una línea secundaria. */
export function UserCell({
  person,
  sub,
  size,
}: {
  person: { firstName: string; lastName: string };
  sub?: string;
  size?: number;
}) {
  return (
    <div className="gg-user-cell">
      <Avatar person={person} size={size} />
      <div style={{ minWidth: 0 }}>
        <div className="gg-user-cell__name">
          {person.firstName} {person.lastName}
        </div>
        {sub ? <div className="gg-user-cell__sub">{sub}</div> : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- StarRating */

export function StarRating({ value, size = 13 }: { value: number; size?: number }) {
  const rounded = Math.round(value);
  return (
    <span className="gg-stars" style={{ fontSize: size }} aria-label={`${value} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= rounded ? '' : 'gg-stars__off'}>
          ★
        </span>
      ))}
    </span>
  );
}

/* ---------------------------------------------------------------- EmptyState */

export function EmptyState({
  icon = '∅',
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="gg-empty">
      <div>
        <div className="gg-empty__icon">{icon}</div>
        <div className="gg-empty__title">{title}</div>
        {description ? <p className="gg-empty__desc">{description}</p> : null}
        {action ? <div style={{ marginTop: 'var(--gg-s4)' }}>{action}</div> : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- KeyValue */

export function KeyValue({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="gg-kv">
      {items.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt className="gg-kv__k">{k}</dt>
          <dd className="gg-kv__v">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
