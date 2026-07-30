import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye } from 'lucide-react'
import { getStocks } from '../api/client'
import { useAnalysis } from '../context/AnalysisContext'
import { theme } from '../theme'

const BLUE = theme.info
const GREEN = theme.success
const YELLOW = theme.warning
const RED = theme.danger
const PURPLE = theme.secondary
const GRAY = theme.textFaint

const STORAGE_KEY = 'pusula_ai_watchlist_v1'

function normalizeStocks(payload) {
  if (!payload) return []
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload.$values)) return payload.$values
  return []
}

function getStockId(stock) {
  return stock?.stockID ?? stock?.StockID ?? stock?.stockId ?? stock?.id
}

function getSymbol(stock) {
  return String(stock?.symbol ?? stock?.Symbol ?? stock?.ticker ?? '').toUpperCase()
}

function getCompanyName(stock) {
  return stock?.companyName ?? stock?.CompanyName ?? stock?.name ?? '-'
}

function getSector(stock) {
  return stock?.sector ?? stock?.Sector ?? ''
}

function loadWatchlist() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)

    if (Array.isArray(parsed)) {
      return parsed
        .map(Number)
        .filter(Number.isFinite)
    }

    return []
  } catch {
    return []
  }
}

function saveWatchlist(ids) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
}

function isBist(symbol) {
  return String(symbol || '').toUpperCase().endsWith('.IS') || ['KOZAY', 'KOZAL', 'KOZAA'].includes(String(symbol || '').toUpperCase())
}

