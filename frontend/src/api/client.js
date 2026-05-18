import axios from 'axios'

// Tüm API çağrıları buradan geçiyor — port değişirse sadece burası güncellenir
const api = axios.create({
  baseURL: 'http://localhost:5221/api',
  timeout: 600000 // 10 dakika — model eğitimi uzun sürebilir
})

// HİSSE
export const getStocks       = ()        => api.get('/stocks')
export const searchStocks    = (q)       => api.get(`/stocks/search?q=${q}`)
export const addStock        = (stock)   => api.post('/stocks', stock)

// TAHMİN
export const getPrediction   = (stockId) => api.get(`/prediction/${stockId}`)

// PORTFÖY
export const getPortfolio    = (userId)  => api.get(`/portfolio/${userId}`)

// İŞLEM
export const addTransaction  = (tx)      => api.post('/transactions', tx)

// VERİTABANI DURUMU
export const getDbStatus     = ()        => api.get('/historicaldata/status')
export const syncStock       = (stockId) => api.post(`/historicaldata/sync/${stockId}`)
export const syncAllStocks   = ()        => api.post('/historicaldata/syncall')