import { useState } from 'react'
import { Compass, Check, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { theme } from '../theme'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const PASSWORD_RULES = [
  { label: 'En az 8 karakter', test: v => v.length >= 8 },
  { label: 'En az 1 büyük harf', test: v => /[A-Z]/.test(v) },
  { label: 'En az 1 küçük harf', test: v => /[a-z]/.test(v) },
  { label: 'En az 1 rakam', test: v => /[0-9]/.test(v) }
]

export default function Login() {
  const { login, register, loading, error } = useAuth()
  const [mode, setMode] = useState('login')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState('')

  const emailValid = email.length === 0 || EMAIL_PATTERN.test(email)
  const passwordFailures = mode === 'register'
    ? PASSWORD_RULES.filter(rule => !rule.test(password))
    : []

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')

    if (!EMAIL_PATTERN.test(email)) {
      setFormError('Geçerli bir e-posta adresi girin (örn: ad@ornek.com).')
      return
    }

    if (mode === 'register' && passwordFailures.length > 0) {
      setFormError('Şifre gerekli kuralları karşılamıyor.')
      return
    }

    if (mode === 'login') {
      await login(email, password)
    } else {
      await register(firstName, lastName, email, password)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: theme.bg,
      color: theme.text,
      padding: '20px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '380px',
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: '16px',
        padding: '32px',
        boxShadow: '0 18px 40px rgba(0,0,0,0.35)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <div style={{
            width: 38,
            height: 38,
            borderRadius: '11px',
            background: theme.primary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Compass size={19} color="#141312" strokeWidth={2} />
          </div>
          <div>
            <div style={{ fontSize: '17px', fontWeight: 600, color: theme.text }}>Pusula AI</div>
            <div style={{ color: theme.textFaint, fontSize: '12px' }}>Finansal karar destek paneli</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          <TabButton active={mode === 'login'} onClick={() => { setMode('login'); setFormError('') }}>Giriş Yap</TabButton>
          <TabButton active={mode === 'register'} onClick={() => { setMode('register'); setFormError('') }}>Kayıt Ol</TabButton>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {mode === 'register' && (
            <>
              <Field label="Ad">
                <input
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  style={inputStyle}
                  required
                />
              </Field>
              <Field label="Soyad">
                <input
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  style={inputStyle}
                  required
                />
              </Field>
            </>
          )}

          <Field label="E-posta">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{
                ...inputStyle,
                border: `1px solid ${!emailValid ? theme.danger : theme.border}`
              }}
              required
            />
            {!emailValid && (
              <span style={{ color: theme.danger, fontSize: '11px' }}>
                Geçerli bir e-posta adresi girin (örn: ad@ornek.com).
              </span>
            )}
          </Field>

          <Field label="Şifre">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={inputStyle}
              required
            />
            {mode === 'register' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '4px' }}>
                {PASSWORD_RULES.map(rule => {
                  const ok = rule.test(password)
                  return (
                    <span
                      key={rule.label}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '11px',
                        color: ok ? theme.success : theme.textFaint
                      }}
                    >
                      {ok ? <Check size={11} strokeWidth={2.5} /> : <X size={11} strokeWidth={2} />}
                      {rule.label}
                    </span>
                  )
                })}
              </div>
            )}
          </Field>

          {(formError || error) && (
            <div style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.35)',
              borderRadius: '10px',
              padding: '10px 12px',
              color: '#fca5a5',
              fontSize: '13px'
            }}>
              {formError || (typeof error === 'string' ? error : 'Bir hata oluştu, lütfen tekrar deneyin.')}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '8px',
              padding: '12px 16px',
              background: theme.primary,
              color: '#141312',
              border: 'none',
              borderRadius: '10px',
              cursor: loading ? 'default' : 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              opacity: loading ? 0.65 : 1
            }}
          >
            {loading ? 'Lütfen bekleyin...' : mode === 'login' ? 'Giriş Yap' : 'Hesap Oluştur'}
          </button>
        </form>

        {mode === 'register' && (
          <p style={{ color: theme.textFaint, fontSize: '12px', marginTop: '16px', lineHeight: 1.5 }}>
            Yeni hesaplara sanal portföy simülasyonu için başlangıç bakiyesi tanımlanır.
          </p>
        )}
      </div>
    </div>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: '9px 12px',
        borderRadius: '10px',
        border: active ? `1px solid ${theme.primary}` : `1px solid ${theme.border}`,
        background: active ? theme.primaryMuted : 'transparent',
        color: active ? theme.primaryStrong : theme.textMuted,
        fontSize: '13px',
        fontWeight: active ? 600 : 400,
        cursor: 'pointer'
      }}
    >
      {children}
    </button>
  )
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: theme.textMuted }}>
      {label}
      {children}
    </label>
  )
}

const inputStyle = {
  width: '100%',
  padding: '11px 12px',
  background: theme.surfaceSunken,
  border: `1px solid ${theme.border}`,
  borderRadius: '10px',
  color: theme.text,
  fontSize: '14px',
  outline: 'none'
}
