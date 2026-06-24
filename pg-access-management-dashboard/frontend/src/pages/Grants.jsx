import { useState, useEffect, useRef } from 'react';
import { grants as grantsApi, servers as serversApi } from '../api/client';

export default function Grants() {
  const [grantList, setGrantList] = useState([]);
  const [serverList, setServerList] = useState([]);
  const [allRoles, setAllRoles] = useState([]);
  const [filterServer, setFilterServer] = useState('');
  const [filterDb, setFilterDb] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const roleInputRef = useRef(null);

  useEffect(() => {
    serversApi.list().then(res => {
      setServerList(res.data);
      // Load all roles from all servers for autocomplete
      Promise.all(res.data.map(s => serversApi.importedRoles(s.id))).then(results => {
        const names = [...new Set(results.flatMap(r => r.data.map(role => role.rolname)))].sort();
        setAllRoles(names);
      });
    }).catch(console.error);
  }, []);

  useEffect(() => {
    const params = {};
    if (filterServer) params.server_id = filterServer;
    if (filterDb)     params.db_name = filterDb;
    if (filterRole)   params.pg_role = filterRole;
    grantsApi.list(params).then(res => setGrantList(res.data)).catch(console.error);
  }, [filterServer, filterDb, filterRole]);

  const handleRevoke = async id => {
    if (!confirm('Revoke this grant?')) return;
    await grantsApi.revoke(id);
    setGrantList(g => g.filter(gr => gr.id !== id));
  };

  const isExpiringSoon = expiresAt => {
    if (!expiresAt) return false;
    return new Date(expiresAt) - new Date() < 24 * 60 * 60 * 1000;
  };

  const suggestions = filterRole.length > 0
    ? allRoles.filter(r => r.toLowerCase().includes(filterRole.toLowerCase()) && r !== filterRole)
    : [];

  const clearFilters = () => {
    setFilterServer('');
    setFilterDb('');
    setFilterRole('');
  };

  const hasFilters = filterServer || filterDb || filterRole;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>All Active Grants</h2>
          <p className="page-title-sub">{grantList.length} grant{grantList.length !== 1 ? 's' : ''} found</p>
        </div>
        {hasFilters && (
          <button className="btn btn-ghost btn-sm" onClick={clearFilters}>✕ Clear filters</button>
        )}
      </div>

      {/* Filters */}
      <div className="filter-row">
        {/* Role filter with autocomplete */}
        <div className="form-group" style={{ position: 'relative', minWidth: 240 }}>
          <label>User / Role</label>
          <input
            ref={roleInputRef}
            value={filterRole}
            onChange={e => { setFilterRole(e.target.value); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Search by role name…"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="suggestions-dropdown">
              {suggestions.slice(0, 8).map(r => (
                <div
                  key={r}
                  className="suggestion-item"
                  onMouseDown={() => { setFilterRole(r); setShowSuggestions(false); }}
                >
                  <span className="role-dot role-dot-green" style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', marginRight: 6 }} />
                  {r}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="form-group" style={{ minWidth: 180 }}>
          <label>Server</label>
          <select value={filterServer} onChange={e => { setFilterServer(e.target.value); setFilterDb(''); }}>
            <option value="">All servers</option>
            {serverList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div className="form-group" style={{ minWidth: 180 }}>
          <label>Database</label>
          <input value={filterDb} onChange={e => setFilterDb(e.target.value)} placeholder="Filter by database…" />
        </div>
      </div>

      {/* Active role filter pill */}
      {filterRole && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span className="text-muted" style={{ fontSize: 12 }}>Showing permissions for:</span>
          <span className="badge badge-purple" style={{ fontSize: 12, padding: '4px 12px' }}>
            <code style={{ background: 'none', color: 'inherit', padding: 0 }}>{filterRole}</code>
          </span>
        </div>
      )}

      <div className="card">
        {grantList.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔑</div>
            {hasFilters ? `No grants found for the selected filters.` : 'No active grants found.'}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Server</th>
                <th>Database</th>
                <th>Access</th>
                <th>Tables</th>
                <th>Expires</th>
                <th>Granted by</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {grantList.map(g => (
                <tr key={g.id} className={isExpiringSoon(g.expires_at) ? 'row-warning' : ''}>
                  <td><code>{g.pg_role}</code></td>
                  <td><strong>{g.server_name}</strong></td>
                  <td><code>{g.db_name}</code></td>
                  <td style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <span className={g.grant_type === 'all_tables' ? 'badge badge-purple' : 'badge badge-blue'}>
                      {g.grant_type === 'all_tables' ? 'All Tables' : 'Selected'}
                    </span>
                    {g.include_update && <span className="badge badge-amber">UPDATE</span>}
                  </td>
                  <td className="tables-cell text-muted">
                    {g.grant_type === 'selected_tables'
                      ? (Array.isArray(g.tables) ? g.tables : JSON.parse(g.tables || '[]')).join(', ')
                      : '—'}
                  </td>
                  <td>
                    {g.expires_at
                      ? <span className={isExpiringSoon(g.expires_at) ? 'text-warning' : 'text-muted'}>{new Date(g.expires_at).toLocaleString()}</span>
                      : <span className="text-muted">Never</span>}
                  </td>
                  <td><span className="text-muted">{g.created_by}</span></td>
                  <td><button className="btn btn-danger btn-sm" onClick={() => handleRevoke(g.id)}>Revoke</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
