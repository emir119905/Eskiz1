import { useState, useEffect } from 'react'
import { getDbStatus, syncStock, syncAllStocks, addStock } from '../api/client'

// Küçük yardımcı: renkli durum etiketi
function StatusBadge({ durum }) {
  const color = durum === 'SAĞLIKLI' ? '#10b981' : durum === 'BOŞLUK VAR' ? '#f59e0b' : '#ef4444'
  return (
    <span style={{
      background: color + '22', color, border: `1px solid ${color}`,
      borderRadius: '4px', padding: '2px 8px', fontSize: '12px', fontWeight: 'bold'
    }}>
      {durum}
    </span>
  )
}

export default function Admin() {
  const [status, setStatus]     = useState(null)
  const [loading, setLoading]   = useState(true)
  const [syncing, setSyncing]   = useState(false)
  const [message, setMessage]   = useState('')

  // Yeni hisse ekleme formu
  const [newStock, setNewStock] = useState({ symbol: '', companyName: '', sector: '' })

  // Sayfa açılınca veritabanı durumunu çek
  useEffect(() => { fetchStatus() }, [])

  async function fetchStatus() {
    try {
      setLoading(true)
      const res = await getDbStatus()
      setStatus(res.data)
    } catch (e) {
      setMessage('❌ Durum alınamadı: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSyncAll() {
    setSyncing(true)
    setMessage('⏳ Tüm hisseler sync ediliyor...')
    try {
      const res = await syncAllStocks()
      const toplam = res.data.reduce((acc, r) => acc + (r.yeniKayit || 0), 0)
      setMessage(`✅ Sync tamamlandı. Toplam ${toplam} yeni kayıt eklendi.`)
      fetchStatus()
    } catch (e) {
      setMessage('❌ Sync hatası: ' + e.message)
    } finally {
      setSyncing(false)
    }
  }

  async function handleSyncOne(stockId, symbol) {
    setMessage(`⏳ ${symbol} sync ediliyor...`)
    try {
      const res = await syncStock(stockId)
      setMessage(`✅ ${res.data}`)
      fetchStatus()
    } catch (e) {
      setMessage('❌ ' + e.message)
    }
  }

  async function handleAddStock(e) {
    e.preventDefault()
    try {
      await addStock(newStock)
      setMessage(`✅ ${newStock.symbol} eklendi. Şimdi sync yapabilirsin.`)
      setNewStock({ symbol: '', companyName: '', sector: '' })
      fetchStatus()
    } catch (e) {
      setMessage('❌ ' + (e.response?.data || e.message))
    }
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '24px' }}>🛠️ Admin Paneli</h2>

      {/* Mesaj kutusu */}
      {message && (
        <div style={{
          background: '#1e1e1e', border: '1px solid #333',
          borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', color: '#aaa'
        }}>
          {message}
        </div>
      )}

      {/* Yeni Hisse Ekle (EN ÜSTE TAŞINDI) */}
      <div style={{ background: '#1a1a1a', borderRadius: '10px', padding: '20px', marginBottom: '24px' }}>
        <h3 style={{ marginBottom: '16px' }}>➕ Yeni Hisse Ekle</h3>
        <form onSubmit={handleAddStock} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <input
            placeholder="Sembol (örn: THYAO.IS)"
            value={newStock.symbol}
            onChange={e => setNewStock({ ...newStock, symbol: e.target.value })}
            required
            style={inputStyle}
          />
          <input
            placeholder="Şirket Adı"
            value={newStock.companyName}
            onChange={e => setNewStock({ ...newStock, companyName: e.target.value })}
            required
            style={{ ...inputStyle, flex: 2 }}
          />
          <input
            placeholder="Sektör"
            value={newStock.sector}
            onChange={e => setNewStock({ ...newStock, sector: e.target.value })}
            style={inputStyle}
          />
          <button type="submit" style={btnStyle('#3b82f6')}>Ekle</button>
        </form>
      </div>

      {/* Veritabanı Durumu & Kaydırılabilir Tablo */}
      <div style={{ background: '#1a1a1a', borderRadius: '10px', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3>📊 Veritabanı Durumu</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={fetchStatus} style={btnStyle('#333')}>🔄 Yenile</button>
            <button onClick={handleSyncAll} disabled={syncing} style={btnStyle('#3b82f6')}>
              {syncing ? '⏳ Sync...' : '⚡ Tümünü Sync Et'}
            </button>
          </div>
        </div>

        {loading ? (
          <p style={{ color: '#666' }}>Yükleniyor...</p>
        ) : status ? (
          <>
            <div style={{ display: 'flex', gap: '24px', marginBottom: '16px' }}>
              <Stat label="Toplam Hisse" value={status.toplamHisse} />
              <Stat label="Toplam Kayıt" value={status.toplamKayit.toLocaleString('tr-TR')} />
            </div>

            {/* KAYDIRILABİLİR KUTU BURASI */}
            <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #222', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#222', zIndex: 1 }}>
                  <tr style={{ borderBottom: '1px solid #333', color: '#888', textAlign: 'left' }}>
                    <th style={th}>Sembol</th>
                    <th style={th}>Durum</th>
                    <th style={th}>Kayıt</th>
                    <th style={th}>İlk Tarih</th>
                    <th style={th}>Son Tarih</th>
                    <th style={th}>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {status.hisseDurumlari.map(h => (
                    <tr key={h.stockID} style={{ borderBottom: '1px solid #222' }}>
                      <td style={td}><strong>{h.symbol}</strong></td>
                      <td style={td}><StatusBadge durum={h.durum} /></td>
                      <td style={td}>{h.kayitSayisi.toLocaleString('tr-TR')}</td>
                      <td style={td}>{h.ilkTarih ? new Date(h.ilkTarih).toLocaleDateString('tr-TR') : '-'}</td>
                      <td style={td}>{h.sonTarih ? new Date(h.sonTarih).toLocaleDateString('tr-TR') : '-'}</td>
                      <td style={td}>
                        <button
                          onClick={() => handleSyncOne(h.stockID, h.symbol)}
                          style={btnStyle('#10b981', '12px')}
                        >
                          Sync
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

// Küçük istatistik kutusu
function Stat({ label, value }) {
  return (
    <div style={{ background: '#111', borderRadius: '8px', padding: '12px 20px', minWidth: '120px' }}>
      <div style={{ color: '#888', fontSize: '12px' }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#3b82f6' }}>{value}</div>
    </div>
  )
}

// Stil yardımcıları
const th = { padding: '12px', fontWeight: 'normal' }
const td = { padding: '10px 12px' }
const inputStyle = {
  flex: 1, minWidth: '150px', padding: '10px 12px',
  background: '#111', border: '1px solid #333', borderRadius: '6px',
  color: '#fff', fontSize: '14px', outline: 'none'
}
function btnStyle(bg, fontSize = '14px') {
  return {
    padding: '8px 16px', background: bg, color: '#fff',
    border: 'none', borderRadius: '6px', cursor: 'pointer',
    fontSize, fontWeight: 'bold', whiteSpace: 'nowrap'
  }
}