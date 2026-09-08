import type { ReactNode } from 'react';

/* ---------------------------------------------------------------- Tabs */

export type TabItem<T extends string> = {
  value: T;
  label: string;
  /** Contador a la derecha de la etiqueta (pendientes, abiertos…). */
  count?: number;
  countTone?: 'warn' | 'neutral';
};

export function Tabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="gg-tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={item.value === value}
          className={`gg-tab ${item.value === value ? 'is-active' : ''}`}
          onClick={() => onChange(item.value)}
        >
          {item.label}
          {item.count !== undefined && item.count > 0 ? (
            <span
              className={`gg-badge gg-badge--${item.countTone === 'warn' ? 'warn' : 'neutral'}`}
            >
              {item.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/** Sub-tabs en forma de pastilla, para adentro de la columna de lista. */
export function SubTabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="gg-subtabs">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          className={`gg-subtab ${item.value === value ? 'is-active' : ''}`}
          onClick={() => onChange(item.value)}
        >
          {item.label}
          {item.count !== undefined ? ` (${item.count})` : ''}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- Inputs */

export function SearchInput({
  value,
  onChange,
  placeholder = 'Buscar…',
  width,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  width?: number;
}) {
  return (
    <div className="gg-search">
      <span className="gg-search__icon" aria-hidden>
        ⌕
      </span>
      <input
        className="gg-input"
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={width ? { width } : undefined}
      />
    </div>
  );
}

export function FilterSelect<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (next: T) => void;
  options: Array<{ value: T; label: string }>;
  label: string;
}) {
  return (
    <select
      className="gg-select"
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="gg-field">
      <label className="gg-field__label">{label}</label>
      {children}
      {error ? <span className="gg-field__error">{error}</span> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- Toolbar */

export function Toolbar({ children, count }: { children: ReactNode; count?: string }) {
  return (
    <div className="gg-toolbar">
      {children}
      {count ? <span className="gg-toolbar__count">{count}</span> : null}
    </div>
  );
}
