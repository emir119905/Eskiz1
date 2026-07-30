import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Radar as RadarIcon } from 'lucide-react'
import { getZetaStatus, getZetaLatestRadar, runZetaRadar } from '../api/client'
import { useAnalysis } from '../context/AnalysisContext'
import { theme } from '../theme'

const TEAL = theme.info
const GREEN = theme.success
// not: uyarı sarısı theme.warning'dir, marka turuncusuyla (theme.primary) aynı değildir —
// senaryo etiketleri veri anlamı taşır, marka rengiyle karıştırılmamalı.
const AMBER = theme.warning
const RED = theme.danger
const GRAY = theme.textFaint

const SCENARIO_META = {
  MOMENTUM_LONG: { label: 'Momentum', color: GREEN },
  DIP_REBOUND_WATCH: { label: 'Dip Sonrası İzleme', color: AMBER },
  NEUTRAL: { label: 'Nötr', color: GRAY }
}

function scenarioMeta(scenario) {
  return SCENARIO_META[scenario] || { label: scenario || '-', color: GRAY }
}

const TAG_META = {
  HIGH_FLAT_RISK: { label: 'Durgunluk Riski', desc: 'Model, fiyatın yatay/durgun kalma olasılığını yüksek görüyor.' },
  NO_CLEAR_EDGE: { label: 'Net Sinyal Yok', desc: 'Yön tahmininde belirgin bir üstünlük tespit edilemedi.' },
  HIGH_VOLUME_WEAK_CLOSE: { label: 'Zayıf Kapanış', desc: 'İşlem hacmi yüksek ama fiyat gün içi zirvesinden uzak kapandı.' },
  BREAKOUT_PRESSURE: { label: 'Kırılım Baskısı', desc: 'Fiyat, direnç seviyesini zorlayan bir baskı gösteriyor.' },
  POSITIVE_MOMENTUM: { label: 'Pozitif Momentum', desc: 'Kısa vadeli fiyat hareketi yukarı yönlü ivme taşıyor.' },
  RELATIVE_STRENGTH: { label: 'Göreceli Güç', desc: 'Hisse, genel piyasaya kıyasla daha güçlü performans gösteriyor.' },
  UP_PROBABILITY_SUPPORT: { label: 'Yükseliş Desteği', desc: 'Model, yükseliş ihtimalini diğer senaryolara göre daha yüksek buluyor.' },
  CONTROLLED_VOLATILITY: { label: 'Kontrollü Oynaklık', desc: 'Fiyat dalgalanması aşırı değil, kontrollü bir aralıkta.' },
  LOWER_WICK_SUPPORT: { label: 'Alt Fitil Desteği', desc: 'Mumun alt fitili, o seviyeden alım ilgisi olduğunu gösteriyor.' },
  LOW_RANGE_POSITION: { label: 'Düşük Aralık Konumu', desc: 'Fiyat, kısa vadeli aralığının alt bölgesinde işlem görüyor.' },
  RECOVERY_CLOSE: { label: 'Toparlanma Kapanışı', desc: 'Gün içi düşüşün ardından güne yakın bir seviyeden kapanış yapıldı.' }
}

function tagMeta(code) {
  return TAG_META[code] || { label: code, desc: '' }
}

function normalizeRadar(payload) {
  if (!payload) return { date: null, totalStocks: 0, allStocks: [] }
  const list = Array.isArray(payload.allStocks)
    ? payload.allStocks
    : Array.isArray(payload.allStocks?.$values)
      ? payload.allStocks.$values
      : []
  return { date: payload.date, totalStocks: payload.totalStocks, allStocks: list }
}

