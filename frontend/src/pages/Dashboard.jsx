import { useState, useCallback, useEffect } from 'react'
import { searchStocks, getPrediction } from '../api/client'
import {
  ResponsiveContainer, ComposedChart, Line, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts'

// Gelişmiş Dinamik Tooltip
function CustomTooltip({ active, payload, label, symbol }) {
  if (!active || !payload?.length) return null
  const isForeign = symbol && !symbol.endsWith('.IS')
  const curr = isForeign ? '$' : '₺'
  
  return (
    <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '10px 14px', fontSize: '13px' }}>
      <p style={{ color: '#888', marginBottom: '6px', fontWeight: 'bold' }}>{label}</p>
      {payload.map((p, i) => p.value != null && (
        <p key={i} style={{ color: p.color, margin: '4px 0' }}>
          {p.name}: {Number(p.value).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {curr}
        </p>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const [searchQ, setSearchQ]         = useState('')
  const [searchResults, setResults]   = useState([])
  const [selectedStock, setSelected]  = useState(null)
  const [prediction, setPrediction]   = useState(null)
  const [loading, setLoading]         = useState(false)
  
  // 📈 Geliştirme 1: Grafik Görünüm Türü Seçimi ('area' = Detaylı Bantlı, 'line' = Sade Çizgi)
  const [chartMode, setChartMode]     = useState('area')

  // 🔔 Geliştirme 2: Ekstra Kütüphane İstemeyen Akıllı Toast State'i
  const [toast, setToast]             = useState({ show: false, message: '', type: 'success' })

  function showNotification(msg, type = 'success') {
    setToast({ show: true, message: msg, type })
  }

  // Toast bildirimini 3.5 saniye sonra otomatik kapatma mekanizması
  useEffect(() => {
    if (toast.show) {
      const timer = setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3500)
      return () => clearTimeout(timer)
    }
  }, [toast.show])

  async function handleSearch(e) {
    const q = e.target.value
    setSearchQ(q)
    if (q.length < 2) { setResults([]); return }
    try {
      const res = await searchStocks(q)
      setResults(res.data)
    } catch {}
  }

  function selectStock(stock) {
    setSelected(stock)
    setSearchQ(stock.symbol)
    setResults([])
    setPrediction(null)
    showNotification(`${stock.symbol} başarıyla seçildi.`, 'success')
  }

  async function runPrediction() {
    if (!selectedStock) { showNotification('Lütfen önce bir hisse seçin!', 'error'); return }
    setLoading(true)
    showNotification(`${selectedStock.symbol} için derin öğrenme modeli koşturuluyor...`, 'success')
    try {
      const res = await getPrediction(selectedStock.stockID)
      setPrediction(res.data)
      showNotification('Analiz ve tahmin başarıyla tamamlandı!', 'success')
    } catch (e) {
      const errMsg = e.response?.data?.detail || e.message
      showNotification('Python Motoru Hatası: ' + errMsg, 'error')
    } finally {
      setLoading(false)
    }
  }

  // 🗓️ Geliştirme 3: Canlı Takvim Günlü X Ekseni Hesaplayıcı
  const chartData = useCallback(() => {
    if (!prediction) return []
    const data   = []
    const past   = prediction.pastData        || []
    const aiPast = prediction.pastPredictions || []
    const future = prediction.predictions     || []
    const lower  = prediction.lowerBound      || []
    const upper  = prediction.upperBound      || []
    const fd     = prediction.forecastDays    || 30

    // Bugünü baz alarak dinamik tarih metni üretir
    const getCalendarDate = (offsetDays) => {
      const d = new Date()
      d.setDate(d.getDate() + offsetDays)
      return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
    }

    // Geçmiş 90 gün simülasyonu
    for (let i = 0; i < 90; i++) {
      data.push({
        label:    getCalendarDate(i - 90),
        gercek:   past[i]   ?? null,
        backtest: i > 0 ? (aiPast[i - 1] ?? null) : null,
      })
    }

    // T+0 Bağlantı Noktası (Boşlukları yok eden kilit alan)
    const sonFiyat = past[past.length - 1] ?? null
    data.push({
      label:   getCalendarDate(0), // Bugün
      gercek:  sonFiyat,
      tahmin:  sonFiyat,
      alt:     sonFiyat,
      ust:     sonFiyat,
    })

    // Gelecek 30 günün AI projeksiyonu
    for (let i = 0; i < fd; i++) {
      data.push({
        label:   getCalendarDate(i + 1),
        tahmin:  future[i] ?? null,
        alt:     lower[i]  ?? null,
        ust:     upper[i]  ?? null,
      })
    }
    return data
  }, [prediction])

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', position: 'relative' }}>
      
      {/* FLOATING TOAST COMPONENT */}
      <div style={{
        position: 'fixed',
        top: '24px',
        right: '24px',
        transform: toast.show ? 'translateX(0)' : 'translateX(400px)',
        opacity: toast.show ? 1 : 0,
        transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        background: toast.type === 'success' ? '#10b981' : '#ef4444',
        color: '#fff',
        padding: '14px 24px',
        borderRadius: '8px',
        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
        zIndex: 9999,
        fontWeight: 'bold',
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      }}>
        <span>{toast.type === 'success' ? '✅' : '❌'}</span>
        <span>{toast.message}</span>
      </div>

      <h2 style={{ marginBottom: '24px', letterSpacing: '-0.5px' }}>📈 Dashboard / Analiz Radarı</h2>

      {/* KONTROL PANELİ */}
      <div style={{ background: '#1a1a1a', borderRadius: '12px', padding: '24px', marginBottom: '24px', border: '1px solid #2a2a2a' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          
          {/* Arama Motoru */}
          <div style={{ position: 'relative', flex: 1, minWidth: '250px' }}>
            <input
              placeholder="Analiz edilecek hisseyi yazın... (örn: THYAO.IS, AAPL)"
              value={searchQ}
              onChange={handleSearch}
              style={inputStyle}
            />
            {searchResults.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#222', border: '1px solid #333', borderRadius: '6px', zIndex: 10, maxHeight: '220px', overflowY: 'auto', boxShadow: '0 10px 20px rgba(0,0,0,0.3)' }}>
                {searchResults.map(s => (
                  <div key={s.stockID} onClick={() => selectStock(s)} style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #2a2a2a', display: 'flex', justifyContent: 'space-between' }} onMouseEnter={e => e.currentTarget.style.background = '#333'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <span style={{ fontWeight: 'bold', color: '#3b82f6' }}>{s.symbol}</span>
                    <span style={{ color: '#aaa', fontSize: '13px' }}>{s.companyName}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tetikleyici Buton */}
          <button onClick={runPrediction} disabled={loading || !selectedStock} style={{ padding: '12px 28px', background: loading ? '#333' : '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '14px', transition: 'background 0.2s' }}>
            {loading ? '⏳ Eğitiliyor...' : '🔍 Motoru Çalıştır'}
          </button>

          {/* Model Sağlık Skorları */}
          {prediction?.confidenceScore > 0 && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ background: '#10b98115', border: '1px solid #10b981', borderRadius: '6px', padding: '11px 16px', color: '#10b981', fontWeight: 'bold', fontSize: '14px' }}>
                🎯 Fiyat Doğruluk: %{prediction.confidenceScore}
              </div>
              {prediction?.directionScore > 0 && (
                <div style={{ background: prediction.directionScore >= 50 ? '#3b82f615' : '#f59e0b15', border: `1px solid ${prediction.directionScore >= 50 ? '#3b82f6' : '#f59e0b'}`, borderRadius: '6px', padding: '11px 16px', color: prediction.directionScore >= 50 ? '#3b82f6' : '#f59e0b', fontWeight: 'bold', fontSize: '14px' }}>
                  🧭 Yön İvmesi: %{prediction.directionScore}
                </div>
              )}
            </div>
          )}
        </div>
        {prediction?.message && <p style={{ color: '#666', marginTop: '12px', fontSize: '13px', fontStyle: 'italic' }}>⚙️ {prediction.message}</p>}
      </div>

      {/* GRAFİK ALANI */}
      {prediction && (
        <div style={{ background: '#1a1a1a', borderRadius: '12px', padding: '24px', border: '1px solid #2a2a2a' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ marginBottom: '4px' }}>{selectedStock?.symbol} — 120 Günlük Canlı Projeksiyon</h3>
              <p style={{ color: '#555', fontSize: '12px' }}>Tarih ekseni güncel iş günlerine göre dinamik olarak ötelenmektedir.</p>
            </div>
            
            {/* GRAFİK MODU SEÇİM BUTONLARI */}
            <div style={{ display: 'flex', background: '#111', padding: '4px', borderRadius: '6px', border: '1px solid #333' }}>
              <button onClick={() => setChartMode('area')} style={modeBtnStyle(chartMode === 'area')}>
                📊 Alan Grafiği (Bantlı)
              </button>
              <button onClick={() => setChartMode('line')} style={modeBtnStyle(chartMode === 'line')}>
                📈 Çizgi Grafiği (Sade)
              </button>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={420}>
            <ComposedChart data={chartData()} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#222" />
              <XAxis dataKey="label" tick={{ fill: '#666', fontSize: 11 }} interval={13} />
              <YAxis tick={{ fill: '#666', fontSize: 11 }} tickFormatter={v => v.toLocaleString('tr-TR')} width={75} />
              <Tooltip content={<CustomTooltip symbol={selectedStock?.symbol} />} />
              <Legend wrapperStyle={{ color: '#aaa', fontSize: '13px', paddingTop: '10px' }} />

              {/* Koşullu Güven Bantları (Sadece Area Modunda Çizilir) */}
              {chartMode === 'area' && (
                <Area dataKey="ust" name="İyimser Senaryo (%90)" fill="#3b82f618" stroke="#3b82f633" strokeWidth={1} dot={false} legendType="none" activeDot={false} />
              )}
              {chartMode === 'area' && (
                <Area dataKey="alt" name="Kötümser Senaryo (%10)" fill="#0f0f0f" stroke="#3b82f633" strokeWidth={1} dot={false} legendType="none" activeDot={false} />
              )}

              {/* Gerçek Veri Serileri */}
              <Line dataKey="gercek" name="Gerçekleşen Fiyat" stroke="#ffffff" strokeWidth={2.5} dot={false} connectNulls={false} />
              <Line dataKey="backtest" name="AI Tarihsel Backtest" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls={false} />
              <Line dataKey="tahmin" name="AI İleri Tahmin (30G)" stroke="#3b82f6" strokeWidth={2.5} strokeDasharray="6 3" dot={false} connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// Stil Nesneleri
const inputStyle = { width: '100%', padding: '12px 16px', background: '#111', border: '1px solid #333', borderRadius: '6px', color: '#fff', fontSize: '14px', outline: 'none', transition: 'border-color 0.2s' }
function modeBtnStyle(isActive) {
  return {
    padding: '6px 14px', background: isActive ? '#3b82f6' : 'transparent',
    color: isActive ? '#fff' : '#888', border: 'none', borderRadius: '4px',
    cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', transition: 'all 0.2s'
  }
}