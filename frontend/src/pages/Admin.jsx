import { useEffect, useMemo, useState } from 'react'
import {
  getStocks,
  getDbStatus,
  syncStock,
  syncAllStocks,
  deleteStockHistoricalData,
  addStock
} from '../api/client'

const BLUE = '#3b82f6'
const GREEN = '#10b981'
const YELLOW = '#f59e0b'
const RED = '#ef4444'
const PURPLE = '#8b5cf6'
const GRAY = '#6b7280'

function asArray(payload) {
  if (!payload) return []
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload.$values)) return payload.$values

  const candidates = [
    payload.items,
    payload.Items,
    payload.data,
    payload.Data,
    payload.result,
    payload.Result,
    payload.results,
    payload.Results,
    payload.stocks,
    payload.Stocks,
    payload.status,
    payload.Status,
    payload.statuses,
    payload.Statuses,
    payload.stockStatuses,
    payload.StockStatuses,
    payload.hisseler,
    payload.Hisseler,

    // Bizim .NET endpoint tam olarak bunu dönüyor:
    payload.hisseDurumlari,
    payload.HisseDurumlari,

    payload.value,
    payload.Value
  ]

  for (const c of candidates) {
    if (Array.isArray(c)) return c
    if (c && Array.isArray(c.$values)) return c.$values
  }

  return []
}

function firstDefined(...values) {
  return values.find(v => v !== undefined && v !== null)
}

function formatDate(value) {
  if (!value) return '-'

  try {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return String(value)

    return d.toLocaleDateString('tr-TR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  } catch {
    return String(value)
  }
}

function formatNumber(value) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '-'
  return Number(value).toLocaleString('tr-TR')
}

function formatPercent(value) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '-'
  return `${Number(value).toLocaleString('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}%`
}

function getStockId(x) {
  return firstDefined(
    x?.stockID,
    x?.StockID,
    x?.stockId,
    x?.id,
    x?.ID
  )
}

function getSymbol(x) {
  return String(firstDefined(
    x?.symbol,
    x?.Symbol,
    x?.ticker,
    x?.Ticker,
    ''
  ))
}

function normalizeStock(stock) {
  return {
    stockID: getStockId(stock),
    symbol: getSymbol(stock),
    companyName: firstDefined(stock?.companyName, stock?.CompanyName, stock?.name, stock?.Name, '-'),
    sector: firstDefined(stock?.sector, stock?.Sector, '-')
  }
}

function normalizeStatusRow(row) {
  return {
    stockID: getStockId(row),
    symbol: getSymbol(row),
    rowCount: firstDefined(
      row?.rowCount,
      row?.RowCount,
      row?.count,
      row?.Count,
      row?.totalRows,
      row?.TotalRows,
      row?.totalCount,
      row?.TotalCount,
      row?.dataCount,
      row?.DataCount,
      row?.recordCount,
      row?.RecordCount,
      row?.historicalDataCount,
      row?.HistoricalDataCount,
      row?.priceCount,
      row?.PriceCount,

      // Bizim endpoint:
      row?.kayitSayisi,
      row?.KayitSayisi
    ),
    firstDate: firstDefined(
      row?.firstDate,
      row?.FirstDate,
      row?.minDate,
      row?.MinDate,
      row?.startDate,
      row?.StartDate,
      row?.oldestDate,
      row?.OldestDate,

      // Bizim endpoint:
      row?.ilkTarih,
      row?.IlkTarih
    ),
    lastDate: firstDefined(
      row?.lastDate,
      row?.LastDate,
      row?.maxDate,
      row?.MaxDate,
      row?.endDate,
      row?.EndDate,
      row?.latestDate,
      row?.LatestDate,
      row?.newestDate,
      row?.NewestDate,

      // Bizim endpoint:
      row?.sonTarih,
      row?.SonTarih
    ),
    status: firstDefined(
      row?.status,
      row?.Status,
      row?.state,
      row?.State,
      row?.health,
      row?.Health,

      // Bizim endpoint:
      row?.durum,
      row?.Durum
    ),
    gapDays: firstDefined(
      row?.gapDays,
      row?.GapDays,
      row?.gunFarki,
      row?.GunFarki
    ),
    hasGap: firstDefined(
      row?.hasGap,
      row?.HasGap,
      row?.boslukVar,
      row?.BoslukVar
    ),
    ohlcMissingCount: firstDefined(
      row?.ohlcMissingCount,
      row?.OhlcMissingCount,
      row?.ohlcEksikSayisi,
      row?.OhlcEksikSayisi
    ),
    ohlcCompleteCount: firstDefined(
      row?.ohlcCompleteCount,
      row?.OhlcCompleteCount,
      row?.ohlcTamSayisi,
      row?.OhlcTamSayisi
    ),
    ohlcCompletenessPct: firstDefined(
      row?.ohlcCompletenessPct,
      row?.OhlcCompletenessPct,
      row?.ohlcTamlikYuzde,
      row?.OhlcTamlikYuzde
    )
  }
}

