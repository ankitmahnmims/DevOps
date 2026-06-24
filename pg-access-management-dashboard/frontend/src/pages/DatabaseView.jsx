import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { servers as serversApi, grants as grantsApi } from '../api/client';

const CHARSET_LOWER   = 'abcdefghijklmnopqrstuvwxyz';
const CHARSET_UPPER   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CHARSET_DIGITS  = '0123456789';
const CHARSET_SPECIAL = '!';
const CHARSET_ALL     = CHARSET_LOWER + CHARSET_UPPER + CHARSET_DIGITS + CHARSET_SPECIAL;

function generatePassword() {
  const rand = chars => chars[Math.floor(Math.random() * chars.length)];
  // Guarantee at least one of each type
  const required = [
    rand(CHARSET_LOWER),
    rand(CHARSET_UPPER),
    rand(CHARSET_DIGITS),
    rand(CHARSET_SPECIAL),
  ];
  const rest = Array.from({ length: 12 }, () => rand(CHARSET_ALL));
  // Fisher-Yates shuffle
  const all = [...required, ...rest];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.join('');
}

function PasswordField({ value, onChange }) {
  const [pwdMode, setPwdMode] = useState('enter'); // 'enter' | 'generate'
  const [copied, setCopied] = useState(false);

  const handleGenerate = () => {
    const pwd = generatePassword();
    onChange(pwd);
    setCopied(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const switchMode = mode => {
    setPwdMode(mode);
    if (mode === 'generate') handleGenerate();
    else onChange('');
  };

  return (
    <div>
      <div className="pwd-mode-tabs">
        <button type="button" className={`pwd-mode-tab ${pwdMode === 'enter' ? 'active' : ''}`} onClick={() => switchMode('enter')}>Enter</button>
        <button type="button" className={`pwd-mode-tab ${pwdMode === 'generate' ? 'active' : ''}`} onClick={() => switchMode('generate')}>Generate</button>
      </div>

      {pwdMode === 'enter' ? (
        <input
          type="password"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Leave blank for no login"
        />
      ) : (
        <div className="pwd-generated-row">
          <input
            type="text"
            value={value}
            readOnly
            className="pwd-generated-input"
          />
          <button type="button" className="pwd-copy-btn" onClick={handleCopy} data-copied={copied}>
            {copied ? '✓ Copied' : '⎘ Copy'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm pwd-regen-btn" onClick={handleGenerate} title="Regenerate">↻</button>
        </div>
      )}
    </div>
  );
}

export default function DatabaseView() {
  const { serverId } = useParams();
  const [server, setServer] = useState(null);
  const [databases, setDatabases] = useState([]);
  const [selectedDb, setSelectedDb] = useState('');
  const [tables, setTables] = useState([]);
  const [importedRoles, setImportedRoles] = useState([]);
  const [activeGrants, setActiveGrants] = useState([]);
  const [tab, setTab] = useState('grants'); // 'grants' | 'roles'
  const [showGrantForm, setShowGrantForm] = useState(false);
  const [roleMode, setRoleMode] = useState('existing');
  const [form, setForm] = useState({
    pg_role: '', role_password: '',
    grant_type: 'all_tables', selected_tables: [],
    include_update: false, expires_at: '',
  });
  const [roleSearch, setRoleSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    serversApi.list().then(res => setServer(res.data.find(s => s.id === parseInt(serverId))));
    serversApi.databases(serverId).then(res => setDatabases(res.data)).catch(console.error);
    serversApi.importedRoles(serverId).then(res => setImportedRoles(res.data)).catch(console.error);
  }, [serverId]);

  useEffect(() => {
    if (!selectedDb) return;
    setTables([]);
    setShowGrantForm(false);
    serversApi.tables(serverId, selectedDb).then(res => setTables(res.data)).catch(console.error);
    grantsApi.list({ server_id: serverId, db_name: selectedDb }).then(res => setActiveGrants(res.data)).catch(console.error);
  }, [selectedDb, serverId]);

  const toggleTable = fullName => {
    setForm(f => ({
      ...f,
      selected_tables: f.selected_tables.includes(fullName)
        ? f.selected_tables.filter(t => t !== fullName)
        : [...f.selected_tables, fullName],
    }));
  };

  const handleRoleModeChange = mode => {
    setRoleMode(mode);
    setForm(f => ({ ...f, pg_role: '' }));
    setRoleSearch('');
  };

  const handleGrant = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await grantsApi.create({
        server_id: parseInt(serverId),
        db_name: selectedDb,
        pg_role: form.pg_role,
        create_role: roleMode === 'new',
        role_password: form.role_password || undefined,
        grant_type: form.grant_type,
        tables: form.grant_type === 'selected_tables' ? form.selected_tables : [],
        include_update: form.include_update,
        expires_at: form.expires_at || undefined,
      });
      setActiveGrants(g => [res.data, ...g]);
      if (roleMode === 'new') {
        setImportedRoles(r => [...r, { rolname: form.pg_role, can_login: true, is_superuser: false }]);
      }
      setShowGrantForm(false);
      setForm({ pg_role: '', role_password: '', grant_type: 'all_tables', selected_tables: [], include_update: false, expires_at: '' });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create grant');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async id => {
    if (!confirm('Revoke this grant?')) return;
    await grantsApi.revoke(id);
    setActiveGrants(g => g.filter(gr => gr.id !== id));
  };

  const filteredRoles = importedRoles.filter(r =>
    r.rolname.toLowerCase().includes(roleSearch.toLowerCase())
  );
  const loginRoles = filteredRoles.filter(r => r.can_login);
  const nonLoginRoles = filteredRoles.filter(r => !r.can_login);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>🐘 {server?.name || 'Server'}</h2>
          <p className="page-title-sub">
            {server?.host}:{server?.port} · {importedRoles.length} roles imported
          </p>
        </div>
      </div>

      {/* Database selector */}
      <div className="card" style={{ maxWidth: 380 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Select Database</label>
          <select value={selectedDb} onChange={e => setSelectedDb(e.target.value)}>
            <option value="">— choose a database —</option>
            {databases.map(db => <option key={db.name} value={db.name}>{db.name}</option>)}
          </select>
        </div>
      </div>

      {/* Roles always visible — server-level, not DB-specific */}
      <div className="card">
        <div className="card-header">
          <h3>Roles on this server</h3>
          <span className="badge">{importedRoles.length} total</span>
        </div>
        {importedRoles.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">👤</div>
            No roles imported yet. Use the ↻ Sync button on the server card.
          </div>
        ) : (
          <>
            <div className="roles-search-row">
              <input
                className="roles-search"
                placeholder="Search roles…"
                value={roleSearch}
                onChange={e => setRoleSearch(e.target.value)}
              />
            </div>
            <div className="roles-grid">
              {filteredRoles.map(r => (
                <div key={r.rolname} className="role-chip">
                  <span className={`role-dot ${r.can_login ? 'role-dot-green' : 'role-dot-muted'}`} />
                  <span className="role-name">{r.rolname}</span>
                  {r.is_superuser && <span className="badge badge-amber" style={{ fontSize: 10 }}>super</span>}
                  {r.can_login && <span className="badge badge-green" style={{ fontSize: 10 }}>login</span>}
                </div>
              ))}
              {filteredRoles.length === 0 && <p className="text-muted" style={{ fontSize: 13 }}>No roles match "{roleSearch}"</p>}
            </div>
          </>
        )}
      </div>

      {/* DB-level permissions — only shown after selecting a DB */}
      {selectedDb && (
        <>
          <div className="page-header" style={{ marginTop: 8 }}>
            <div>
              <h3>Permissions — <code>{selectedDb}</code></h3>
              <p className="page-title-sub">{activeGrants.length} grant{activeGrants.length !== 1 ? 's' : ''} managed by this dashboard</p>
            </div>
            <button className="btn btn-primary" onClick={() => setShowGrantForm(v => !v)}>
              {showGrantForm ? '✕ Cancel' : '+ Grant Access'}
            </button>
          </div>

          {showGrantForm && (
            <div className="card form-card">
              <div className="card-header"><h3>New Grant</h3></div>
              <form onSubmit={handleGrant}>

                <div className="section-label">Role</div>
                <div className="role-mode-tabs">
                  <button type="button" className={`role-mode-tab ${roleMode === 'existing' ? 'active' : ''}`} onClick={() => handleRoleModeChange('existing')}>
                    Use existing role
                  </button>
                  <button type="button" className={`role-mode-tab ${roleMode === 'new' ? 'active' : ''}`} onClick={() => handleRoleModeChange('new')}>
                    Create new role
                  </button>
                </div>

                {roleMode === 'existing' ? (
                  importedRoles.length === 0 ? (
                    <p className="hint-text">No roles imported. Use ↻ Sync on the server card first, or switch to "Create new role".</p>
                  ) : (
                    <div className="form-group">
                      <label>Select Role</label>
                      <select value={form.pg_role} onChange={e => setForm(f => ({ ...f, pg_role: e.target.value }))} required>
                        <option value="">— choose a role —</option>
                        {loginRoles.length > 0 && (
                          <optgroup label="Can Login">
                            {loginRoles.map(r => <option key={r.rolname} value={r.rolname}>{r.rolname}</option>)}
                          </optgroup>
                        )}
                        {nonLoginRoles.length > 0 && (
                          <optgroup label="No Login">
                            {nonLoginRoles.map(r => <option key={r.rolname} value={r.rolname}>{r.rolname}</option>)}
                          </optgroup>
                        )}
                      </select>
                    </div>
                  )
                ) : (
                  <div className="form-row">
                    <div className="form-group">
                      <label>Role Name</label>
                      <input value={form.pg_role} onChange={e => setForm(f => ({ ...f, pg_role: e.target.value }))} placeholder="e.g. analytics_readonly" required />
                    </div>
                    <div className="form-group">
                      <label>Password</label>
                      <PasswordField
                        value={form.role_password}
                        onChange={pwd => setForm(f => ({ ...f, role_password: pwd }))}
                      />
                    </div>
                  </div>
                )}

                <div className="section-label" style={{ marginTop: 8 }}>Access Scope</div>
                <div className="form-group">
                  <div className="radio-group">
                    <label>
                      <input type="radio" checked={form.grant_type === 'all_tables'} onChange={() => setForm(f => ({ ...f, grant_type: 'all_tables', selected_tables: [] }))} />
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>All tables</div>
                        <div style={{ fontSize: 12, color: 'var(--text-2)' }}>SELECT on every table in this database</div>
                      </div>
                    </label>
                    <label>
                      <input type="radio" checked={form.grant_type === 'selected_tables'} onChange={() => setForm(f => ({ ...f, grant_type: 'selected_tables' }))} />
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>Selected tables</div>
                        <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Choose specific tables to grant access to</div>
                      </div>
                    </label>
                  </div>
                </div>

                {form.grant_type === 'selected_tables' && (
                  <div className="form-group">
                    <label>Tables ({form.selected_tables.length} selected)</label>
                    <div className="table-checklist">
                      {tables.map(t => {
                        const full = `${t.schema}.${t.name}`;
                        return (
                          <label key={full} className="table-check-item">
                            <input type="checkbox" checked={form.selected_tables.includes(full)} onChange={() => toggleTable(full)} />
                            <code>{full}</code>
                          </label>
                        );
                      })}
                      {!tables.length && <div className="empty-state" style={{ padding: '12px 0' }}>No tables found</div>}
                    </div>
                  </div>
                )}

                <div className="section-label" style={{ marginTop: 8 }}>Write Access</div>
                <div className="update-permission-toggle">
                  <div className="update-toggle-left">
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={form.include_update}
                        onChange={e => setForm(f => ({ ...f, include_update: e.target.checked }))}
                      />
                      <span className="toggle-track" />
                    </label>
                    <div>
                      <div className="toggle-label">Grant UPDATE permission</div>
                      <div className="toggle-sublabel">Allows the role to modify existing rows</div>
                    </div>
                  </div>
                  {form.include_update && (
                    <span className="badge badge-amber">Must be time-bound</span>
                  )}
                </div>

                <div className="section-label" style={{ marginTop: 16 }}>Time-bound Access</div>
                <div className="form-group">
                  <label>
                    Expires At {form.include_update ? <span style={{ color: 'var(--rose)', marginLeft: 4 }}>* required for UPDATE</span> : '(optional)'}
                  </label>
                  <input
                    type="datetime-local"
                    value={form.expires_at}
                    onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
                    required={form.include_update}
                  />
                </div>

                {error && <p className="error-msg">{error}</p>}
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Granting access…' : 'Grant Access →'}
                </button>
              </form>
            </div>
          )}

          <div className="card">
            <div className="card-header">
              <h3>Active Grants</h3>
              <p className="hint-text" style={{ marginBottom: 0, padding: '4px 10px', fontSize: 11 }}>
                Only grants created through this dashboard are tracked here
              </p>
            </div>
            {activeGrants.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🔐</div>
                No grants created yet for <code>{selectedDb}</code> through this dashboard.
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Access</th>
                    <th>Tables</th>
                    <th>Expires</th>
                    <th>Granted by</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {activeGrants.map(g => (
                    <tr key={g.id}>
                      <td><code>{g.pg_role}</code></td>
                      <td style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <span className={g.grant_type === 'all_tables' ? 'badge badge-purple' : 'badge badge-blue'}>{g.grant_type === 'all_tables' ? 'All Tables' : 'Selected'}</span>
                        {g.include_update && <span className="badge badge-amber">UPDATE</span>}
                      </td>
                      <td className="tables-cell text-muted">
                        {g.grant_type === 'selected_tables'
                          ? (Array.isArray(g.tables) ? g.tables : JSON.parse(g.tables || '[]')).join(', ')
                          : '—'}
                      </td>
                      <td>{g.expires_at ? <span className="text-warning">{new Date(g.expires_at).toLocaleString()}</span> : <span className="text-muted">Never</span>}</td>
                      <td><span className="text-muted">{g.created_by}</span></td>
                      <td><button className="btn btn-danger btn-sm" onClick={() => handleRevoke(g.id)}>Revoke</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
