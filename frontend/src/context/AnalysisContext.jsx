import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { getPrediction } from '../api/client'

const AnalysisContext = createContext(null)

const STORAGE_KEY = 'pusula_ai_analysis_state_v1'

function loadSavedState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function AnalysisProvider({ children }) {
  const saved = loadSavedState()

  const [selectedStock, setSelectedStock] = useState(saved?.selectedStock || null)
  const [prediction, setPrediction] = useState(saved?.prediction || null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState(saved?.lastUpdatedAt || null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' })

  useEffect(() => {
    const payload = {
      selectedStock,
      prediction,
      lastUpdatedAt
    }

    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // sessionStorage kullanılamazsa uygulama çalışmaya devam eder.
    }
  }, [selectedStock, prediction, lastUpdatedAt])

  useEffect(() => {
    if (!toast.show) return
    const timer = setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }))
    }, 3500)

    return () => clearTimeout(timer)
  }, [toast.show])

  function showNotification(message, type = 'success') {
    setToast({ show: true, message, type })
  }

  function selectStock(stock) {
    setSelectedStock(stock)
    setPrediction(null)
    setError('')
    showNotification(`${stock.symbol} seçildi.`, 'success')
  }

  async function runPrediction(stockOverride = null) {
    const stock = stockOverride || selectedStock

    if (!stock) {
      showNotification('Lütfen önce bir varlık seçin.', 'error')
      return null
    }

    setLoading(true)
    setError('')
    showNotification(`${stock.symbol} için çok ufuklu analiz hazırlanıyor...`, 'success')

    try {
      const res = await getPrediction(stock.stockID)
      setPrediction(res.data)
      setLastUpdatedAt(new Date().toISOString())
      showNotification('Analiz tamamlandı.', 'success')
      return res.data
    } catch (e) {
      const errMsg = e.response?.data?.detail || e.message || 'Bilinmeyen hata'
      setError(errMsg)
      showNotification('Analiz servisi hatası: ' + errMsg, 'error')
      return null
    } finally {
      setLoading(false)
    }
  }

  function clearAnalysis() {
    setSelectedStock(null)
    setPrediction(null)
    setLastUpdatedAt(null)
    setError('')
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {}
  }

  const value = useMemo(() => ({
    selectedStock,
    prediction,
    loading,
    error,
    toast,
    lastUpdatedAt,
    selectStock,
    runPrediction,
    clearAnalysis,
    showNotification
  }), [selectedStock, prediction, loading, error, toast, lastUpdatedAt])

  return (
    <AnalysisContext.Provider value={value}>
      {children}
    </AnalysisContext.Provider>
  )
}

export function useAnalysis() {
  const ctx = useContext(AnalysisContext)
  if (!ctx) {
    throw new Error('useAnalysis, AnalysisProvider içinde kullanılmalıdır.')
  }
  return ctx
}