function buildRows(stocksPayload, statusPayload) {
  const stocks = asArray(stocksPayload).map(normalizeStock)
  const statuses = asArray(statusPayload).map(normalizeStatusRow)

  const byId = new Map()
  const bySymbol = new Map()

  for (const s of statuses) {
    if (s.stockID !== undefined && s.stockID !== null) byId.set(String(s.stockID), s)
    if (s.symbol) bySymbol.set(s.symbol.toUpperCase(), s)
  }

  if (stocks.length > 0) {
    return stocks.map(s => {
      const status =
        byId.get(String(s.stockID)) ||
        bySymbol.get(String(s.symbol || '').toUpperCase()) ||
        {}

      return {
        ...s,
        rowCount: status.rowCount,
        firstDate: status.firstDate,
        lastDate: status.lastDate,
        status: status.status,
        gapDays: status.gapDays,
        hasGap: status.hasGap,
        ohlcMissingCount: status.ohlcMissingCount,
        ohlcCompleteCount: status.ohlcCompleteCount,
        ohlcCompletenessPct: status.ohlcCompletenessPct
      }
    })
  }

  return statuses.map(s => ({
    stockID: s.stockID,
    symbol: s.symbol || '-',
    companyName: '-',
    sector: '-',
    rowCount: s.rowCount,
    firstDate: s.firstDate,
    lastDate: s.lastDate,
    status: s.status,
    gapDays: s.gapDays,
    hasGap: s.hasGap,
    ohlcMissingCount: s.ohlcMissingCount,
    ohlcCompleteCount: s.ohlcCompleteCount,
    ohlcCompletenessPct: s.ohlcCompletenessPct
  }))
}

function normalizeStatusText(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replaceAll('İ', 'I')
    .replaceAll('Ğ', 'G')
    .replaceAll('Ü', 'U')
    .replaceAll('Ş', 'S')
    .replaceAll('Ö', 'O')
    .replaceAll('Ç', 'C')
}

function getHealth(row) {
  const count = Number(row.rowCount || 0)
  const status = normalizeStatusText(row.status)

  if (status.includes('OHLC')) {
    return {
      label: 'OHLC Eksik',
      color: YELLOW,
      bg: '#f59e0b18'
    }
  }

  if (Number(row.ohlcMissingCount || 0) > 0) {
    return {
      label: 'OHLC Eksik',
      color: YELLOW,
      bg: '#f59e0b18'
    }
  }

  if (status.includes('SAGLIKLI') || status.includes('HEALTHY')) {
    return {
      label: 'Sağlıklı',
      color: GREEN,
      bg: '#10b98118'
    }
  }

  if (row.hasGap === true) {
    return {
      label: 'Boşluk Var',
      color: YELLOW,
      bg: '#f59e0b18'
    }
  }

  if (status.includes('EKSIK') || status.includes('KONTROL') || status.includes('WARNING')) {
    return {
      label: 'Eksik / Kontrol',
      color: YELLOW,
      bg: '#f59e0b18'
    }
  }

  if (count > 0) {
    return {
      label: 'Sağlıklı',
      color: GREEN,
      bg: '#10b98118'
    }
  }

  return {
    label: 'Veri Yok',
    color: RED,
    bg: '#ef444418'
  }
}

function getTopLevelTotalStocks(statusPayload, fallback) {
  return firstDefined(
    statusPayload?.toplamHisse,
    statusPayload?.ToplamHisse,
    statusPayload?.totalStocks,
    statusPayload?.TotalStocks,
    fallback
  )
}

