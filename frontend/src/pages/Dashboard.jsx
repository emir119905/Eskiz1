import { useState, useCallback } from 'react'
import { searchStocks, getPrediction } from '../api/client'
import {
  ResponsiveContainer, ComposedChart, Line, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts'

// Tooltip özelleştirmesi
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '10px 14px', fontSize: '13px' }}>
      <p style={{ color: '#888', marginBottom: '6px' }}>{label}</p>
      {payload.map((p, i) => p.value != null && (
        <p key={i} style={{ color: p.color, margin: '2px 0' }}>
          {p.name}: {Number(p.value).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
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
  const [message, setMessage]         = useState('Bir hisse seçerek analiz başlatın.')

  // Arama
  async function handleSearch(e) {
    const q = e.target.value
    setSearchQ(q)
    if (q.length < 2) { setResults([]); return }
    try {
      const res = await searchStocks(q)
      setResults(res.data)
    } catch {}
  }

  // Hisse seç
  function selectStock(stock) {
    setSelected(stock)
    setSearchQ(stock.symbol)
    setResults([])
    setPrediction(null)
    setMessage(`${stock.symbol} seçildi. "Analiz Et" butonuna bas.`)
  }

  // Tahmin al
  async function runPrediction() {
    if (!selectedStock) { setMessage('❌ Önce bir hisse seç.'); return }
    setLoading(true)
    setMessage(`⏳ ${selectedStock.symbol} için model çalışıyor... (ilk seferde uzun sürebilir)`)
    try {
      const res = await getPrediction(selectedStock.stockID)
      setPrediction(res.data)
      setMessage(`✅ ${res.data.message}`)
    } catch (e) {
      setMessage('❌ ' + (e.response?.data?.detail || e.message))
    } finally {
      setLoading(false)
    }
  }

  // Grafik için veriyi hazırla
  const chartData = useCallback(() => {
    if (!prediction) return []
    const data   = []
    const past   = prediction.pastData        || []
    const aiPast = prediction.pastPredictions || []
    const future = prediction.predictions     || []
    const lower  = prediction.lowerBound      || []
    const upper  = prediction.upperBound      || []
    const fd     = prediction.forecastDays    || 30

    // Geçmiş 90 gün
    for (let i = 0; i < 90; i++) {
      data.push({
        label:    `G-${90 - i}`,
        gercek:   past[i]   ?? null,
        backtest: i > 0 ? (aiPast[i - 1] ?? null) : null,
      })
    }

    // Bağlantı noktası: sadece gercek ve tahmin buluşuyor
    // backtest buraya uzatılmıyor — model son noktayı ne tahmin etti o kalıyor
    const sonFiyat = past[past.length - 1] ?? null
    data.push({
      label:   `T+0`,
      gercek:  sonFiyat,
      tahmin:  sonFiyat,
      alt:     sonFiyat,
      ust:     sonFiyat,
    })

    // Gelecek 30 gün
    for (let i = 0; i < fd; i++) {
      data.push({
        label:   `T+${i + 1}`,
        tahmin:  future[i] ?? null,
        alt:     lower[i]  ?? null,
        ust:     upper[i]  ?? null,
      })
    }
    return data
  }, [prediction])

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '24px' }}>📈 Dashboard</h2>

      {/* ARAMA + ANALİZ */}
      <div style={{ background: '#1a1a1a', borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

          {/* Arama kutusu */}
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <input
              placeholder="Hisse ara... (örn: KONYA, Türk, Banka)"
              value={searchQ}
              onChange={handleSearch}
              style={inputStyle}
            />
            {searchResults.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0,
                background: '#222', border: '1px solid #333', borderRadius: '6px',
                zIndex: 10, maxHeight: '220px', overflowY: 'auto'
              }}>
                {searchResults.map(s => (
                  <div
                    key={s.stockID}
                    onClick={() => selectStock(s)}
                    style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #2a2a2a' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#333'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ fontWeight: 'bold', color: '#3b82f6' }}>{s.symbol}</span>
                    <span style={{ color: '#aaa', marginLeft: '10px', fontSize: '13px' }}>{s.companyName}</span>
                    {s.sector && <span style={{ color: '#555', marginLeft: '8px', fontSize: '12px' }}>• {s.sector}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Analiz butonu */}
          <button
            onClick={runPrediction}
            disabled={loading || !selectedStock}
            style={{
              padding: '10px 24px', background: loading ? '#333' : '#3b82f6',
              color: '#fff', border: 'none', borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '14px'
            }}
          >
            {loading ? '⏳ Çalışıyor...' : '🔍 Analiz Et'}
          </button>

          {/* Güven skoru + Yön skoru */}
          {prediction?.confidenceScore > 0 && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{
                background: '#10b98122', border: '1px solid #10b981',
                borderRadius: '6px', padding: '10px 16px', color: '#10b981', fontWeight: 'bold'
              }}>
                🎯 Fiyat: %{prediction.confidenceScore}
              </div>
              {prediction?.directionScore > 0 && (
                <div style={{
                  background: prediction.directionScore >= 55 ? '#3b82f622' : '#f59e0b22',
                  border: `1px solid ${prediction.directionScore >= 55 ? '#3b82f6' : '#f59e0b'}`,
                  borderRadius: '6px', padding: '10px 16px',
                  color: prediction.directionScore >= 55 ? '#3b82f6' : '#f59e0b',
                  fontWeight: 'bold'
                }}>
                  🧭 Yön: %{prediction.directionScore}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Durum mesajı */}
        <p style={{ color: '#888', marginTop: '10px', fontSize: '13px', fontStyle: 'italic' }}>{message}</p>
      </div>

      {/* GRAFİK */}
      {prediction && (
        <div style={{ background: '#1a1a1a', borderRadius: '10px', padding: '20px' }}>
          <h3 style={{ marginBottom: '4px' }}>
            {selectedStock?.symbol} — {90 + (prediction.forecastDays || 30)} Günlük Radar
          </h3>
          <p style={{ color: '#555', fontSize: '12px', marginBottom: '20px' }}>
            Mavi bant: %10–%90 Monte Carlo güven aralığı
          </p>

          <ResponsiveContainer width="100%" height={400}>
            <ComposedChart data={chartData()} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#222" />
              <XAxis
                dataKey="label"
                tick={{ fill: '#666', fontSize: 11 }}
                interval={14}
              />
              <YAxis
                tick={{ fill: '#666', fontSize: 11 }}
                tickFormatter={v => v.toLocaleString('tr-TR')}
                width={70}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ color: '#aaa', fontSize: '13px' }} />

              {/* Güven bandı — önce çizilmeli ki arkada kalsın */}
              <Area
                dataKey="ust"
                name="İyimser (%90)"
                fill="#3b82f633"
                stroke="#3b82f644"
                strokeWidth={1}
                dot={false}
                legendType="none"
                activeDot={false}
              />
              <Area
                dataKey="alt"
                name="Kötümser (%10)"
                fill="#0f0f0f"
                stroke="#3b82f644"
                strokeWidth={1}
                dot={false}
                legendType="none"
                activeDot={false}
              />

              {/* Gerçekleşen fiyat */}
              <Line
                dataKey="gercek"
                name="Gerçekleşen Fiyat"
                stroke="#ffffff"
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
              />

              {/* Backtest */}
              <Line
                dataKey="backtest"
                name="AI Backtest"
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={false}
                connectNulls={false}
              />

              {/* Gelecek tahmini */}
              <Line
                dataKey="tahmin"
                name="AI Tahmini (30 gün)"
                stroke="#3b82f6"
                strokeWidth={2.5}
                strokeDasharray="6 3"
                dot={false}
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '10px 14px',
  background: '#111', border: '1px solid #333', borderRadius: '6px',
  color: '#fff', fontSize: '14px', outline: 'none'
}