function fmtDate(d) {
  if (!d) return '-'
  const parsed = new Date(d)
  if (Number.isNaN(parsed.getTime())) return d
  return parsed.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtPct(v) {
  if (v == null || Number.isNaN(Number(v))) return '-'
  return `${Number(v).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}%`
}

function fmtScore(v) {
  if (v == null || Number.isNaN(Number(v))) return '-'
  return Number(v).toLocaleString('tr-TR', { maximumFractionDigits: 1 })
}

export default function MarketScreener() {
  const navigate = useNavigate()
  const { selectStock } = useAnalysis()

  const [status, setStatus] = useState(null)
  const [radar, setRadar] = useState({ date: null, totalStocks: 0, allStocks: [] })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [message, setMessage] = useState('')

  const [query, setQuery] = useState('')
  const [scenarioFilter, setScenarioFilter] = useState('ALL')
  const [hideRisky, setHideRisky] = useState(false)
  const [sortKey, setSortKey] = useState('score')
  const [sortDir, setSortDir] = useState('desc')

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    setMessage('')

    try {
      const [statusRes, radarRes] = await Promise.all([
        getZetaStatus(),
        getZetaLatestRadar().catch(() => null)
      ])

      setStatus(statusRes.data)
      if (radarRes) setRadar(normalizeRadar(radarRes.data))
    } catch (e) {
      setMessage('❌ Tarama verisi alınamadı: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  async function refreshScan() {
    setRefreshing(true)
    setMessage('⏳ Tarama çalıştırılıyor, bu birkaç dakika sürebilir...')

    try {
      const res = await runZetaRadar()
      setMessage(res.data?.success === false
        ? '❌ Tarama başarısız oldu: ' + res.data.message
        : '✅ Tarama tamamlandı.')
      await loadAll()
    } catch (e) {
      setMessage('❌ Tarama başlatılamadı: ' + (e.response?.data?.message || e.message))
    } finally {
      setRefreshing(false)
    }
  }

  function openInDashboard(item) {
    selectStock({ stockID: item.stockID, symbol: item.symbol })
    navigate('/')
  }

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir(prev => (prev === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const scenarios = useMemo(() => {
    const set = new Set(radar.allStocks.map(s => s.scenario).filter(Boolean))
    return ['ALL', ...Array.from(set)]
  }, [radar.allStocks])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()

    const filtered = radar.allStocks.filter(s => {
      const matchesQuery = !q || String(s.symbol || '').toLowerCase().includes(q)
      const matchesScenario = scenarioFilter === 'ALL' || s.scenario === scenarioFilter
      const matchesRisk = !hideRisky || !(s.warningTags && s.warningTags.length > 0)
      return matchesQuery && matchesScenario && matchesRisk
    })

    const sortValue = (s, key) => {
      if (key === 'symbol') return s.symbol || ''
      if (key === 'closePrice') return Number(s.closePrice) || 0
      if (key === 'score') return Number(s.score) || 0
      if (key === 'confidence') return Number(s.confidence) || 0
      if (key === 'up') return Number(s.modelProbabilities?.up) || 0
      if (key === 'momentumLong') return Number(s.scores?.momentumLong) || 0
      if (key === 'dipRebound') return Number(s.scores?.dipRebound) || 0
      if (key === 'downsideRisk') return Number(s.scores?.downsideRisk) || 0
      return 0
    }

    const sorted = [...filtered].sort((a, b) => {
      const va = sortValue(a, sortKey)
      const vb = sortValue(b, sortKey)
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return sorted
  }, [radar.allStocks, query, scenarioFilter, hideRisky, sortKey, sortDir])

  return (
    <div style={{ maxWidth: '1320px', margin: '0 auto' }}>
      <Header />

      {message && (
        <div style={{
          background: '#141312',
          border: '1px solid #2a2825',
          borderRadius: '14px',
          padding: '13px 16px',
          marginBottom: '20px',
          color: '#c7c3b8'
        }}>
          {message}
        </div>
      )}

      <Panel>
        {status?.isStale && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: `${AMBER}18`,
            border: `1px solid ${AMBER}55`,
            borderRadius: '12px',
            padding: '12px 16px',
            marginBottom: '16px',
            color: '#f2f0ec',
            fontSize: '13px'
          }}>
            <span style={{ fontSize: '18px' }}>⚠</span>
            <span>
              <strong style={{ color: AMBER }}>Veriler güncel olmayabilir.</strong>{' '}
              Aşağıdaki tablo son taramadan bu yana yenilenmemiş olabilir — "Taramayı Yenile" ile güncelleyebilirsiniz.
            </span>
          </div>
        )}

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '16px',
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: '18px'
        }}>
          <div style={{ color: '#9a968c', fontSize: '13px', lineHeight: 1.6 }}>
            {status?.latestRadarDate
              ? <>Son tarama: <strong style={{ color: '#e8e5df' }}>{fmtDate(status.latestRadarDate)}</strong> · {radar.totalStocks || 0} hisse</>
              : 'Henüz bir tarama çalıştırılmamış.'}
          </div>

          <button
            onClick={refreshScan}
            disabled={refreshing || status?.isRunning}
            style={{
              ...primaryButton,
              opacity: (refreshing || status?.isRunning) ? 0.6 : 1
            }}
          >
            {refreshing || status?.isRunning ? 'Çalışıyor...' : '🔄 Taramayı Yenile'}
          </button>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(220px, 1fr) auto auto',
          gap: '12px',
          alignItems: 'center',
          marginBottom: '18px'
        }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Sembol ara..."
            style={inputStyle}
          />

          <SegmentedButton
            value={scenarioFilter}
            setValue={setScenarioFilter}
            options={scenarios.map(s => [s, s === 'ALL' ? 'Tümü' : scenarioMeta(s).label])}
          />

          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#9a968c',
            fontSize: '13px',
            padding: '0 6px',
            cursor: 'pointer'
          }}>
            <input type="checkbox" checked={hideRisky} onChange={e => setHideRisky(e.target.checked)} />
            Sadece uyarısız
          </label>
        </div>

        {loading ? (
          <LoadingState />
        ) : rows.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #2a2825', color: '#9a968c', textAlign: 'left' }}>
                  <SortableTh label="Sembol" sortKey="symbol" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortableTh label="Fiyat" sortKey="closePrice" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <th style={th}>Senaryo</th>
                  <SortableTh label="Skor" sortKey="score" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortableTh label="Güven" sortKey="confidence" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortableTh label="Yükseliş" sortKey="up" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortableTh label="Momentum" sortKey="momentumLong" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortableTh label="Dip Rebound" sortKey="dipRebound" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortableTh label="Düşüş Riski" sortKey="downsideRisk" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <th style={th}>Etiketler</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((item, index) => {
                  const meta = scenarioMeta(item.scenario)
                  const isTop = index < 3
                  const baseBg = isTop ? 'rgba(217,119,6,0.07)' : 'transparent'
                  return (
                    <tr
                      key={item.stockID}
                      onClick={() => openInDashboard(item)}
                      style={{
                        borderBottom: '1px solid #2a2825',
                        borderLeft: isTop ? '3px solid #d97706' : '3px solid transparent',
                        cursor: 'pointer',
                        background: baseBg
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#1c1b19' }}
                      onMouseLeave={e => { e.currentTarget.style.background = baseBg }}
                    >
                      <td style={{ ...td, fontWeight: 'bold', color: '#f2f0ec' }}>
                        {item.symbol}
                      </td>
                      <td style={td}>{fmtScore(item.closePrice)}</td>
                      <td style={td}>
                        <span style={{
                          color: meta.color,
                          background: `${meta.color}18`,
                          border: `1px solid ${meta.color}44`,
                          borderRadius: '999px',
                          padding: '4px 9px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          whiteSpace: 'nowrap'
                        }}>
                          {meta.label}
                        </span>
                      </td>
                      <td style={td}>{fmtScore(item.score)}</td>
                      <td style={td}>{fmtScore(item.confidence)}</td>
                      <td style={td}>{fmtPct((item.modelProbabilities?.up || 0) * 100)}</td>
                      <td style={td}>{fmtScore(item.scores?.momentumLong)}</td>
                      <td style={td}>{fmtScore(item.scores?.dipRebound)}</td>
                      <td style={td}>{fmtScore(item.scores?.downsideRisk)}</td>
                      <td style={td}>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', maxWidth: 220 }}>
                          {(item.warningTags || []).map(tag => (
                            <Tag key={tag} code={tag} color={RED} />
                          ))}
                          {(item.reasonTags || []).slice(0, 2).map(tag => (
                            <Tag key={tag} code={tag} color={TEAL} />
                          ))}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState hasData={radar.allStocks.length > 0} />
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
          background: TEAL,
          boxShadow: `0 0 18px ${TEAL}`
        }} />
        Pusula AI · Piyasa Taraması
      </div>

      <h2 style={{
        margin: 0,
        letterSpacing: '-0.8px',
        fontSize: '31px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <RadarIcon size={26} strokeWidth={1.75} color="#f59e0b" />
        Piyasa Taraması
      </h2>

      <p style={{ color: '#9a968c', marginTop: '9px', maxWidth: '860px', lineHeight: 1.6 }}>
        BIST evrenindeki tüm hisseler için modelin ürettiği ham skorlar. Sıralayın, filtreleyin,
        bir satıra tıklayarak Dashboard'da derinlemesine analiz açın.
      </p>
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
            fontWeight: 'bold',
            whiteSpace: 'nowrap'
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function SortableTh({ label, sortKey, current, dir, onClick }) {
  const active = current === sortKey
  return (
    <th
      style={{ ...th, cursor: 'pointer', userSelect: 'none', color: active ? '#e8e5df' : '#9a968c' }}
      onClick={() => onClick(sortKey)}
    >
      {label} {active ? (dir === 'desc' ? '▼' : '▲') : ''}
    </th>
  )
}

function Tag({ code, color }) {
  const meta = tagMeta(code)
  return (
    <span
      title={meta.desc}
      style={{
        color,
        background: `${color}18`,
        border: `1px solid ${color}44`,
        borderRadius: '6px',
        padding: '2px 6px',
        fontSize: '10px',
        fontWeight: 'bold',
        whiteSpace: 'nowrap',
        cursor: meta.desc ? 'help' : 'default'
      }}
    >
      {meta.label}
    </span>
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
        <h3 style={{ margin: 0, color: '#e8e5df' }}>Tarama verisi yükleniyor</h3>
      </div>
    </div>
  )
}

function EmptyState({ hasData }) {
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
        <div style={{ fontSize: 44, marginBottom: 12 }}>📡</div>
        <h3 style={{ margin: 0, color: '#e8e5df' }}>
          {hasData ? 'Sonuç bulunamadı' : 'Henüz tarama verisi yok'}
        </h3>
        <p style={{ marginTop: 8, maxWidth: 520, lineHeight: 1.55 }}>
          {hasData
            ? 'Arama veya filtre kriterlerini değiştirerek tekrar deneyebilirsiniz.'
            : '"Taramayı Yenile" butonuyla ilk taramayı başlatabilirsiniz.'}
        </p>
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

const primaryButton = {
  padding: '11px 16px',
  background: '#d97706',
  color: '#fff',
  border: 'none',
  borderRadius: '12px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 'bold'
}

const th = {
  padding: '9px 12px',
  fontWeight: 'normal',
  whiteSpace: 'nowrap'
}

const td = {
  padding: '10px 12px',
  color: '#c7c3b8',
  whiteSpace: 'nowrap'
}
