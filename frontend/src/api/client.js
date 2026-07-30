import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5221/api'
const AI_URL = import.meta.env.VITE_AI_URL || 'http://127.0.0.1:8000'

const TOKEN_STORAGE_KEY = 'pusula_ai_auth_v1'

export function loadAuth() {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveAuth(auth) {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(auth))
  } catch {
    // localStorage kullanılamazsa oturum sekme kapanana kadar bellekte kalır.
  }
}

export function clearAuth() {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
  } catch {
    // localStorage kullanılamazsa sessizce devam edilir.
  }
}

const api = axios.create({
  baseURL: API_URL,
  timeout: 600000
})

const aiApi = axios.create({
  baseURL: AI_URL,
  timeout: 600000
})

api.interceptors.request.use(config => {
  const auth = loadAuth()
  if (auth?.token) {
    config.headers.Authorization = `Bearer ${auth.token}`
  }
  return config
})

// yetkisiz/expired token durumunda oturumu temizle ki uygulama tutarsız bir auth state'te kalmasın.
api.interceptors.response.use(
  res => res,
  error => {
    if (error.response?.status === 401) {
      clearAuth()
      window.dispatchEvent(new Event('pusula-auth-expired'))
    }
    return Promise.reject(error)
  }
)

// KİMLİK DOĞRULAMA
export const registerUser = (payload) => api.post('/auth/register', payload)
export const loginUser    = (payload) => api.post('/auth/login', payload)

// HİSSE
export const getStocks       = ()        => api.get('/stocks')
export const searchStocks    = (q)       => api.get(`/stocks/search?q=${encodeURIComponent(q)}`)
export const addStock        = (stock)   => api.post('/stocks', stock)

// TAHMİN
export const getPrediction   = (stockId) => aiApi.get(`/predict/${stockId}`)
export const getBehaviorSignal = (stockId) => aiApi.get(`/behavior-signal/${stockId}`)

// PORTFÖY
export const getPortfolio        = (userId)  => api.get(`/portfolio/${userId}`)
export const getPortfolioHistory = (userId)  => api.get(`/portfolio/${userId}/history`)

// İŞLEM
export const addTransaction  = (tx)      => api.post('/transactions', tx)

// VERİTABANI DURUMU
export const getDbStatus     = ()        => api.get('/historicaldata/status')
export const getLatestPrice  = (stockId) => api.get(`/historicaldata/latest/${stockId}`)
export const syncStock       = (stockId) => api.post(`/historicaldata/sync/${stockId}`)
export const syncAllStocks   = ()        => api.post('/historicaldata/syncall')
export const deleteStockHistoricalData = (stockId) => api.delete(`/historicaldata/stock/${stockId}`)

// ZETA RADAR
export const getZetaStatus           = () => api.get('/zeta/status')
export const getZetaLatestRadar      = () => api.get('/zeta/latest-radar')
export const getZetaBacktestSummary  = () => api.get('/zeta/backtest-summary')
export const getZetaScenarioReport   = () => api.get('/zeta/scenario-report')
export const runZetaRadar            = () => api.post('/zeta/run')
