import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { servers as serversApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';

const EMPTY_FORM = { name: '', host: '', port: '5432', db_user: '', db_password: '', ssl_enabled: false };

function SyncButton({ serverId, onSynced }) {
  const [syncing, setSyncing] = useState(false);
  const handleSync = async e => {
    e.stopPropagation();
    setSyncing(true);
    try {
      const res = await serversApi.syncRoles(serverId);
      onSynced(res.data.synced);
    } catch { }
    finally { setSyncing(false); }
  };
  return (
    <button className="btn btn-ghost btn-sm" onClick={handleSync} disabled={syncing} title="Sync roles from server">
      {syncing ? '…' : '↻ Sync'}
    </button>
  );
}

export default function Servers() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [serverList, setServerList] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  // test-connection state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // null | { success, version?, error? }

  // save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    serversApi.list().then(res => setServerList(res.data)).catch(console.error);
  }, []);

  const openModal = () => {
    setForm(EMPTY_FORM);
    setTestResult(null);
    setSaveError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setTestResult(null);
    setSaveError('');
  };

  const CREDENTIAL_FIELDS = ['host', 'port', 'db_user', 'db_password', 'ssl_enabled'];

  const handleFormChange = e => {
    const { name, value, type, checked } = e.target;
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
    if (CREDENTIAL_FIELDS.includes(name)) setTestResult(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await serversApi.testConnection({
        host: form.host,
        port: parseInt(form.port),
        db_user: form.db_user,
        db_password: form.db_password,
        ssl_enabled: form.ssl_enabled,
      });
      setTestResult({ success: true, version: res.data.version });
    } catch (err) {
      setTestResult({ success: false, error: err.response?.data?.error || 'Connection failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaveError('');
    setSaving(true);
    try {
      const res = await serversApi.create({ ...form, port: parseInt(form.port) });
      setServerList(l => [...l, res.data]);
      closeModal();
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Failed to add server');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async id => {
    if (!confirm('Remove this server?')) return;
    await serversApi.remove(id);
    setServerList(l => l.filter(s => s.id !== id));
  };

  const canTest = form.host && form.db_user && form.db_password;
  const canSave = testResult?.success && form.name;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>PostgreSQL Servers</h2>
          <p className="page-title-sub">{serverList.length} server{serverList.length !== 1 ? 's' : ''} registered</p>
        </div>
        {user?.is_admin && (
          <button className="btn btn-primary" onClick={openModal}>+ Add Server</button>
        )}
      </div>

      {/* Server grid */}
      <div className="card-grid">
        {serverList.map(server => (
          <div key={server.id} className="card server-card">
            <div className="server-card-body" onClick={() => navigate(`/servers/${server.id}`)}>
              <div className="server-icon">🐘</div>
              <h3 className="server-card-name">{server.name}</h3>
              <div className="server-meta">{server.host}:{server.port}</div>
              <div className="server-meta">User: {server.db_user}</div>
              <div style={{ marginTop: 14, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span className="badge badge-green">Online</span>
                {server.ssl_enabled && <span className="badge badge-blue">SSL</span>}
                <span className="badge">{server.role_count ?? 0} roles</span>
              </div>
            </div>
            {user?.is_admin && (
              <div className="server-card-actions">
                <SyncButton
                  serverId={server.id}
                  onSynced={count => setServerList(l => l.map(s => s.id === server.id ? { ...s, role_count: count } : s))}
                />
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(server.id)}>Remove</button>
              </div>
            )}
          </div>
        ))}
        {!serverList.length && (
          <div style={{ gridColumn: '1/-1' }}>
            <div className="empty-state">
              <div className="empty-state-icon">🐘</div>
              No servers registered yet. Add one to get started.
            </div>
          </div>
        )}
      </div>

      {/* Add Server Modal */}
      <Modal open={modalOpen} onClose={closeModal} title="Register New Server" width={580}>
        <div className="form-row">
          <div className="form-group">
            <label>Host</label>
            <input name="host" value={form.host} onChange={handleFormChange} placeholder="e.g. 10.0.0.1" autoFocus />
          </div>
          <div className="form-group form-group-sm">
            <label>Port</label>
            <input name="port" type="number" value={form.port} onChange={handleFormChange} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>DB Username</label>
            <input name="db_user" value={form.db_user} onChange={handleFormChange} placeholder="postgres" />
          </div>
          <div className="form-group">
            <label>DB Password</label>
            <input name="db_password" type="password" value={form.db_password} onChange={handleFormChange} placeholder="••••••••" />
          </div>
        </div>
        <div className="form-group checkbox-group" style={{ marginBottom: 20 }}>
          <label>
            <input name="ssl_enabled" type="checkbox" checked={form.ssl_enabled} onChange={handleFormChange} />
            Enable SSL / TLS
          </label>
        </div>

        {/* Test connection */}
        <div className="test-connection-bar">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleTest}
            disabled={!canTest || testing}
          >
            {testing ? '⏳ Testing…' : '⚡ Test Connection'}
          </button>

          {testResult && (
            <div className={`test-result ${testResult.success ? 'test-result-ok' : 'test-result-fail'}`}>
              {testResult.success ? (
                <><span className="test-result-icon">✓</span> Connected · <span className="test-result-version">{testResult.version}</span></>
              ) : (
                <><span className="test-result-icon">✕</span> {testResult.error}</>
              )}
            </div>
          )}
        </div>

        <div className="modal-divider" />

        {/* Display name — only filled after test passes */}
        <div className="form-group">
          <label>Display Name</label>
          <input
            name="name"
            value={form.name}
            onChange={handleFormChange}
            placeholder={testResult?.success ? 'e.g. Production GCP' : 'Test connection first…'}
            disabled={!testResult?.success}
          />
        </div>

        {saveError && <p className="error-msg">{saveError}</p>}

        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={closeModal}>Cancel</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!canSave || saving}
          >
            {saving ? 'Saving…' : 'Add Server'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
