import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { loadAuth, saveAuth, clearAuth, loginUser, registerUser } from '../api/client'
import { describeAuthError } from '../utils/formatters'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => loadAuth())
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    function handleExpired() {
      setAuth(null)
    }
    window.addEventListener('pusula-auth-expired', handleExpired)
    return () => window.removeEventListener('pusula-auth-expired', handleExpired)
  }, [])

  async function login(email, password) {
    setLoading(true)
    setError('')
    try {
      const res = await loginUser({ email, password })
      saveAuth(res.data)
      setAuth(res.data)
      return true
    } catch (e) {
      setError(describeAuthError(e, 'Giriş başarısız.'))
      return false
    } finally {
      setLoading(false)
    }
  }

  async function register(firstName, lastName, email, password) {
    setLoading(true)
    setError('')
    try {
      const res = await registerUser({ firstName, lastName, email, password })
      saveAuth(res.data)
      setAuth(res.data)
      return true
    } catch (e) {
      setError(describeAuthError(e, 'Kayıt başarısız.'))
      return false
    } finally {
      setLoading(false)
    }
  }

  function logout() {
    clearAuth()
    setAuth(null)
  }

  // Role: 0 = User, 1 = Developer, 2 = Admin (backend Eskiz1.API.Models.UserRole ile eşleşir).
  const isDeveloper = auth?.role === 1 || auth?.role === 2
  const isAdmin = auth?.role === 2

  const value = useMemo(() => ({
    user: auth,
    userId: auth?.userId ?? null,
    isAuthenticated: Boolean(auth?.token),
    isDeveloper,
    isAdmin,
    loading,
    error,
    login,
    register,
    logout
  }), [auth, loading, error, isDeveloper, isAdmin])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth, AuthProvider içinde kullanılmalıdır.')
  }
  return ctx
}
