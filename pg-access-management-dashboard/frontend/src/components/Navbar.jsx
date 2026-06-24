import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../hooks/useTheme';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initials = user?.username?.slice(0, 2).toUpperCase() || '??';

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <NavLink to="/">PG Role Dashboard</NavLink>
      </div>
      <div className="navbar-links">
        <NavLink to="/" end>Servers</NavLink>
        <NavLink to="/grants">Grants</NavLink>
        {user?.is_admin && <NavLink to="/users">Users</NavLink>}
        <div className="navbar-divider" />
        <button
          onClick={toggle}
          className="btn btn-ghost btn-sm theme-toggle"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <div className="navbar-divider" />
        <div className="navbar-user">
          <div className="user-avatar">{initials}</div>
          {user?.username}
        </div>
        <button onClick={handleLogout} className="btn btn-ghost btn-sm">Logout</button>
      </div>
    </nav>
  );
}