export default function Watchlist() {
  const navigate = useNavigate()
  const { selectStock } = useAnalysis()

  const [stocks, setStocks] = useState([])
  const [watchIds, setWatchIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [query, setQuery] = useState('')
  const [marketFilter, setMarketFilter] = useState('all')
  const [viewMode, setViewMode] = useState('watchlist')

  useEffect(() => {
    setWatchIds(new Set(loadWatchlist()))
    loadStocks()
  }, [])

  async function loadStocks() {
    setLoading(true)
    setMessage('')

    try {
      const res = await getStocks()
      setStocks(normalizeStocks(res.data))
    } catch (e) {
      setMessage('❌ Hisse listesi alınamadı: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  function toggleWatch(stock) {
    const id = Number(getStockId(stock))

    if (!Number.isFinite(id)) {
      setMessage('❌ Bu varlık için StockID bulunamadı.')
      return
    }

    setWatchIds(prev => {
      const next = new Set(prev)

      if (next.has(id)) {
        next.delete(id)
        setMessage(`➖ ${getSymbol(stock)} izleme listesinden çıkarıldı.`)
      } else {
        next.add(id)
        setMessage(`✅ ${getSymbol(stock)} izleme listesine eklendi.`)
      }

      saveWatchlist(next)
      return next
    })
  }

  function clearWatchlist() {
    const ok = window.confirm('İzleme listesini tamamen temizlemek istediğinizden emin misiniz?')
    if (!ok) return

    setWatchIds(new Set())
    saveWatchlist(new Set())
    setMessage('🧹 İzleme listesi temizlendi.')
  }

  function openInDashboard(stock) {
    selectStock(stock)
    navigate('/')
  }

  function selectStarterPack() {
    const starterSymbols = [
      'THYAO.IS',
      'TUPRS.IS',
      'ASELS.IS',
      'KONTR.IS',
      'SASA.IS',
      'GARAN.IS',
      'AKBNK.IS',
      'BIMAS.IS'
    ]

    const ids = stocks
      .filter(s => starterSymbols.includes(getSymbol(s)))
      .map(s => Number(getStockId(s)))
      .filter(Number.isFinite)

    const next = new Set(ids)
    setWatchIds(next)
    saveWatchlist(next)
    setMessage('✅ Başlangıç izleme listesi oluşturuldu.')
  }

  const watchlistStocks = useMemo(() => {
    return stocks.filter(s => watchIds.has(Number(getStockId(s))))
  }, [stocks, watchIds])

  const filteredStocks = useMemo(() => {
    const q = query.trim().toLowerCase()

    const base = viewMode === 'watchlist'
      ? watchlistStocks
      : stocks

    return base.filter(stock => {
      const symbol = getSymbol(stock)
      const companyName = getCompanyName(stock)
      const sector = getSector(stock)

      const matchesQuery =
        !q ||
        symbol.toLowerCase().includes(q) ||
        String(companyName).toLowerCase().includes(q) ||
        String(sector).toLowerCase().includes(q)

      const matchesMarket =
        marketFilter === 'all' ||
        (marketFilter === 'bist' && isBist(symbol)) ||
        (marketFilter === 'foreign' && !isBist(symbol))

      return matchesQuery && matchesMarket
    })
  }, [stocks, watchlistStocks, query, marketFilter, viewMode])

  const stats = useMemo(() => {
    const bistCount = watchlistStocks.filter(s => isBist(getSymbol(s))).length
    const foreignCount = watchlistStocks.length - bistCount

    return {
      totalUniverse: stocks.length,
      watchCount: watchlistStocks.length,
      bistCount,
      foreignCount
    }
  }, [stocks, watchlistStocks])

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
      <Header />

      {message && (
        <div style={{
          background: '#141312',
          border: '1px solid #2a2825',
          borderRadius: '14px',
          padding: '13px 16px',
          marginBottom: '20px',
          color: '#c7c3b8',
          boxShadow: '0 14px 32px rgba(0,0,0,0.18)'
        }}>
          {message}
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(160px, 1fr))',
        gap: '14px',
        marginBottom: '22px'
      }}>
        <StatCard label="İzlenen Varlık" value={stats.watchCount} color={BLUE} icon="👁️" />
        <StatCard label="BIST" value={stats.bistCount} color={GREEN} icon="🇹🇷" />
        <StatCard label="Yabancı" value={stats.foreignCount} color={PURPLE} icon="🌍" />
        <StatCard label="Evren" value={stats.totalUniverse} color={YELLOW} icon="📦" />
      </div>

      <Panel>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '16px',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          marginBottom: '18px'
        }}>
          <div>
            <div style={{ color: '#66625a', fontSize: '12px', marginBottom: 4 }}>
              Kişisel Takip Alanı
            </div>

            <h3 style={{ margin: 0, letterSpacing: '-0.4px' }}>
              İzleme Listesi
            </h3>

            <p style={{
              color: '#9a968c',
              fontSize: '13px',
              marginTop: '7px',
              maxWidth: 720,
              lineHeight: 1.55
            }}>
              Takip etmek istediğiniz hisseleri buraya ekleyebilirsiniz. Liste tarayıcıda saklanır; backend verilerini değiştirmez.
              Bir varlığı Dashboard’da açarak hızlıca analiz başlatabilirsiniz.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={selectStarterPack} disabled={loading} style={secondaryButton}>
              Başlangıç Paketi
            </button>

            <button onClick={clearWatchlist} disabled={watchIds.size === 0} style={{
              ...dangerButton,
              opacity: watchIds.size === 0 ? 0.55 : 1
            }}>
              Listeyi Temizle
            </button>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(260px, 1fr) auto auto',
          gap: '12px',
          alignItems: 'center',
          marginBottom: '18px'
        }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Hisse, şirket veya sektör ara..."
            style={inputStyle}
          />

          <SegmentedButton
            value={viewMode}
            setValue={setViewMode}
            options={[
              ['watchlist', 'Listem'],
              ['all', 'Tüm Varlıklar']
            ]}
          />

          <SegmentedButton
            value={marketFilter}
            setValue={setMarketFilter}
            options={[
              ['all', 'Tümü'],
              ['bist', 'BIST'],
              ['foreign', 'Yabancı']
            ]}
          />
        </div>

        {loading ? (
          <LoadingState />
        ) : filteredStocks.length > 0 ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
            gap: '14px'
          }}>
            {filteredStocks.map(stock => {
              const id = Number(getStockId(stock))
              const symbol = getSymbol(stock)
              const watched = watchIds.has(id)
              const localMarket = isBist(symbol) ? 'BIST' : 'GLOBAL'

              return (
                <div
                  key={id}
                  style={{
                    background: watched
                      ? 'radial-gradient(circle at top left, rgba(217,119,6,0.18), transparent 40%), #0f0f10'
                      : '#0f0f10',
                    border: watched ? '1px solid #2dd4bf66' : '1px solid #2a2825',
                    borderRadius: '18px',
                    padding: '16px',
                    minHeight: 178,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '10px',
                      alignItems: 'flex-start',
                      marginBottom: '10px'
                    }}>
                      <div>
                        <div style={{
                          color: watched ? '#93c5fd' : '#f2f0ec',
                          fontWeight: 'bold',
                          fontSize: '18px',
                          letterSpacing: '-0.3px'
                        }}>
                          {symbol}
                        </div>

                        <div style={{
                          color: '#66625a',
                          fontSize: '12px',
                          marginTop: '3px'
                        }}>
                          ID: {id}
                        </div>
                      </div>

                      <span style={{
                        color: localMarket === 'BIST' ? GREEN : PURPLE,
                        background: localMarket === 'BIST' ? '#10b98118' : '#8b5cf618',
                        border: `1px solid ${localMarket === 'BIST' ? GREEN : PURPLE}44`,
                        borderRadius: '999px',
                        padding: '5px 8px',
                        fontSize: '11px',
                        fontWeight: 'bold'
                      }}>
                        {localMarket}
                      </span>
                    </div>

                    <div style={{
                      color: '#c7c3b8',
                      fontSize: '13px',
                      lineHeight: 1.45,
                      minHeight: 38,
                      marginBottom: '10px'
                    }}>
                      {getCompanyName(stock)}
                    </div>

                    <div style={{
                      color: '#66625a',
                      fontSize: '12px'
                    }}>
                      {getSector(stock) || 'Sektör bilgisi yok'}
                    </div>
                  </div>

                  <div style={{
                    display: 'flex',
                    gap: '8px',
                    marginTop: '14px'
                  }}>
                    <button
                      onClick={() => openInDashboard(stock)}
                      style={{
                        ...primaryMiniButton,
                        flex: 1
                      }}
                    >
                      Dashboard’da Aç
                    </button>

                    <button
                      onClick={() => toggleWatch(stock)}
                      style={{
                        ...watchButton,
                        background: watched ? '#ef444422' : '#10b98122',
                        border: watched ? '1px solid #ef444466' : '1px solid #10b98166',
                        color: watched ? '#fecaca' : '#bbf7d0'
                      }}
                    >
                      {watched ? 'Çıkar' : 'Ekle'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <EmptyState
            viewMode={viewMode}
            onBrowseAll={() => setViewMode('all')}
            onAddStarterPack={selectStarterPack}
          />
        )}
      </Panel>
    </div>
  )
}

function Header() {
  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        color: '#66625a',
        fontSize: '13px',
        marginBottom: '8px'
      }}>
        <span style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: BLUE,
          boxShadow: `0 0 18px ${BLUE}`
        }} />
        Pusula AI · İzleme Listesi
      </div>

      <h2 style={{
        margin: 0,
        letterSpacing: '-0.8px',
        fontSize: '31px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <Eye size={26} strokeWidth={1.75} color="#f59e0b" />
        İzleme Listesi
      </h2>

      <p style={{
        color: '#9a968c',
        marginTop: '9px',
        maxWidth: '860px',
        lineHeight: 1.6
      }}>
        Takip ettiğiniz varlıkları tek ekranda toplayabilir, hızlıca Dashboard’a taşıyabilir ve analiz akışını hızlandırabilirsiniz.
      </p>
    </div>
  )
}

