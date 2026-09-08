import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider';
import { useMock } from '../state/MockDataProvider';
import { selectPendingCounts } from '../state/selectors';
import { Badge, Button } from '../ui/primitives';

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
  const { state, reset } = useMock();
  const location = useLocation();

  const counts = selectPendingCounts(state);
  const title = TITLES[`/${location.pathname.split('/')[1]}`] ?? 'Panel';

  const countFor = (to: string) =>
    to === '/inventario' ? counts.pendingLots : to === '/soporte' ? counts.openTickets : 0;

  return (
    <>
      <div className="gg-shell">
        <nav className="gg-sidebar">
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

          <div className="gg-sidebar__foot">
            <Button size="sm" variant="ghost" onClick={reset} block>
              Restablecer datos de demo
            </Button>
            <p className="gg-sidebar__foot-note">
              Salvo el inicio de sesión, todo lo que ves es simulado.
            </p>
          </div>
        </nav>

        <div className="gg-main">
          <header className="gg-topbar">
            <span className="gg-topbar__title">{title}</span>
            {/* Siempre visible: nadie tiene que confundir la demo con producción. */}
            <Badge tone="warn" dot>
              Datos simulados
            </Badge>
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

      {/* Se muestra solo por debajo de 1100px (ver layout.css). */}
      <div className="gg-too-narrow">
        <div>
          <div className="gg-empty__icon">🖥</div>
          <div className="gg-empty__title">Este panel es para pantalla de escritorio</div>
          <p className="gg-empty__desc">
            Las bandejas de revisión y las tablas necesitan al menos 1100 px de ancho. Abrilo en
            una computadora o agrandá la ventana.
          </p>
        </div>
      </div>
    </>
  );
}
