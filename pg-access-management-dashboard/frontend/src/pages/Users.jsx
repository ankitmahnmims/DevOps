import { useState, useEffect } from 'react';
import { users as usersApi } from '../api/client';

export default function Users() {
  const [userList, setUserList] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', is_admin: false });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    usersApi.list().then(res => setUserList(res.data)).catch(console.error);
  }, []);

  const handleCreate = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await usersApi.create(form);
      setUserList(l => [...l, res.data]);
      setShowForm(false);
      setForm({ username: '', password: '', is_admin: false });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const toggleAllowed = async user => {
    const res = await usersApi.update(user.id, { is_allowed: !user.is_allowed });
    setUserList(l => l.map(u => u.id === user.id ? res.data : u));
  };

  const handleDelete = async id => {
    if (!confirm('Delete this user?')) return;
    await usersApi.remove(id);
    setUserList(l => l.filter(u => u.id !== id));
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Dashboard Users</h2>
          <p className="page-title-sub">{userList.length} user{userList.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>
          {showForm ? '✕ Cancel' : '+ Add User'}
        </button>
      </div>

      {showForm && (
        <div className="card form-card">
          <div className="card-header"><h3>New User</h3></div>
          <form onSubmit={handleCreate}>
            <div className="form-row">
              <div className="form-group">
                <label>Username</label>
                <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="e.g. john_doe" required minLength={3} />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Min. 8 characters" required minLength={8} />
              </div>
            </div>
            <div className="form-group checkbox-group">
              <label>
                <input type="checkbox" checked={form.is_admin} onChange={e => setForm(f => ({ ...f, is_admin: e.target.checked }))} />
                Grant admin privileges
              </label>
            </div>
            {error && <p className="error-msg">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Creating…' : 'Create User'}</button>
          </form>
        </div>
      )}

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {userList.map(u => (
              <tr key={u.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="user-avatar" style={{ width: 30, height: 30, fontSize: 11 }}>
                      {u.username.slice(0, 2).toUpperCase()}
                    </div>
                    <strong>{u.username}</strong>
                  </div>
                </td>
                <td>{u.is_admin ? <span className="badge badge-purple">Admin</span> : <span className="badge">User</span>}</td>
                <td><span className={`badge ${u.is_allowed ? 'badge-green' : 'badge-red'}`}>{u.is_allowed ? 'Allowed' : 'Blocked'}</span></td>
                <td><span className="text-muted">{new Date(u.created_at).toLocaleDateString()}</span></td>
                <td>
                  <div className="actions-cell">
                    <button className="btn btn-ghost btn-sm" onClick={() => toggleAllowed(u)}>
                      {u.is_allowed ? 'Block' : 'Allow'}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(u.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
