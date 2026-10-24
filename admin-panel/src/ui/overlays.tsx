import { useEffect, type ReactNode } from 'react';

import { Button } from './primitives';

/** Cierra con Escape. Lo comparten Modal y Drawer. */
function useEscape(onClose: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, active]);
}

/* ---------------------------------------------------------------- Modal */

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEscape(onClose, open);
  if (!open) return null;

  return (
    <div
      className="gg-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      // Solo cierra si el click empezó y terminó en el fondo: si no, arrastrar una selección de
      // texto desde adentro hacia afuera cerraría el modal y se perdería lo escrito.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`gg-modal ${wide ? 'gg-modal--wide' : ''}`}>
        <header className="gg-modal__head">
          <h2 className="gg-modal__title">{title}</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Cerrar"
            style={{ marginLeft: 'auto' }}
          >
            ✕
          </Button>
        </header>
        <div className="gg-modal__body">{children}</div>
        {footer ? <footer className="gg-modal__foot">{footer}</footer> : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Drawer */

export function Drawer({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEscape(onClose, open);
  if (!open) return null;

  return (
    <div
      className="gg-drawer-overlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="gg-drawer">
        <header className="gg-drawer__head">
          <div style={{ minWidth: 0 }}>
            <div className="gg-modal__title">{title}</div>
            {subtitle ? (
              <div style={{ color: 'var(--gg-text-soft)', fontSize: 'var(--gg-fs-md)' }}>{subtitle}</div>
            ) : null}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Cerrar" style={{ marginLeft: 'auto' }}>
            ✕
          </Button>
        </header>
        <div className="gg-drawer__body">{children}</div>
        {footer ? <footer className="gg-drawer__foot">{footer}</footer> : null}
      </aside>
    </div>
  );
}

export function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="gg-drawer__section">
      <h3 className="gg-drawer__section-title">{title}</h3>
      {children}
    </section>
  );
}
