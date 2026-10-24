import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider';
import { Button } from '../ui/primitives';
import { usePendingCounts } from './usePendingCounts';

const NAV = [
  { to: '/dashboard', icon: '◫', label: 'Dashboard' },
  { to: '/usuarios', icon: '☰', label: 'Usuarios' },
  { to: '/inventario', icon: '⛭', label: 'Inventario' },
  { to: '/soporte', icon: '✉', label: 'Soporte' },
] as const;

const TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/usuarios': 'Gestión de usuarios',
  '/inventario': 'Control de inventario',
  '/soporte': 'Operaciones de soporte',
};

/** Guard de ruta: sin admin, al login. */
export function RequireAdmin() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="gg-empty">
        <div className="gg-empty__title">Cargando…</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return <AdminLayout />;
}

function AdminLayout() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  // Solo se usa en pantallas angostas, donde la sidebar es un menú que se abre y se cierra.
  const [menuOpen, setMenuOpen] = useState(false);

  // Al navegar a otra sección el menú se cierra solo.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const counts = usePendingCounts();
  const title = TITLES[`/${location.pathname.split('/')[1]}`] ?? 'Panel';

  const countFor = (to: string) =>
    to === '/inventario' ? counts.pendingLots : to === '/soporte' ? counts.openTickets : 0;

  return (
    <>
      <div className="gg-shell">
        <div
          className={`gg-backdrop ${menuOpen ? 'is-open' : ''}`}
          onClick={() => setMenuOpen(false)}
          aria-hidden
        />
        <nav className={`gg-sidebar ${menuOpen ? 'is-open' : ''}`} aria-label="Navegación principal">
          <div className="gg-sidebar__brand">
            <span className="gg-sidebar__logo">GG</span>
            <div>
              <div className="gg-sidebar__name">GarageGo</div>
              <div className="gg-sidebar__sub">Administración</div>
            </div>
          </div>

          <div className="gg-sidebar__nav">
            {NAV.map((item) => {
              const count = countFor(item.to);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `gg-sidebar__link ${isActive ? 'is-active' : ''}`}
                >
                  <span className="gg-sidebar__icon" aria-hidden>
                    {item.icon}
                  </span>
                  <span className="gg-sidebar__label">{item.label}</span>
                  {count > 0 ? (
                    <span
                      className={`gg-sidebar__count ${
                        item.to === '/inventario' ? 'gg-sidebar__count--warn' : ''
                      }`}
                    >
                      {count}
                    </span>
                  ) : null}
                </NavLink>
              );
            })}
          </div>

        </nav>

        <div className="gg-main">
          <header className="gg-topbar">
            <button
              type="button"
              className="gg-menu-btn"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={menuOpen}
            >
              ☰
            </button>
            <span className="gg-topbar__title">{title}</span>
            <span className="gg-topbar__spacer" />
            <span className="gg-topbar__user">
              {user ? `${user.firstName} ${user.lastName}`.trim() || user.email : ''}
            </span>
            <Button size="sm" variant="ghost" onClick={signOut}>
              Cerrar sesión
            </Button>
          </header>

          <main className="gg-content">
            <Outlet />
          </main>
        </div>
      </div>
    </>
  );
}
