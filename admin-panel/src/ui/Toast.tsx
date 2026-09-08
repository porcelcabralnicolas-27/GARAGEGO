import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

/**
 * Toasts con "Deshacer".
 *
 * El deshacer es la razón de existir de esto: aprobar o rechazar una publicación es una acción de
 * un solo click sobre datos ajenos, y sin una salida rápida el revisor tiene que ir a buscar la
 * fila a otra pestaña para revertir. La ventana de 6 s alcanza para el "uy, no era esa".
 */

type Toast = {
  id: number;
  message: string;
  undoLabel?: string;
  onUndo?: () => void;
};

const TOAST_MS = 6000;

type ToastContextValue = {
  show: (message: string, undo?: { label?: string; onUndo: () => void }) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const show = useCallback<ToastContextValue['show']>(
    (message, undo) => {
      const id = nextId.current;
      nextId.current += 1;
      setToasts((current) => [
        ...current,
        { id, message, undoLabel: undo?.label ?? 'Deshacer', onUndo: undo?.onUndo },
      ]);
      setTimeout(() => dismiss(id), TOAST_MS);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="gg-toasts">
        {toasts.map((toast) => (
          <div key={toast.id} className="gg-toast" role="status">
            <span>{toast.message}</span>
            {toast.onUndo ? (
              <button
                type="button"
                className="gg-toast__undo"
                onClick={() => {
                  toast.onUndo?.();
                  dismiss(toast.id);
                }}
              >
                {toast.undoLabel}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return ctx;
}