function getTopLevelTotalRows(statusPayload, fallback) {
  return firstDefined(
    statusPayload?.toplamKayit,
    statusPayload?.ToplamKayit,
    statusPayload?.totalRows,
    statusPayload?.TotalRows,
    fallback
  )
}

export default function Admin() {
  const [stocksPayload, setStocksPayload] = useState([])
  const [statusPayload, setStatusPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncingAll, setSyncingAll] = useState(false)
  const [syncingId, setSyncingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [message, setMessage] = useState('')
  const [query, setQuery] = useState('')
  const [healthFilter, setHealthFilter] = useState('all')
  const [addingStock, setAddingStock] = useState(false)
  const [newStock, setNewStock] = useState({
    symbol: '',
    companyName: '',
    sector: ''
  })

  useEffect(() => {
    loadAdminData()
  }, [])

  async function loadAdminData() {
    setLoading(true)
    setMessage('')

    try {
      const [stocksRes, statusRes] = await Promise.allSettled([
        getStocks(),
        getDbStatus()
      ])

      if (stocksRes.status === 'fulfilled') {
        setStocksPayload(stocksRes.value.data)
      } else {
        setStocksPayload([])
      }

      if (statusRes.status === 'fulfilled') {
        setStatusPayload(statusRes.value.data)
      } else {
        setStatusPayload(null)
      }

      if (stocksRes.status === 'rejected' && statusRes.status === 'rejected') {
        setMessage('❌ Veri yönetimi bilgileri alınamadı.')
      }
    } catch (e) {
      setMessage('❌ Veri yönetimi bilgileri alınamadı: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddStock(e) {
    e.preventDefault()

    const payload = {
      symbol: newStock.symbol.trim(),
      companyName: newStock.companyName.trim(),
      sector: newStock.sector.trim()
    }

    if (!payload.symbol || !payload.companyName) {
      setMessage('❌ Sembol ve şirket adı zorunlu.')
      return
    }

    setAddingStock(true)
    setMessage(`⏳ ${payload.symbol} hisse kaydı ekleniyor...`)

    try {
      await addStock(payload)
      setMessage(`✅ ${payload.symbol} eklendi. İstersen şimdi Sync ile tarihsel verilerini çekebilirsin.`)
      setNewStock({ symbol: '', companyName: '', sector: '' })
      await loadAdminData()
    } catch (e) {
      const err = e.response?.data?.detail || e.response?.data || e.message
      setMessage('❌ Hisse ekleme hatası: ' + err)
    } finally {
      setAddingStock(false)
    }
  }

  async function handleSyncStock(row) {
    if (!row?.stockID) {
      setMessage('❌ Bu kayıt için StockID bulunamadı.')
      return
    }

    setSyncingId(row.stockID)
    setMessage(`⏳ ${row.symbol} verileri senkronize ediliyor...`)

    try {
      const res = await syncStock(row.stockID)
      const msg = res?.data?.message || res?.data?.mesaj || `${row.symbol} senkronizasyonu tamamlandı.`
      setMessage('✅ ' + msg)
      await loadAdminData()
    } catch (e) {
      const err = e.response?.data?.detail || e.response?.data || e.message
      setMessage('❌ Senkronizasyon hatası: ' + err)
    } finally {
      setSyncingId(null)
    }
  }


  async function handleDeleteStockData(row) {
    if (!row?.stockID) {
      setMessage('❌ Bu kayıt için StockID bulunamadı.')
      return
    }

    const ok = window.confirm(
      `${row.symbol} hissesine ait tüm tarihsel fiyat verileri silinsin mi?\n\nBu işlem hisse kaydını silmez, sadece HistoricalData kayıtlarını temizler. Daha sonra Sync ile tekrar yüklenebilir.`
    )

    if (!ok) return

    setDeletingId(row.stockID)
    setMessage(`⏳ ${row.symbol} tarihsel verileri siliniyor...`)

    try {
      const res = await deleteStockHistoricalData(row.stockID)
      const msg = res?.data?.mesaj || res?.data?.Mesaj || res?.data?.message || `${row.symbol} tarihsel verileri silindi.`
      setMessage('✅ ' + msg)
      await loadAdminData()
    } catch (e) {
      const err = e.response?.data?.detail || e.response?.data || e.message
      setMessage('❌ Silme hatası: ' + err)
    } finally {
      setDeletingId(null)
    }
  }

  async function handleSyncAll() {
    const ok = window.confirm('Tüm hisseler için veri senkronizasyonu başlatılsın mı? Bu işlem uzun sürebilir.')
    if (!ok) return

    setSyncingAll(true)
    setMessage('⏳ Tüm hisseler senkronize ediliyor...')

    try {
      const res = await syncAllStocks()
      const msg = res?.data?.message || res?.data?.mesaj || 'Toplu senkronizasyon tamamlandı.'
      setMessage('✅ ' + msg)
      await loadAdminData()
    } catch (e) {
      const err = e.response?.data?.detail || e.response?.data || e.message
      setMessage('❌ Toplu senkronizasyon hatası: ' + err)
    } finally {
      setSyncingAll(false)
    }
  }

  const rows = useMemo(() => buildRows(stocksPayload, statusPayload), [stocksPayload, statusPayload])

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()

    return rows.filter(row => {
      const h = getHealth(row)
      const matchesQuery =
        !q ||
        String(row.symbol || '').toLowerCase().includes(q) ||
        String(row.companyName || '').toLowerCase().includes(q) ||
        String(row.sector || '').toLowerCase().includes(q)

      const matchesHealth =
        healthFilter === 'all' ||
        (healthFilter === 'healthy' && h.label === 'Sağlıklı') ||
        (healthFilter === 'warning' && (h.label === 'Eksik / Kontrol' || h.label === 'Boşluk Var' || h.label === 'OHLC Eksik')) ||
        (healthFilter === 'empty' && h.label === 'Veri Yok')

      return matchesQuery && matchesHealth
    })
  }, [rows, query, healthFilter])

  const stats = useMemo(() => {
    const fallbackTotal = rows.length
    const healthy = rows.filter(r => getHealth(r).label === 'Sağlıklı').length
    const warning = rows.filter(r => {
      const label = getHealth(r).label
      return label === 'Eksik / Kontrol' || label === 'Boşluk Var' || label === 'OHLC Eksik'
    }).length
    const empty = rows.filter(r => getHealth(r).label === 'Veri Yok').length

    const fallbackRows = rows.reduce((acc, r) => acc + Number(r.rowCount || 0), 0)
    const ohlcMissing = firstDefined(
      statusPayload?.toplamOhlcEksik,
      statusPayload?.ToplamOhlcEksik,
      rows.reduce((acc, r) => acc + Number(r.ohlcMissingCount || 0), 0)
    )

    const dates = rows
      .map(r => r.lastDate)
      .filter(Boolean)
      .map(d => new Date(d))
      .filter(d => !Number.isNaN(d.getTime()))

    const lastDate = dates.length
      ? new Date(Math.max(...dates.map(d => d.getTime())))
      : null

    return {
      total: getTopLevelTotalStocks(statusPayload, fallbackTotal),
      healthy,
      warning,
      empty,
      totalRows: getTopLevelTotalRows(statusPayload, fallbackRows),
      ohlcMissing,
      lastDate
    }
  }, [rows, statusPayload])

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
      <Header />

      {message && (
        <div style={{
          background: '#111827',
          border: '1px solid #1f2937',
          borderRadius: '14px',
          padding: '13px 16px',
          marginBottom: '20px',
          color: '#d1d5db',
          boxShadow: '0 14px 32px rgba(0,0,0,0.18)'
        }}>
          {message}
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, minmax(130px, 1fr))',
        gap: '14px',
        marginBottom: '22px'
      }}>
        <StatCard label="Toplam Varlık" value={formatNumber(stats.total)} color={BLUE} icon="📦" />
        <StatCard label="Sağlıklı" value={formatNumber(stats.healthy)} color={GREEN} icon="✅" />
        <StatCard label="Kontrol" value={formatNumber(stats.warning)} color={YELLOW} icon="⚠️" />
        <StatCard label="Veri Yok" value={formatNumber(stats.empty)} color={RED} icon="⛔" />
        <StatCard label="Toplam Satır" value={formatNumber(stats.totalRows)} color={PURPLE} icon="🗄️" />
        <StatCard label="OHLC Eksik" value={formatNumber(stats.ohlcMissing)} color={stats.ohlcMissing > 0 ? YELLOW : GREEN} icon="🕯️" />
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
            <div style={{ color: '#6b7280', fontSize: '12px', marginBottom: 4 }}>
              Hisse Evreni
            </div>
            <h3 style={{ margin: 0, letterSpacing: '-0.4px' }}>
              ➕ Yeni Hisse Ekle
            </h3>
            <p style={{
              color: '#9ca3af',
              fontSize: '13px',
              marginTop: '7px',
              maxWidth: 700,
              lineHeight: 1.55
            }}>
              Yeni bir hisse kaydı oluşturur. Kayıt eklendikten sonra tablodaki Sync butonu ile tarihsel verileri çekilebilir.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleAddStock}
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(170px, 0.9fr) minmax(240px, 1.5fr) minmax(160px, 0.8fr) auto',
            gap: '12px',
            alignItems: 'center'
          }}
        >
          <input
            placeholder="Sembol (örn: THYAO.IS)"
            value={newStock.symbol}
            onChange={e => setNewStock(prev => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
            required
            disabled={addingStock}
            style={inputStyle}
          />

          <input
            placeholder="Şirket adı"
            value={newStock.companyName}
            onChange={e => setNewStock(prev => ({ ...prev, companyName: e.target.value }))}
            required
            disabled={addingStock}
            style={inputStyle}
          />

          <input
            placeholder="Sektör"
            value={newStock.sector}
            onChange={e => setNewStock(prev => ({ ...prev, sector: e.target.value }))}
            disabled={addingStock}
            style={inputStyle}
          />

          <button
            type="submit"
            disabled={addingStock}
            style={{
              ...primaryButton,
              opacity: addingStock ? 0.65 : 1,
              cursor: addingStock ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {addingStock ? 'Ekleniyor...' : 'Hisse Ekle'}
          </button>
        </form>
      </Panel>

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
            <div style={{ color: '#6b7280', fontSize: '12px', marginBottom: 4 }}>
              Veri Operasyonları
            </div>
            <h3 style={{ margin: 0, letterSpacing: '-0.4px' }}>
              Tarihsel Veri Yönetimi
            </h3>
            <p style={{
              color: '#9ca3af',
              fontSize: '13px',
              marginTop: '7px',
              maxWidth: 660,
              lineHeight: 1.55
            }}>
              Bu panel hisse listesini, tarihsel veri doluluğunu ve OHLCV senkronizasyon işlemlerini yönetir.
              AI motorunun sağlıklı çalışması için Open/High/Low/Close/Volume alanlarının eksiksiz olması gerekir.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={loadAdminData}
              disabled={loading || syncingAll}
              style={secondaryButton}
            >
              {loading ? 'Yenileniyor...' : '↻ Durumu Yenile'}
            </button>

            <button
              onClick={handleSyncAll}
              disabled={loading || syncingAll}
              style={{
                ...primaryButton,
                opacity: loading || syncingAll ? 0.65 : 1,
                cursor: loading || syncingAll ? 'not-allowed' : 'pointer'
              }}
            >
              {syncingAll ? '⏳ Toplu Sync...' : '🚀 Tümünü Senkronize Et'}
            </button>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(240px, 1fr) auto',
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
            value={healthFilter}
            setValue={setHealthFilter}
            options={[
              ['all', 'Tümü'],
              ['healthy', 'Sağlıklı'],
              ['warning', 'Kontrol'],
              ['empty', 'Veri Yok']
            ]}
          />
        </div>

        {loading ? (
          <LoadingState />
        ) : filteredRows.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '14px'
            }}>
              <thead>
                <tr style={{
                  borderBottom: '1px solid #1f2937',
                  color: '#9ca3af',
                  textAlign: 'left'
                }}>
                  <th style={th}>Hisse</th>
                  <th style={th}>Şirket</th>
                  <th style={th}>Sektör</th>
                  <th style={th}>Satır</th>
                  <th style={th}>OHLC</th>
                  <th style={th}>İlk Tarih</th>
                  <th style={th}>Son Tarih</th>
                  <th style={th}>Durum</th>
                  <th style={{ ...th, textAlign: 'right' }}>İşlem</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.map(row => {
                  const h = getHealth(row)
                  const isSyncing = syncingId === row.stockID
                  const isDeleting = deletingId === row.stockID

                  return (
                    <tr
                      key={`${row.stockID}-${row.symbol}`}
                      style={{
                        borderBottom: '1px solid #1f2937',
                        color: '#d1d5db'
                      }}
                    >
                      <td style={td}>
                        <div style={{ fontWeight: 'bold', color: '#f9fafb' }}>
                          {row.symbol || '-'}
                        </div>
                        <div style={{ color: '#6b7280', fontSize: '12px' }}>
                          ID: {row.stockID ?? '-'}
                        </div>
                      </td>

                      <td style={td}>{row.companyName || '-'}</td>
                      <td style={td}>{row.sector || '-'}</td>
                      <td style={td}>{formatNumber(row.rowCount)}</td>
                      <td style={td}>
                        <div style={{ fontWeight: 'bold', color: Number(row.ohlcMissingCount || 0) > 0 ? YELLOW : GREEN }}>
                          {row.ohlcCompletenessPct !== undefined && row.ohlcCompletenessPct !== null
                            ? formatPercent(row.ohlcCompletenessPct)
                            : Number(row.rowCount || 0) > 0 ? 'Eski şema' : '-'}
                        </div>
                        {Number(row.ohlcMissingCount || 0) > 0 && (
                          <div style={{ color: '#9ca3af', fontSize: '12px' }}>
                            Eksik: {formatNumber(row.ohlcMissingCount)}
                          </div>
                        )}
                      </td>
                      <td style={td}>{formatDate(row.firstDate)}</td>
                      <td style={td}>{formatDate(row.lastDate)}</td>

                      <td style={td}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          color: h.color,
                          background: h.bg,
                          border: `1px solid ${h.color}44`,
                          borderRadius: '999px',
                          padding: '5px 9px',
                          fontSize: '12px',
                          fontWeight: 'bold'
                        }}>
                          <span style={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: h.color
                          }} />
                          {h.label}
                        </span>
                      </td>

                      <td style={{ ...td, textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => handleSyncStock(row)}
                            disabled={syncingAll || isSyncing || isDeleting}
                            style={{
                              ...smallButton,
                              opacity: syncingAll || isSyncing || isDeleting ? 0.65 : 1,
                              cursor: syncingAll || isSyncing || isDeleting ? 'not-allowed' : 'pointer'
                            }}
                          >
                            {isSyncing ? 'Sync...' : 'Sync'}
                          </button>

                          <button
                            onClick={() => handleDeleteStockData(row)}
                            disabled={syncingAll || isSyncing || isDeleting || Number(row.rowCount || 0) === 0}
                            style={{
                              ...dangerSmallButton,
                              opacity: syncingAll || isSyncing || isDeleting || Number(row.rowCount || 0) === 0 ? 0.55 : 1,
                              cursor: syncingAll || isSyncing || isDeleting || Number(row.rowCount || 0) === 0 ? 'not-allowed' : 'pointer'
                            }}
                          >
                            {isDeleting ? 'Siliniyor...' : 'Veriyi Sil'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState />
        )}
      </Panel>

      <Panel>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '16px'
        }}>
          <InfoBlock
            icon="🧠"
            title="AI Motor Bağımlılığı"
            text="Pusula AI tahminleri tarihsel fiyat, hacim ve dış piyasa verileriyle çalışır. Eksik veri modelin güven seviyesini düşürebilir."
          />

          <InfoBlock
            icon="🕒"
            title="Son Veri Tarihi"
            text={`En güncel kayıt: ${stats.lastDate ? formatDate(stats.lastDate) : 'henüz bulunamadı'}.`}
          />

          <InfoBlock
            icon="⚠️"
            title="Operasyon Notu"
            text="Toplu senkronizasyon uzun sürebilir. Demo öncesinde tekil problemli hisseleri senkronize etmek daha güvenlidir."
          />
        </div>
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
        color: '#6b7280',
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
        Pusula AI · Veri Yönetimi
      </div>

      <h2 style={{
        margin: 0,
        letterSpacing: '-0.8px',
        fontSize: '31px'
      }}>
        🗄️ Veri Yönetimi
      </h2>

      <p style={{
        color: '#9ca3af',
        marginTop: '9px',
        maxWidth: '780px',
        lineHeight: 1.6
      }}>
        Hisse evrenini, tarihsel veri kapsamını ve senkronizasyon işlemlerini yönetin.
        Sağlıklı model çıktısı, temiz ve güncel veriden başlar.
      </p>
    </div>
  )
}

