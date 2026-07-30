import { useState, useEffect } from 'react'
import { Briefcase } from 'lucide-react'
import { getPortfolio, getPortfolioHistory, addTransaction, searchStocks, getLatestPrice } from '../api/client'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, ReferenceDot, Legend
} from 'recharts'
import { useAuth } from '../context/AuthContext'
import { theme } from '../theme'
import {
  getCurrencySymbol,
  money
} from '../utils/formatters'

// pasta grafikteki dilimler kategoriktir (hangi hisse hangi renk sırayla),
// kâr/zarar veya marka gibi bir anlam taşımaz; bu yüzden ayrı bir kategorik palet olarak kalır.
const PIE_COLORS = [
  '#2dd4bf',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4'
]

function formatMoney(value, asset) {
  return money(value, asset)
}

function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return '-'
  return `${Number(value).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}%`
}

function KarZararBadge({ deger, yuzde, symbol }) {
  const safeValue = Number(deger || 0)
  const pozitif = safeValue >= 0
  const renk = pozitif ? theme.success : theme.danger
  const curr = getCurrencySymbol(symbol)

  return (
    <span style={{ color: renk, fontWeight: 'bold' }}>
      {pozitif ? '+' : ''}
      {safeValue.toLocaleString('tr-TR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })} {curr}
      {' '}({pozitif ? '+' : ''}{formatPercent(yuzde)})
    </span>
  )
}

export default function Portfolio() {
  const { userId } = useAuth()

  const [portfolio, setPortfolio] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const [history, setHistory] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(true)

  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setResults] = useState([])
  const [selectedStock, setSelected] = useState(null)
  const [qty, setQty] = useState(10)
  const [txLoading, setTxLoading] = useState(false)

  const [selectedPrice, setSelectedPrice] = useState(null)
  const [priceLoading, setPriceLoading] = useState(false)
  const [priceError, setPriceError] = useState('')

  useEffect(() => {
    if (!selectedStock) {
      setSelectedPrice(null)
      setPriceError('')
      return
    }

    let cancelled = false
    setPriceLoading(true)
    setPriceError('')
    setSelectedPrice(null)

    getLatestPrice(selectedStock.stockID)
      .then(res => {
        if (!cancelled) setSelectedPrice(res.data)
      })
      .catch(e => {
        if (!cancelled) setPriceError(e.response?.data || 'Fiyat verisi alınamadı.')
      })
      .finally(() => {
        if (!cancelled) setPriceLoading(false)
      })

    return () => { cancelled = true }
  }, [selectedStock])

  useEffect(() => {
    if (userId) {
      fetchPortfolio()
      fetchHistory()
    }
  }, [userId])

  async function fetchPortfolio() {
    try {
      setLoading(true)
      const res = await getPortfolio(userId)
      setPortfolio(res.data)
    } catch (e) {
      setMessage('❌ Portföy yüklenemedi: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  async function fetchHistory() {
    try {
      setHistoryLoading(true)
      const res = await getPortfolioHistory(userId)
      setHistory(res.data)
    } catch {
      setHistory(null)
    } finally {
      setHistoryLoading(false)
    }
  }

  async function handleSearch(e) {
    const q = e.target.value
    setSearchQ(q)

    if (q.length < 2) {
      setResults([])
      return
    }

    try {
      const res = await searchStocks(q)
      setResults(res.data)
    } catch {
      setResults([])
    }
  }

  async function executeTrade(type) {
    if (!selectedStock) {
      setMessage('❌ Önce bir hisse seçin.')
      return
    }

    const safeQty = Number(qty)

    if (!safeQty || safeQty <= 0) {
      setMessage('❌ Geçerli bir adet girin.')
      return
    }

    setTxLoading(true)

    try {
      const res = await addTransaction({
        UserID: userId,
        StockID: selectedStock.stockID,
        TransactionType: type,
        Quantity: safeQty
      })

      setMessage(
        `✅ ${res.data.mesaj} | Yeni Bakiye: ${formatMoney(res.data.yeniBakiye, { currency: 'TRY' })}`
      )

      fetchPortfolio()
      fetchHistory()
    } catch (e) {
      setMessage('❌ ' + (e.response?.data || e.message))
    } finally {
      setTxLoading(false)
    }
  }

  const pieData = portfolio?.sahipOlunanHisseler?.map(h => ({
    name: h.symbol,
    value: h.anlikDeger
  })) || []

  function formatDayLabel(tarih) {
    return new Date(tarih).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  }

  const chartData = (history?.gunler || []).map(g => ({
    tarih: g.tarih,
    label: formatDayLabel(g.tarih),
    getiri: g.getiriYuzde,
    bist: g.bist100GetiriYuzde
  }))

  const markers = (history?.islemler || [])
    .map(t => {
      const txDay = String(t.tarih).slice(0, 10)
      const point = chartData.find(d => String(d.tarih).slice(0, 10) === txDay)
        || chartData.find(d => String(d.tarih).slice(0, 10) >= txDay)
      if (!point) return null
      return { ...t, label: point.label, getiri: point.getiri }
    })
    .filter(Boolean)

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <div style={{ color: '#66625a', fontSize: '13px', marginBottom: '6px' }}>
          Pusula AI · Portföy Simülasyonu
        </div>
        <h2 style={{
          margin: 0,
          letterSpacing: '-0.5px',
          fontSize: '28px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <Briefcase size={24} strokeWidth={1.75} color="#f59e0b" />
          Portföy Simülasyonu
        </h2>
        <p style={{ color: '#9a968c', marginTop: '8px', maxWidth: '720px', lineHeight: 1.55 }}>
          Sanal portföyünüzü takip edin, pozisyon dağılımını inceleyin ve hızlı alım/satım işlemleriyle senaryoları test edin.
        </p>
      </div>

      {message && (
        <div style={{
          background: '#141312',
          border: '1px solid #2a2825',
          borderRadius: '12px',
          padding: '12px 16px',
          marginBottom: '20px',
          color: '#c7c3b8'
        }}>
          {message}
        </div>
      )}

      {portfolio && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(160px, 1fr))',
          gap: '14px',
          marginBottom: '22px'
        }}>
          <SummaryCard
            label="Nakit Bakiye"
            value={portfolio.nakitBakiye}
            color={theme.success}
          />
          <SummaryCard
            label="Portföy Değeri"
            value={portfolio.toplamPortfoyDegeri}
            color={theme.info}
          />
          <SummaryCard
            label="Toplam Varlık"
            value={portfolio.toplamVarlik}
            color={theme.secondary}
          />
          <SummaryCard
            label="Toplam K/Z"
            value={portfolio.toplamKarZarar}
            color={portfolio.toplamKarZarar >= 0 ? theme.success : theme.danger}
            prefix={portfolio.toplamKarZarar >= 0 ? '+' : ''}
          />
        </div>
      )}

      {!historyLoading && chartData.length > 1 && (
        <Panel style={{ marginBottom: '20px' }}>
          <h3 style={{ marginTop: 0, marginBottom: '4px' }}>Performans</h3>
          <p style={{ color: '#66625a', fontSize: '12px', marginTop: 0, marginBottom: '16px' }}>
            İlk işleminizden bu yana getiri, BIST100 endeksiyle kıyaslamalı olarak gösterilir. Noktalar alım/satım işlemlerinizi işaretler.
          </p>

          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2825" />

              <XAxis
                dataKey="label"
                tick={{ fill: '#66625a', fontSize: 11 }}
                interval="preserveStartEnd"
              />

              <YAxis
                tick={{ fill: '#66625a', fontSize: 11 }}
                tickFormatter={v => `${v}%`}
                width={56}
              />

              <ReferenceLine y={0} stroke="#3a372f" strokeDasharray="4 4" />

              <Tooltip
                formatter={(value, name) => [formatPercent(value), name]}
                contentStyle={{
                  background: '#141312',
                  border: '1px solid #2a2825',
                  borderRadius: '10px',
                  color: '#fff'
                }}
              />

              <Legend wrapperStyle={{ fontSize: '12px', color: '#9a968c' }} />

              <Line type="monotone" dataKey="getiri" name="Portföyüm" stroke={theme.info} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="bist" name="BIST100" stroke={theme.secondary} strokeWidth={2} strokeDasharray="5 4" dot={false} />

              {markers.map((m, i) => (
                <ReferenceDot
                  key={i}
                  x={m.label}
                  y={m.getiri}
                  r={5}
                  fill={m.tip === 'BUY' ? theme.success : theme.danger}
                  stroke="#0c0c0d"
                  strokeWidth={1.5}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </Panel>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(420px, 2fr) minmax(260px, 1fr) minmax(280px, 1fr)',
        gap: '20px',
        alignItems: 'start'
      }}>
        <Panel>
          <h3 style={{ marginTop: 0, marginBottom: '16px' }}>Pozisyonlar</h3>

          {loading ? (
            <p style={{ color: '#66625a' }}>Yükleniyor...</p>
          ) : portfolio?.sahipOlunanHisseler?.length > 0 ? (
            <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #2a2825', color: '#9a968c', textAlign: 'left' }}>
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
                    <tr key={h.stockID} style={{ borderBottom: '1px solid #2a2825' }}>
                      <td style={td}>
                        <div style={{ fontWeight: 'bold', color: '#f2f0ec' }}>{h.symbol}</div>
                        <div style={{ color: '#66625a', fontSize: '12px' }}>{h.companyName}</div>
                      </td>
                      <td style={td}>{h.lot}</td>
                      <td style={td}>{formatMoney(h.ortMaliyet, h.symbol)}</td>
                      <td style={td}>{formatMoney(h.sonFiyat, h.symbol)}</td>
                      <td style={td}>{formatMoney(h.anlikDeger, h.symbol)}</td>
                      <td style={td}>
                        <KarZararBadge
                          deger={h.karZarar}
                          yuzde={h.karZararYuzde}
                          symbol={h.symbol}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              marginTop: '8px',
              color: '#66625a',
              fontSize: '11px'
            }}>
              ↔ Dar ekranlarda tabloyu yatay kaydırabilirsiniz
            </div>
            </>
          ) : (
            <p style={{ color: '#66625a' }}>Henüz hisse yok.</p>
          )}
        </Panel>

        {pieData.length > 0 && (
          <Panel>
            <h3 style={{ marginTop: 0, marginBottom: '16px' }}>Dağılım</h3>

            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={84}
                  paddingAngle={5}
                  dataKey="value"
                  nameKey="name"
                  stroke="none"
                >
                  {pieData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={PIE_COLORS[index % PIE_COLORS.length]}
                    />
                  ))}
                </Pie>

                <Tooltip
                  formatter={(value, name) => [formatMoney(value, name), name]}
                  contentStyle={{
                    background: '#141312',
                    border: '1px solid #2a2825',
                    borderRadius: '10px',
                    color: '#fff'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              marginTop: '10px'
            }}>
              {pieData.map((item, index) => (
                <div
                  key={item.name}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    color: '#c7c3b8',
                    fontSize: '13px'
                  }}
                >
                  <span>
                    <span style={{
                      display: 'inline-block',
                      width: 9,
                      height: 9,
                      borderRadius: '50%',
                      background: PIE_COLORS[index % PIE_COLORS.length],
                      marginRight: 8
                    }} />
                    {item.name}
                  </span>
                  <span>{formatMoney(item.value, item.name)}</span>
                </div>
              ))}
            </div>
          </Panel>
        )}

        <Panel>
          <h3 style={{ marginTop: 0, marginBottom: '16px' }}>⚖️ Hızlı İşlem</h3>

          <div style={{ position: 'relative', marginBottom: '12px' }}>
            <input
              placeholder="Hisse ara... (örn: THYAO.IS, AAPL)"
              value={searchQ}
              onChange={handleSearch}
              style={inputStyle}
            />

            {searchResults.length > 0 && (
              <div style={searchBoxStyle}>
                {searchResults.map(s => (
                  <div
                    key={s.stockID}
                    onClick={() => {
                      setSelected(s)
                      setSearchQ(s.symbol)
                      setResults([])
                    }}
                    style={searchItemStyle}
                    onMouseEnter={e => { e.currentTarget.style.background = '#2a2825' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <div>
                      <div style={{ fontWeight: 'bold', color: '#60a5fa' }}>{s.symbol}</div>
                      <div style={{ color: '#9a968c', fontSize: '12px' }}>{s.companyName}</div>
                    </div>
                    <span style={{ color: '#66625a', fontSize: '12px' }}>Seç</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedStock && (
            <div style={{
              background: '#0f0f10',
              border: '1px solid #2a2825',
              borderRadius: '10px',
              padding: '10px 12px',
              marginBottom: '12px',
              fontSize: '13px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ color: theme.info, fontWeight: 'bold' }}>
                  {selectedStock.symbol}
                </div>

                {priceLoading ? (
                  <span style={{ color: '#66625a', fontSize: '12px' }}>Fiyat yükleniyor...</span>
                ) : selectedPrice ? (
                  <span style={{ color: '#f2f0ec', fontWeight: 'bold' }}>
                    {formatMoney(selectedPrice.closePrice, selectedStock.symbol)}
                  </span>
                ) : priceError ? (
                  <span style={{ color: theme.danger, fontSize: '12px' }}>Fiyat yok</span>
                ) : null}
              </div>

              <div style={{ color: '#66625a', fontSize: '12px', marginTop: '3px' }}>
                {selectedStock.companyName}
              </div>

              {priceError && (
                <div style={{ color: theme.danger, fontSize: '12px', marginTop: '6px' }}>
                  {priceError}
                </div>
              )}

              {selectedPrice && Number(qty) > 0 && (
                <div style={{ color: '#9a968c', fontSize: '12px', marginTop: '6px' }}>
                  Tahmini tutar: {formatMoney(Number(qty) * selectedPrice.closePrice, selectedStock.symbol)}
                </div>
              )}
            </div>
          )}

          <input
            type="number"
            min="1"
            value={qty}
            onChange={e => setQty(e.target.value)}
            style={{ ...inputStyle, marginBottom: '12px' }}
            placeholder="Adet"
          />

          <button
            onClick={() => executeTrade(0)}
            disabled={txLoading}
            style={{
              ...btnStyle(theme.success),
              width: '100%',
              marginBottom: '8px',
              opacity: txLoading ? 0.65 : 1
            }}
          >
            🟢 AL
          </button>

          <button
            onClick={() => executeTrade(1)}
            disabled={txLoading}
            style={{
              ...btnStyle(theme.danger),
              width: '100%',
              opacity: txLoading ? 0.65 : 1
            }}
          >
            🔴 SAT
          </button>
        </Panel>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, color, prefix = '' }) {
  return (
    <div style={{
      background: 'linear-gradient(180deg, #141312 0%, #0f0f10 100%)',
      border: '1px solid #2a2825',
      borderRadius: '16px',
      padding: '16px',
      minHeight: '86px'
    }}>
      <div style={{ color: '#66625a', fontSize: '12px', marginBottom: '8px' }}>
        {label}
      </div>
      <div style={{ color, fontWeight: 'bold', fontSize: '20px' }}>
        {prefix}{formatMoney(value, { currency: 'TRY' })}
      </div>
    </div>
  )
}

function Panel({ children, style }) {
  return (
    <div style={{
      background: 'linear-gradient(180deg, #141312 0%, #141312 100%)',
      border: '1px solid #2a2825',
      borderRadius: '18px',
      padding: '20px',
      boxShadow: '0 18px 40px rgba(0,0,0,0.22)',
      ...style
    }}>
      {children}
    </div>
  )
}

const th = {
  padding: '9px 12px',
  fontWeight: 'normal',
  whiteSpace: 'nowrap'
}

const td = {
  padding: '11px 12px',
  color: '#c7c3b8',
  whiteSpace: 'nowrap'
}

const inputStyle = {
  width: '100%',
  padding: '11px 12px',
  background: '#0f0f10',
  border: '1px solid #2a2825',
  borderRadius: '10px',
  color: '#fff',
  fontSize: '14px',
  outline: 'none'
}

const searchBoxStyle = {
  position: 'absolute',
  top: 'calc(100% + 8px)',
  left: 0,
  right: 0,
  background: '#141312',
  border: '1px solid #2a2825',
  borderRadius: '12px',
  zIndex: 20,
  maxHeight: '220px',
  overflowY: 'auto',
  boxShadow: '0 24px 44px rgba(0,0,0,0.42)'
}

const searchItemStyle = {
  padding: '12px 14px',
  cursor: 'pointer',
  borderBottom: '1px solid #2a2825',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center'
}

function btnStyle(bg) {
  return {
    padding: '11px 16px',
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold'
  }
}