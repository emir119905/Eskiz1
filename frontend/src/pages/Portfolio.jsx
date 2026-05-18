import { useState, useEffect } from 'react'
import { getPortfolio, addTransaction, searchStocks } from '../api/client'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const USER_ID = 1  // Şimdilik sabit

// Yabancı/Yerli Hisse Kur Ayarlayıcı
function formatMoney(val, symbol) {
  if (val == null) return '-'
  const isForeign = symbol && !symbol.endsWith('.IS')
  const curr = isForeign ? '$' : '₺'
  return `${val.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${curr}`
}

function KarZararBadge({ deger, yuzde, symbol }) {
  const pozitif = deger >= 0
  const renk    = pozitif ? '#10b981' : '#ef4444'
  const isForeign = symbol && !symbol.endsWith('.IS')
  const curr = isForeign ? '$' : '₺'
  
  return (
    <span style={{ color: renk, fontWeight: 'bold' }}>
      {pozitif ? '+' : ''}{deger.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {curr}
      {' '}({pozitif ? '+' : ''}{yuzde}%)
    </span>
  )
}

// Donut Grafik Renk Paleti
const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4']

export default function Portfolio() {
  const [portfolio, setPortfolio]   = useState(null)
  const [loading, setLoading]       = useState(true)
  const [message, setMessage]       = useState('')

  // İşlem formu
  const [searchQ, setSearchQ]       = useState('')
  const [searchResults, setResults] = useState([])
  const [selectedStock, setSelected]= useState(null)
  const [qty, setQty]               = useState(10)
  const [txLoading, setTxLoading]   = useState(false)

  useEffect(() => { fetchPortfolio() }, [])

  async function fetchPortfolio() {
    try {
      setLoading(true)
      const res = await getPortfolio(USER_ID)
      setPortfolio(res.data)
    } catch (e) {
      setMessage('❌ Portföy yüklenemedi: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSearch(e) {
    const q = e.target.value
    setSearchQ(q)
    if (q.length < 2) { setResults([]); return }
    try {
      const res = await searchStocks(q)
      setResults(res.data)
    } catch {}
  }

  async function executeTrade(type) {
    if (!selectedStock) { setMessage('❌ Önce bir hisse seç.'); return }
    setTxLoading(true)
    try {
      const res = await addTransaction({
        UserID: USER_ID,
        StockID: selectedStock.stockID,
        TransactionType: type, // 0=BUY, 1=SELL
        Quantity: qty
      })
      setMessage(`✅ ${res.data.mesaj} | Yeni Bakiye: ${res.data.yeniBakiye?.toLocaleString('tr-TR')} ₺`)
      fetchPortfolio()
    } catch (e) {
      setMessage('❌ ' + (e.response?.data || e.message))
    } finally {
      setTxLoading(false)
    }
  }

  // Grafik Verisi
  const pieData = portfolio?.sahipOlunanHisseler?.map(h => ({
    name: h.symbol,
    value: h.anlikDeger
  })) || []

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '24px' }}>💼 Portföyüm</h2>

      {message && (
        <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', color: '#aaa' }}>
          {message}
        </div>
      )}

      {/* Özet Kartlar (En Üstte) */}
      {portfolio && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <SummaryCard label="Nakit Bakiye"    value={portfolio.nakitBakiye}         color="#10b981" />
          <SummaryCard label="Portföy Değeri"  value={portfolio.toplamPortfoyDegeri} color="#3b82f6" />
          <SummaryCard label="Toplam Varlık"   value={portfolio.toplamVarlik}        color="#8b5cf6" />
          <SummaryCard
            label="Toplam K/Z"
            value={portfolio.toplamKarZarar}
            color={portfolio.toplamKarZarar >= 0 ? '#10b981' : '#ef4444'}
            prefix={portfolio.toplamKarZarar >= 0 ? '+' : ''}
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        
        {/* SOL: Hisse Tablosu */}
        <div style={{ flex: 2, minWidth: '350px', background: '#1a1a1a', borderRadius: '10px', padding: '20px' }}>
          <h3 style={{ marginBottom: '16px' }}>Pozisyonlar</h3>
          {loading ? (
            <p style={{ color: '#666' }}>Yükleniyor...</p>
          ) : portfolio?.sahipOlunanHisseler?.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #333', color: '#888', textAlign: 'left' }}>
                    <th style={th}>Hisse</th>
                    <th style={th}>Lot</th>
                    <th style={th}>Ort. Maliyet</th>
                    <th style={th}>Son Fiyat</th>
                    <th style={th}>Değer</th>
                    <th style={th}>K/Z</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.sahipOlunanHisseler.map(h => (
                    <tr key={h.stockID} style={{ borderBottom: '1px solid #222' }}>
                      <td style={td}>
                        <div style={{ fontWeight: 'bold' }}>{h.symbol}</div>
                        <div style={{ color: '#888', fontSize: '12px' }}>{h.companyName}</div>
                      </td>
                      <td style={td}>{h.lot}</td>
                      <td style={td}>{formatMoney(h.ortMaliyet, h.symbol)}</td>
                      <td style={td}>{formatMoney(h.sonFiyat, h.symbol)}</td>
                      <td style={td}>{formatMoney(h.anlikDeger, h.symbol)}</td>
                      <td style={td}><KarZararBadge deger={h.karZarar} yuzde={h.karZararYuzde} symbol={h.symbol} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: '#666' }}>Henüz hisse yok.</p>
          )}
        </div>

        {/* ORTA: Dağılım Grafiği */}
        {pieData.length > 0 && (
          <div style={{ flex: 1, minWidth: '250px', background: '#1a1a1a', borderRadius: '10px', padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <h3 style={{ marginBottom: '16px', alignSelf: 'flex-start' }}>Dağılım</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%" cy="50%"
                  innerRadius={60} outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value, name) => [`${value.toLocaleString('tr-TR')} ₺`, name]}
                  contentStyle={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', color: '#fff' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* SAĞ: Hızlı İşlem */}
        <div style={{ flex: 1, minWidth: '260px', background: '#1a1a1a', borderRadius: '10px', padding: '20px' }}>
          <h3 style={{ marginBottom: '16px' }}>⚖️ Hızlı İşlem</h3>
          <div style={{ position: 'relative', marginBottom: '12px' }}>
            <input
              placeholder="Hisse ara... (örn: AAPL)"
              value={searchQ}
              onChange={handleSearch}
              style={inputStyle}
            />
            {searchResults.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0,
                background: '#222', border: '1px solid #333', borderRadius: '6px',
                zIndex: 10, maxHeight: '200px', overflowY: 'auto'
              }}>
                {searchResults.map(s => (
                  <div
                    key={s.stockID}
                    onClick={() => { setSelected(s); setSearchQ(s.symbol); setResults([]) }}
                    style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #333' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#333'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ fontWeight: 'bold' }}>{s.symbol}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedStock && (
            <div style={{ background: '#111', borderRadius: '6px', padding: '10px 12px', marginBottom: '12px', fontSize: '13px' }}>
              <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>{selectedStock.symbol}</span>
            </div>
          )}

          <input
            type="number" min="1" value={qty}
            onChange={e => setQty(parseInt(e.target.value))}
            style={{ ...inputStyle, marginBottom: '12px' }}
            placeholder="Adet"
          />

          <button onClick={() => executeTrade(0)} disabled={txLoading} style={{ ...btnStyle('#10b981'), width: '100%', marginBottom: '8px' }}>
            🟢 AL (BUY)
          </button>
          <button onClick={() => executeTrade(1)} disabled={txLoading} style={{ ...btnStyle('#ef4444'), width: '100%' }}>
            🔴 SAT (SELL)
          </button>
        </div>

      </div>
    </div>
  )
}

function SummaryCard({ label, value, color, prefix = '' }) {
  return (
    <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '14px 18px', flex: 1, minWidth: '130px' }}>
      <div style={{ color: '#888', fontSize: '12px', marginBottom: '4px' }}>{label}</div>
      <div style={{ color, fontWeight: 'bold', fontSize: '18px' }}>
        {prefix}{value?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
      </div>
    </div>
  )
}

const th = { padding: '8px 12px', fontWeight: 'normal' }
const td = { padding: '10px 12px' }
const inputStyle = { width: '100%', padding: '10px 12px', background: '#111', border: '1px solid #333', borderRadius: '6px', color: '#fff', fontSize: '14px', outline: 'none' }
function btnStyle(bg) { return { padding: '10px 16px', background: bg, color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' } }