function StatCard({ label, value, color, icon }) {
  return (
    <div style={{
      background: 'linear-gradient(180deg, #111827 0%, #0b1220 100%)',
      border: '1px solid #1f2937',
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

      <div style={{ color: '#6b7280', fontSize: '12px', marginBottom: '8px' }}>
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
      background: 'linear-gradient(180deg, #111827 0%, #0f172a 100%)',
      border: '1px solid #1f2937',
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
      background: '#0b1220',
      padding: '4px',
      borderRadius: '13px',
      border: '1px solid #1f2937',
      flexWrap: 'wrap',
      gap: '3px'
    }}>
      {options.map(([key, label]) => (
        <button
          key={key}
          onClick={() => setValue(key)}
          style={{
            padding: '8px 11px',
            background: value === key ? '#2563eb' : 'transparent',
            color: value === key ? '#fff' : '#9ca3af',
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
      minHeight: 220,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#9ca3af',
      textAlign: 'center'
    }}>
      <div>
        <div style={{ fontSize: 38, marginBottom: 12 }}>⏳</div>
        <h3 style={{ margin: 0, color: '#e5e7eb' }}>Veri durumu yükleniyor</h3>
        <p style={{ marginTop: 8 }}>Stok listesi ve tarihsel veri durumu okunuyor...</p>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{
      minHeight: 220,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#9ca3af',
      textAlign: 'center'
    }}>
      <div>
        <div style={{ fontSize: 38, marginBottom: 12 }}>🔎</div>
        <h3 style={{ margin: 0, color: '#e5e7eb' }}>Kayıt bulunamadı</h3>
        <p style={{ marginTop: 8 }}>Arama veya filtre kriterlerini değiştirerek tekrar deneyin.</p>
      </div>
    </div>
  )
}

function InfoBlock({ icon, title, text }) {
  return (
    <div style={{
      background: '#0b1220',
      border: '1px solid #1f2937',
      borderRadius: '16px',
      padding: '16px'
    }}>
      <div style={{ fontSize: 24, marginBottom: 10 }}>{icon}</div>
      <h4 style={{ margin: '0 0 7px', color: '#e5e7eb' }}>{title}</h4>
      <p style={{ margin: 0, color: '#9ca3af', fontSize: '13px', lineHeight: 1.55 }}>
        {text}
      </p>
    </div>
  )
}

const inputStyle = {
  width: '100%',
  padding: '13px 16px',
  background: '#0b1220',
  border: '1px solid #1f2937',
  borderRadius: '13px',
  color: '#fff',
  fontSize: '14px',
  outline: 'none'
}

const primaryButton = {
  padding: '12px 18px',
  color: '#fff',
  border: 'none',
  borderRadius: '13px',
  fontWeight: 'bold',
  fontSize: '14px',
  background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
  boxShadow: '0 14px 28px rgba(37,99,235,0.24)'
}

const secondaryButton = {
  padding: '12px 16px',
  color: '#d1d5db',
  border: '1px solid #1f2937',
  borderRadius: '13px',
  fontWeight: 'bold',
  fontSize: '14px',
  background: '#0b1220',
  cursor: 'pointer'
}

const smallButton = {
  padding: '8px 12px',
  color: '#fff',
  border: '1px solid #2563eb55',
  borderRadius: '10px',
  background: '#2563eb',
  fontWeight: 'bold',
  fontSize: '12px'
}


const dangerSmallButton = {
  padding: '8px 12px',
  color: '#fecaca',
  border: '1px solid #ef444455',
  borderRadius: '10px',
  background: '#ef444418',
  fontWeight: 'bold',
  fontSize: '12px'
}

const th = {
  padding: '10px 12px',
  fontWeight: 'normal',
  whiteSpace: 'nowrap'
}

const td = {
  padding: '12px',
  whiteSpace: 'nowrap'
}