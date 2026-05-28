import axios from 'axios'

// .NET API: hisse arama, portföy, admin vb. mevcut sistem burada kalıyor.
const api = axios.create({
  baseURL: 'http://localhost:5221/api',
  timeout: 600000
})

// Python AI API: v11.3 metrikleri ve chartData kontratı burada.
// .NET prediction endpoint'i yeni alanları filtreliyorsa Dashboard kartları boş kalır.
const aiApi = axios.create({
  baseURL: 'http://127.0.0.1:8000',
  timeout: 600000
})

// HİSSE
export const getStocks       = ()        => api.get('/stocks')
export const searchStocks    = (q)       => api.get(`/stocks/search?q=${encodeURIComponent(q)}`)
export const addStock        = (stock)   => api.post('/stocks', stock)

// TAHMİN
// v11.3 için direkt Python motorundan çekiyoruz ki chartData/practicalHorizonMetrics kaybolmasın.
export const getPrediction   = (stockId) => aiApi.get(`/predict/${stockId}`)
export const getBehaviorSignal = (stockId) => aiApi.get(`/behavior-signal/${stockId}`)

// PORTFÖY
export const getPortfolio    = (userId)  => api.get(`/portfolio/${userId}`)

// İŞLEM
export const addTransaction  = (tx)      => api.post('/transactions', tx)

// VERİTABANI DURUMU
export const getDbStatus     = ()        => api.get('/historicaldata/status')
export const syncStock       = (stockId) => api.post(`/historicaldata/sync/${stockId}`)
export const syncAllStocks   = ()        => api.post('/historicaldata/syncall') 
export const deleteStockHistoricalData = (stockId) => api.delete(`/historicaldata/stock/${stockId}`)

// ZETA RADAR
export const getZetaStatus           = () => api.get('/zeta/status')
export const getZetaLatestRadar      = () => api.get('/zeta/latest-radar')
export const getZetaBacktestSummary  = () => api.get('/zeta/backtest-summary')
export const getZetaScenarioReport   = () => api.get('/zeta/scenario-report')