function StatCard({ label, value, color, icon }) {
  return (
    <div style={{
      background: 'linear-gradient(180deg, #141312 0%, #0f0f10 100%)',
      border: '1px solid #2a2825',
      borderRadius: '18px',
      padding: '16px',
      minHeight: '92px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div style={{
        position: 'absolute',
        right: 12,
        top: 12,
        fontSize: 20,
        opacity: 0.55
      }}>
        {icon}
      </div>

      <div style={{ color: '#66625a', fontSize: '12px', marginBottom: '8px' }}>
        {label}
      </div>

      <div style={{
        color,
        fontWeight: 'bold',
        fontSize: '24px',
        letterSpacing: '-0.4px'
      }}>
        {value}
      </div>
    </div>
  )
}

function Panel({ children }) {
  return (
    <div style={{
      background: 'linear-gradient(180deg, #141312 0%, #141312 100%)',
      border: '1px solid #2a2825',
      borderRadius: '20px',
      padding: '22px',
      marginBottom: '22px',
      boxShadow: '0 18px 40px rgba(0,0,0,0.22)'
    }}>
      {children}
    </div>
  )
}

function SegmentedButton({ value, setValue, options }) {
  return (
    <div style={{
      display: 'flex',
      background: '#0f0f10',
      padding: '4px',
      borderRadius: '13px',
      border: '1px solid #2a2825',
      flexWrap: 'wrap',
      gap: '3px'
    }}>
      {options.map(([key, label]) => (
        <button
          key={key}
          onClick={() => setValue(key)}
          style={{
            padding: '8px 11px',
            background: value === key ? '#d97706' : 'transparent',
            color: value === key ? '#fff' : '#9a968c',
            border: 'none',
            borderRadius: '10px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 'bold'
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function LoadingState() {
  return (
    <div style={{
      minHeight: 240,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#9a968c',
      textAlign: 'center'
    }}>
      <div>
        <div style={{ fontSize: 42, marginBottom: 12 }}>⏳</div>
        <h3 style={{ margin: 0, color: '#e8e5df' }}>Varlık listesi yükleniyor</h3>
        <p style={{ marginTop: 8 }}>İzleme listesi hazırlanıyor...</p>
      </div>
    </div>
  )
}

function EmptyState({ viewMode, onBrowseAll, onAddStarterPack }) {
  return (
    <div style={{
      minHeight: 260,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#9a968c',
      textAlign: 'center'
    }}>
      <div>
        <div style={{ fontSize: 44, marginBottom: 12 }}>
          {viewMode === 'watchlist' ? '👁️' : '🔎'}
        </div>

        <h3 style={{ margin: 0, color: '#e8e5df' }}>
          {viewMode === 'watchlist'
            ? 'İzleme listesi boş'
            : 'Sonuç bulunamadı'}
        </h3>

        <p style={{
          marginTop: 8,
          maxWidth: 520,
          lineHeight: 1.55
        }}>
          {viewMode === 'watchlist'
            ? 'Takip etmek istediğin hisseleri tek tıkla ekleyebilir ya da tüm varlıkları gözden geçirebilirsin.'
            : 'Arama veya filtre kriterlerini değiştirerek tekrar deneyebilirsin.'}
        </p>

        {viewMode === 'watchlist' && (
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '16px' }}>
            <button onClick={onAddStarterPack} style={primaryMiniButton}>
              Başlangıç Paketini Ekle
            </button>
            <button onClick={onBrowseAll} style={secondaryButton}>
              Tüm Varlıklara Geç
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%',
  padding: '13px 16px',
  background: '#0f0f10',
  border: '1px solid #2a2825',
  borderRadius: '13px',
  color: '#fff',
  fontSize: '14px',
  outline: 'none'
}

const secondaryButton = {
  padding: '11px 14px',
  color: '#c7c3b8',
  border: '1px solid #2a2825',
  borderRadius: '13px',
  fontWeight: 'bold',
  fontSize: '13px',
  background: '#0f0f10',
  cursor: 'pointer'
}

const dangerButton = {
  padding: '11px 14px',
  color: '#fecaca',
  border: '1px solid #ef444455',
  borderRadius: '13px',
  fontWeight: 'bold',
  fontSize: '13px',
  background: '#ef444418',
  cursor: 'pointer'
}

const primaryMiniButton = {
  padding: '9px 11px',
  color: '#fff',
  border: 'none',
  borderRadius: '11px',
  fontWeight: 'bold',
  fontSize: '12px',
  background: '#d97706',
  cursor: 'pointer'
}

const watchButton = {
  padding: '9px 11px',
  borderRadius: '11px',
  fontWeight: 'bold',
  fontSize: '12px',
  cursor: 'pointer'
}