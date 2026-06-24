import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useTheme } from './hooks/useTheme';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Servers from './pages/Servers';
import DatabaseView from './pages/DatabaseView';
import Grants from './pages/Grants';
import Users from './pages/Users';

function Layout({ children }) {
  return (
    <>
      <Navbar />
      <main className="main-content">{children}</main>
    </>
  );
}

function ThemeInit() {
  useTheme();
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeInit />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={
            <ProtectedRoute>
              <Layout><Servers /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/servers/:serverId" element={
            <ProtectedRoute>
              <Layout><DatabaseView /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/grants" element={
            <ProtectedRoute>
              <Layout><Grants /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/users" element={
            <ProtectedRoute adminOnly>
              <Layout><Users /></Layout>
            </ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
