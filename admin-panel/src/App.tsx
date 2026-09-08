import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AuthProvider } from './auth/AuthProvider';
import { LoginPage } from './auth/LoginPage';
import { RequireAdmin } from './shell/AdminLayout';
import { MockDataProvider } from './state/MockDataProvider';
import { ToastProvider } from './ui/Toast';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { UsersPage } from './pages/users/UsersPage';
import { InventoryPage } from './pages/inventory/InventoryPage';
import { SupportPage } from './pages/support/SupportPage';

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <MockDataProvider>
          <ToastProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<RequireAdmin />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/usuarios" element={<UsersPage />} />
                <Route path="/inventario" element={<InventoryPage />} />
                <Route path="/soporte" element={<SupportPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </ToastProvider>
        </MockDataProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
