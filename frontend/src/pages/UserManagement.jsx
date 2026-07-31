import { useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import { getUsers, updateUserRole, updateUserMembership } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { theme } from '../theme'

const ROLE_LABELS = { 0: 'User', 1: 'Developer', 2: 'Admin' }
const MEMBERSHIP_LABELS = { 0: 'Free', 1: 'Pro', 2: 'Premium', 3: 'Vip' }

function formatDate(value) {
  if (!value) return '-'
  try {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return String(value)
    return d.toLocaleDateString('tr-TR', { year: 'numeric', month: '2-digit', day: '2-digit' })
  } catch {
    return String(value)
  }
}

export default function UserManagement() {
  const { userId: currentUserId } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState(null)

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    setLoading(true)
    setError('')
    try {
      const res = await getUsers()
      setUsers(res.data || [])
    } catch (e) {
      setError('Kullanıcı listesi yüklenemedi: ' + (e.response?.data || e.message))
    } finally {
      setLoading(false)
    }
  }

  async function handleRoleChange(user, nextRole) {
    const id = user.userID
    const prevRole = user.role
    setUsers(prev => prev.map(u => (u.userID === id ? { ...u, role: nextRole } : u)))
    setSavingId(id)
    try {
      await updateUserRole(id, nextRole)
    } catch (e) {
      setUsers(prev => prev.map(u => (u.userID === id ? { ...u, role: prevRole } : u)))
      setError('Rol güncellenemedi: ' + (e.response?.data || e.message))
    } finally {
      setSavingId(null)
    }
  }

  async function handleMembershipChange(user, nextTier) {
    const id = user.userID
    const prevTier = user.membershipTier
    setUsers(prev => prev.map(u => (u.userID === id ? { ...u, membershipTier: nextTier } : u)))
    setSavingId(id)
    try {
      await updateUserMembership(id, nextTier)
    } catch (e) {
      setUsers(prev => prev.map(u => (u.userID === id ? { ...u, membershipTier: prevTier } : u)))
      setError('Üyelik güncellenemedi: ' + (e.response?.data || e.message))
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <div style={{ color: theme.textFaint, fontSize: '13px', marginBottom: '6px' }}>
          Pusula AI · Kullanıcı Yönetimi
        </div>
        <h2 style={{
          margin: 0,
          letterSpacing: '-0.5px',
          fontSize: '28px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <Users size={24} strokeWidth={1.75} color={theme.primaryStrong} />
          Kullanıcı Yönetimi
        </h2>
        <p style={{ color: theme.textMuted, marginTop: '8px', maxWidth: '720px', lineHeight: 1.55 }}>
          Hesapların rolünü (User / Developer / Admin) ve üyelik katmanını buradan yönetin. Bu ekran sadece Admin rolündeki hesaplara açıktır.
        </p>
      </div>

      {error && (
        <div style={{
          background: theme.surface,
          border: `1px solid ${theme.danger}55`,
          borderRadius: '12px',
          padding: '12px 16px',
          marginBottom: '20px',
          color: '#fecaca'
        }}>
          {error}
        </div>
      )}

      <div style={{
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: '20px',
        padding: '22px',
        boxShadow: '0 18px 40px rgba(0,0,0,0.22)'
      }}>
        {loading ? (
          <div style={{ minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}>
            Kullanıcılar yükleniyor...
          </div>
        ) : users.length === 0 ? (
          <div style={{ minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}>
            Kullanıcı bulunamadı.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${theme.border}`, color: theme.textMuted, textAlign: 'left' }}>
                  <th style={th}>Kullanıcı</th>
                  <th style={th}>E-posta</th>
                  <th style={th}>Kayıt Tarihi</th>
                  <th style={th}>Rol</th>
                  <th style={th}>Üyelik</th>
                </tr>
              </thead>

              <tbody>
                {users.map(u => {
                  const isSelf = u.userID === currentUserId
                  const isSaving = savingId === u.userID

                  return (
                    <tr key={u.userID} style={{ borderBottom: `1px solid ${theme.border}`, color: '#c7c3b8' }}>
                      <td style={td}>
                        <div style={{ fontWeight: 'bold', color: theme.text }}>
                          {u.firstName} {u.lastName}
                        </div>
                        <div style={{ color: theme.textFaint, fontSize: '12px' }}>ID: {u.userID}</div>
                      </td>

                      <td style={td}>{u.email}</td>
                      <td style={td}>{formatDate(u.createdAt)}</td>

                      <td style={td}>
                        <select
                          value={u.role}
                          disabled={isSelf || isSaving}
                          onChange={e => handleRoleChange(u, Number(e.target.value))}
                          title={isSelf ? 'Kendi rolünüzü buradan değiştiremezsiniz.' : undefined}
                          style={selectStyle(isSelf || isSaving)}
                        >
                          {Object.entries(ROLE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </td>

                      <td style={td}>
                        <select
                          value={u.membershipTier}
                          disabled={isSaving}
                          onChange={e => handleMembershipChange(u, Number(e.target.value))}
                          style={selectStyle(isSaving)}
                        >
                          {Object.entries(MEMBERSHIP_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function selectStyle(disabled) {
  return {
    padding: '8px 10px',
    background: theme.surfaceSunken,
    border: `1px solid ${theme.border}`,
    borderRadius: '10px',
    color: disabled ? theme.textFaint : theme.text,
    fontSize: '13px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.65 : 1
  }
}

const th = {
  padding: '10px 12px',
  fontWeight: 'normal',
  whiteSpace: 'nowrap'
}

const td = {
  padding: '12px',
  whiteSpace: 'nowrap'
}
