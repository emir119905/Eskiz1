import { useEffect, useMemo, useState } from 'react'
import {
  getZetaBacktestSummary,
  getZetaLatestRadar,
  getZetaScenarioReport
} from '../api/client'

const BLUE = '#3b82f6'
const GREEN = '#10b981'
const YELLOW = '#f59e0b'
const PURPLE = '#8b5cf6'
const RED = '#ef4444'
const ORANGE = '#f97316'
const CYAN = '#06b6d4'

const PROJECT_NAME = 'Pusula AI'
const ENGINE_NAME = 'Zeta Radar'
const SUBTITLE = 'BIST Scenario Screener'

const TAG_LABELS = {
  BREAKOUT_PRESSURE: 'kırılım baskısı',
  POSITIVE_MOMENTUM: 'pozitif momentum',
  RELATIVE_STRENGTH: 'göreli güç',
  UP_PROBABILITY_SUPPORT: 'model yukarı olasılığını destekliyor',
  CONTROLLED_VOLATILITY: 'kontrollü oynaklık',
  LOWER_WICK_SUPPORT: 'alt fitil desteği',
  LOW_RANGE_POSITION: 'bant dibine yakın konum',
  RECOVERY_CLOSE: 'gün içi toparlanma',
  DOWN_PROBABILITY_PRESSURE: 'aşağı olasılık baskısı',
  NEGATIVE_MOMENTUM: 'negatif momentum',
  RELATIVE_WEAKNESS: 'göreli zayıflık',
  WEAK_CLOSE: 'zayıf kapanış',
  HIGH_FLAT_RISK: 'yön belirsizliği yüksek',
  FALLING_KNIFE_RISK: 'falling knife riski',
  MEDIUM_FALLING_KNIFE_RISK: 'orta seviye falling knife riski',
  HIGH_VOLUME_WEAK_CLOSE: 'yüksek hacimli zayıf kapanış',
  ELEVATED_VOLATILITY: 'oynaklık artışı',
  NO_CLEAR_EDGE: 'net avantaj yok'
}

const SCENARIO_META = {
  MOMENTUM_LONG: {
    label: 'Momentum Long',
    shortLabel: 'Momentum',
    color: BLUE,
    icon: '🚀',
    description: 'Güçlü trendin devam etme ihtimali izlenir.'
  },
  DIP_REBOUND_WATCH: {
    label: 'Dipten Tepki',
    shortLabel: 'Dip Tepki',
    color: GREEN,
    icon: '🟢',
    description: 'Düşüş sonrası kontrollü tepki ihtimali izlenir.'
  },
  DOWNSIDE_RISK: {
    label: 'Aşağı Risk',
    shortLabel: 'Risk',
    color: RED,
    icon: '⚠️',
    description: 'Aşağı baskı veya uzak dur sinyali izlenir.'
  },
  RISK_WATCH: {
    label: 'Risk İzleme',
    shortLabel: 'Risk Watch',
    color: ORANGE,
    icon: '👁️',
    description: 'Net işlem sinyali yoktur; kırılgan veya belirsiz yapı izlenir.'
  },
  NEUTRAL: {
    label: 'Nötr',
    shortLabel: 'Nötr',
    color: '#94a3b8',
    icon: '⚪',
    description: 'Model belirgin avantaj görmez.'
  }
}

const TABS = [
  { key: 'momentum', label: 'Momentum', color: BLUE },
  { key: 'dip', label: 'Dipten Tepki', color: GREEN },
  { key: 'risk', label: 'Risk İzleme', color: ORANGE },
  { key: 'neutral', label: 'Nötr', color: '#94a3b8' }
]

export default function Reports() {
  const [latestRadar, setLatestRadar] = useState(null)
  const [backtestSummary, setBacktestSummary] = useState(null)
  const [scenarioReport, setScenarioReport] = useState(null)
  const [activeTab, setActiveTab] = useState('momentum')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = async () => {
    setLoading(true)
    setError('')

    try {
      const [latestRes, backtestRes, reportRes] = await Promise.all([
        getZetaLatestRadar(),
        getZetaBacktestSummary(),
        getZetaScenarioReport()
      ])

      setLatestRadar(latestRes.data)
      setBacktestSummary(backtestRes.data)
      setScenarioReport(reportRes.data)
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || 'Zeta verileri alınamadı.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const radar = latestRadar?.radars || {}
  const summary = latestRadar?.summary || {}
  const modelInfo = scenarioReport || {}

  const riskItems = useMemo(() => {
    return [
      ...(radar.downsideRisk || []),
      ...(radar.riskWatch || [])
    ]
  }, [radar.downsideRisk, radar.riskWatch])

  const activeItems = useMemo(() => {
    if (activeTab === 'momentum') return radar.momentumLong || []
    if (activeTab === 'dip') return radar.dipRebound || []
    if (activeTab === 'risk') return riskItems
    if (activeTab === 'neutral') return radar.neutral || []
    return []
  }, [activeTab, radar, riskItems])

  const riskWatchCount = summary.riskWatchCount ?? (radar.riskWatch?.length || 0)

  return (
    <div style={{ maxWidth: '1320px', margin: '0 auto' }}>
      <Header
        latestRadar={latestRadar}
        scenarioReport={scenarioReport}
        loading={loading}
        onRefresh={loadData}
      />

      {error && (
        <Panel borderColor={RED}>
          <div style={{ color: RED, fontWeight: 'bold', marginBottom: 6 }}>
            Zeta verisi okunamadı
          </div>
          <div style={{ color: '#d1d5db', fontSize: 13, lineHeight: 1.6 }}>
            {error}
          </div>
        </Panel>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, minmax(150px, 1fr))',
        gap: '14px',
        marginBottom: '22px'
      }}>
        <StatCard label="Momentum" value={summary.momentumLongCount ?? '-'} color={BLUE} icon="🚀" />
        <StatCard label="Dipten Tepki" value={summary.dipReboundCount ?? '-'} color={GREEN} icon="🟢" />
        <StatCard label="Aşağı Risk" value={summary.downsideRiskCount ?? '-'} color={RED} icon="⚠️" />
        <StatCard label="Risk İzleme" value={riskWatchCount} color={ORANGE} icon="👁️" />
        <StatCard label="Nötr" value={summary.neutralCount ?? '-'} color="#94a3b8" icon="⚪" />
      </div>

      <Panel>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.05fr 0.95fr',
          gap: '22px',
          alignItems: 'start'
        }}>
          <div>
            <Eyebrow>Bugünkü radar yorumu</Eyebrow>
            <h3 style={h3}>BIST senaryo taraması</h3>
            <p style={p}>
              Zeta Radar, hisseleri tek bir iyi/kötü kararına sıkıştırmak yerine farklı piyasa senaryolarına göre
              sınıflandırır. Momentum listesi trend devamını, dipten tepki listesi kontrollü toparlanmayı,
              risk izleme listesi ise belirsiz veya kırılgan yapıları takip eder.
            </p>
            <MarketComment summary={summary} riskWatchCount={riskWatchCount} />
          </div>

          <MetaGrid latestRadar={latestRadar} scenarioReport={scenarioReport} />
        </div>
      </Panel>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 360px',
        gap: '22px',
        alignItems: 'start'
      }}>
        <div>
          <Panel>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 18,
              flexWrap: 'wrap'
            }}>
              <div>
                <Eyebrow>Zeta radar listeleri</Eyebrow>
                <h3 style={h3}>Senaryo adayları</h3>
              </div>

              <TabBar activeTab={activeTab} setActiveTab={setActiveTab} />
            </div>

            {loading ? (
              <EmptyState title="Veriler yükleniyor" text="Zeta çıktı dosyaları backend üzerinden okunuyor." />
            ) : activeItems.length === 0 ? (
              <EmptyState
                title="Bu senaryoda aktif aday yok"
                text={activeTab === 'risk'
                  ? 'Bugün aktif aşağı risk veya risk izleme adayı oluşmamış görünüyor.'
                  : 'Seçili senaryo için radar listesi boş.'}
              />
            ) : (
              <div style={{ display: 'grid', gap: '14px' }}>
                {activeItems.map(item => (
                  <RadarCard key={`${item.scenario}-${item.symbol}`} item={item} />
                ))}
              </div>
            )}
          </Panel>

          <BacktestSection backtestSummary={backtestSummary} />
        </div>

        <div>
          <Panel>
            <Eyebrow>Model ve veri özeti</Eyebrow>
            <h3 style={h3}>Çalışma bilgisi</h3>

            <InfoRow label="Seçilen model" value={formatModelName(modelInfo.selectedModel)} />
            <InfoRow label="Sembol sayısı" value={modelInfo.dataset?.symbols ?? '-'} />
            <InfoRow label="Panel satırı" value={formatInt(modelInfo.dataset?.panelRows)} />
            <InfoRow label="Feature sayısı" value={modelInfo.featureCount ?? '-'} />
            <InfoRow label="Test başlangıcı" value={modelInfo.testStart || '-'} />
            <InfoRow label="Ufuk" value={`${modelInfo.horizon || 10} işlem günü`} />

            <div style={{
              marginTop: 16,
              paddingTop: 16,
              borderTop: '1px solid #1f2937'
            }}>
              <Eyebrow>Konumlandırma</Eyebrow>
              <p style={{ ...p, marginTop: 8 }}>
                Bu ekran yatırım tavsiyesi üretmez. Amaç, modelin BIST evrenini hangi senaryolarda izlemeye değer
                gördüğünü ve bu senaryoların geçmiş test davranışını şeffaf biçimde göstermektir.
              </p>
            </div>
          </Panel>

          <Panel>
            <Eyebrow>Veri mimarisi</Eyebrow>
            <h3 style={h3}>Kullanılan katmanlar</h3>

            <MiniArchitecture />
          </Panel>
        </div>
      </div>
    </div>
  )
}

function Header({ latestRadar, scenarioReport, loading, onRefresh }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap'
      }}>
        <div>
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
              background: GREEN,
              boxShadow: `0 0 18px ${GREEN}`
            }} />
            {PROJECT_NAME} · Deneysel radar brifingi
          </div>

          <h2 style={{
            margin: 0,
            letterSpacing: '-0.8px',
            fontSize: '32px'
          }}>
            🧭 {ENGINE_NAME}
          </h2>

          <p style={{
            color: '#9ca3af',
            marginTop: '9px',
            maxWidth: '860px',
            lineHeight: 1.6
          }}>
            {SUBTITLE}; BIST hisselerini momentum, dipten tepki, aşağı risk ve nötr senaryolarına ayıran
            deneysel karar destek ekranıdır.
          </p>
        </div>

        <button
          onClick={onRefresh}
          disabled={loading}
          style={{
            border: '1px solid #2563eb66',
            background: loading
              ? '#0b1220'
              : 'linear-gradient(135deg, rgba(37,99,235,0.94), rgba(124,58,237,0.86))',
            color: '#fff',
            borderRadius: '14px',
            padding: '10px 14px',
            fontWeight: 'bold',
            cursor: loading ? 'default' : 'pointer',
            boxShadow: loading ? 'none' : '0 14px 26px rgba(37,99,235,0.18)'
          }}
        >
          {loading ? 'Yükleniyor...' : 'Veriyi Yenile'}
        </button>
      </div>

      <div style={{
        display: 'flex',
        gap: '10px',
        flexWrap: 'wrap',
        marginTop: 16
      }}>
        <Pill color={BLUE} label="Tarih" value={latestRadar?.date || '-'} />
        <Pill color={GREEN} label="Evren" value={latestRadar?.universe || 'BIST'} />
        <Pill color={YELLOW} label="Taranan" value={latestRadar?.totalStocks ?? '-'} />
        <Pill color={PURPLE} label="Model" value={formatModelName(scenarioReport?.selectedModel)} />
      </div>
    </div>
  )
}

function MarketComment({ summary, riskWatchCount }) {
  const momentum = Number(summary.momentumLongCount || 0)
  const dip = Number(summary.dipReboundCount || 0)
  const downside = Number(summary.downsideRiskCount || 0)
  const neutral = Number(summary.neutralCount || 0)

  let text = 'Bugünkü radar dengeli bir dağılım gösteriyor.'

  if (momentum > dip && momentum > downside) {
    text = 'Bugünkü radar momentum tarafında daha aktif. Sistem, trend devamı izlenebilecek adayları öne çıkarıyor.'
  }

  if (dip > momentum && dip > downside) {
    text = 'Bugünkü radar dipten tepki tarafında daha aktif. Sistem, düşüş sonrası kontrollü toparlanma ihtimali olan adayları izliyor.'
  }

  if (downside > 0) {
    text = 'Bugünkü radar aşağı risk tarafında aktif sinyaller üretiyor. Bu liste alım fırsatı değil, temkin filtresi olarak yorumlanmalıdır.'
  }

  if (momentum === 0 && dip === 0 && downside === 0 && riskWatchCount > 0) {
    text = 'Bugün aktif fırsat sinyali sınırlı. Sistem daha çok kırılgan veya kararsız yapıları risk izleme listesinde topluyor.'
  }

  return (
    <div style={{
      background: '#0b1220',
      border: '1px solid #1f2937',
      borderRadius: '16px',
      padding: '14px',
      marginTop: 14,
      color: '#d1d5db',
      fontSize: 13,
      lineHeight: 1.6
    }}>
      {text} Nötr sayısı {neutral}, risk izleme sayısı {riskWatchCount}.
    </div>
  )
}

function MetaGrid({ latestRadar, scenarioReport }) {
  const items = [
    ['Radar tarihi', latestRadar?.date || '-'],
    ['Evren', latestRadar?.universe || 'BIST'],
    ['Taranan hisse', latestRadar?.totalStocks ?? '-'],
    ['Model', formatModelName(scenarioReport?.selectedModel)],
    ['Feature', scenarioReport?.featureCount ?? '-'],
    ['Ufuk', `${scenarioReport?.horizon || 10} gün`]
  ]

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(120px, 1fr))',
      gap: '10px'
    }}>
      {items.map(([label, value]) => (
        <div
          key={label}
          style={{
            background: '#0b1220',
            border: '1px solid #1f2937',
            borderRadius: '16px',
            padding: '13px'
          }}
        >
          <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 6 }}>{label}</div>
          <div style={{ color: '#e5e7eb', fontWeight: 'bold', fontSize: 15 }}>{value}</div>
        </div>
      ))}
    </div>
  )
}

function TabBar({ activeTab, setActiveTab }) {
  return (
    <div style={{
      display: 'inline-flex',
      background: '#0b1220',
      border: '1px solid #1f2937',
      borderRadius: '16px',
      padding: '4px',
      gap: '4px'
    }}>
      {TABS.map(tab => {
        const active = activeTab === tab.key

        return (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              border: 'none',
              borderRadius: '12px',
              padding: '8px 11px',
              background: active ? `${tab.color}22` : 'transparent',
              color: active ? tab.color : '#9ca3af',
              fontWeight: active ? 'bold' : 600,
              cursor: 'pointer'
            }}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

function RadarCard({ item }) {
  const scenario = item.scenario === 'RISK_WATCH'
    ? 'RISK_WATCH'
    : item.scenario

  const meta = SCENARIO_META[scenario] || SCENARIO_META.NEUTRAL
  const probabilities = item.modelProbabilities || {}

  return (
    <div style={{
      background: '#0b1220',
      border: `1px solid ${meta.color}44`,
      borderRadius: '18px',
      padding: '16px',
      boxShadow: `0 16px 30px ${meta.color}10`
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 14,
        alignItems: 'flex-start',
        marginBottom: 12
      }}>
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            marginBottom: 6
          }}>
            <span style={{ fontSize: 18 }}>{meta.icon}</span>
            <strong style={{ color: '#f9fafb', fontSize: 17 }}>
              {item.symbol}
            </strong>
            {item.originalScenario && (
              <span style={{
                color: '#94a3b8',
                fontSize: 11,
                border: '1px solid #334155',
                borderRadius: 999,
                padding: '3px 7px'
              }}>
                {scenarioName(item.originalScenario)}
              </span>
            )}
          </div>

          <div style={{ color: meta.color, fontWeight: 'bold', fontSize: 13 }}>
            {meta.label}
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 4 }}>Skor</div>
          <div style={{ color: meta.color, fontWeight: 'bold', fontSize: 24 }}>
            {formatNumber(item.score)}
          </div>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(90px, 1fr))',
        gap: 10,
        marginBottom: 14
      }}>
        <MiniMetric label="Güven" value={formatNumber(item.confidence)} color={CYAN} />
        <MiniMetric label="Kapanış" value={formatPrice(item.closePrice)} color="#e5e7eb" />
        <MiniMetric label="Flat Risk" value={formatNumber(item.scores?.flatRisk)} color={YELLOW} />
      </div>

      <ProbabilityRow probabilities={probabilities} />

      <ScoreGrid scores={item.scores} />

      <TagList title="Nedenler" tags={item.reasonTags} color={meta.color} />
      <TagList title="Uyarılar" tags={item.warningTags} color={YELLOW} />
    </div>
  )
}

function ProbabilityRow({ probabilities }) {
  const down = Number(probabilities.down || 0)
  const flat = Number(probabilities.flat || 0)
  const up = Number(probabilities.up || 0)

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        color: '#6b7280',
        fontSize: 12,
        marginBottom: 7
      }}>
        <span>Model olasılıkları</span>
        <span>Down / Flat / Up</span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: `${Math.max(down, 0.04)}fr ${Math.max(flat, 0.04)}fr ${Math.max(up, 0.04)}fr`,
        height: 9,
        overflow: 'hidden',
        borderRadius: 999,
        background: '#111827',
        border: '1px solid #1f2937'
      }}>
        <div style={{ background: RED }} />
        <div style={{ background: '#64748b' }} />
        <div style={{ background: GREEN }} />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8,
        marginTop: 7,
        fontSize: 12
      }}>
        <span style={{ color: RED }}>↓ {formatPct(down)}</span>
        <span style={{ color: '#94a3b8', textAlign: 'center' }}>→ {formatPct(flat)}</span>
        <span style={{ color: GREEN, textAlign: 'right' }}>↑ {formatPct(up)}</span>
      </div>
    </div>
  )
}

function ScoreGrid({ scores = {} }) {
  const rows = [
    ['Momentum', scores.momentumLong, BLUE],
    ['Dip Tepki', scores.dipRebound, GREEN],
    ['Aşağı Risk', scores.downsideRisk, RED],
    ['Falling Knife', scores.fallingKnifeRisk, ORANGE]
  ]

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, minmax(90px, 1fr))',
      gap: 8,
      marginBottom: 13
    }}>
      {rows.map(([label, value, color]) => (
        <div
          key={label}
          style={{
            background: '#111827',
            border: '1px solid #1f2937',
            borderRadius: 12,
            padding: '9px'
          }}
        >
          <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 4 }}>{label}</div>
          <div style={{ color, fontWeight: 'bold' }}>{formatNumber(value)}</div>
        </div>
      ))}
    </div>
  )
}

function TagList({ title, tags = [], color }) {
  if (!tags || tags.length === 0) return null

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 7 }}>{title}</div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {tags.map(tag => (
          <span
            key={`${title}-${tag}`}
            style={{
              color,
              background: `${color}14`,
              border: `1px solid ${color}44`,
              borderRadius: 999,
              padding: '5px 8px',
              fontSize: 11,
              fontWeight: 700
            }}
          >
            {TAG_LABELS[tag] || tag.toLowerCase().replaceAll('_', ' ')}
          </span>
        ))}
      </div>
    </div>
  )
}

function BacktestSection({ backtestSummary }) {
  const summary = backtestSummary?.summary || {}

  return (
    <Panel>
      <Eyebrow>Geçmiş test özeti</Eyebrow>
      <h3 style={h3}>Senaryo kalite göstergeleri</h3>
      <p style={p}>
        Bu bölüm, radar senaryolarının 2024 sonrası test dönemindeki davranışını özetler. Momentum ve dip listeleri
        izlenebilir fırsat kalitesini, downside risk ise uzak dur filtresi olarak ayrışmayı gösterir.
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))',
        gap: '14px',
        marginTop: 16
      }}>
        <BacktestCard
          title="Momentum Long"
          color={BLUE}
          data={summary.momentumLong}
          interpretation="Evrene göre hafif pozitif ayrışan trend devamı senaryosu."
        />

        <BacktestCard
          title="Dipten Tepki"
          color={GREEN}
          data={summary.dipRebound}
          interpretation="Kapanış getirisi sınıra yakın; reward/risk oranı güçlü."
        />

        <BacktestCard
          title="Downside Risk"
          color={RED}
          data={summary.downsideRisk}
          inverse
          interpretation="Uzak dur filtresi olarak en belirgin ayrışmayı üretiyor."
        />
      </div>

      <div style={{
        marginTop: 14,
        color: '#6b7280',
        fontSize: 12
      }}>
        Evren ortalaması: 10 gün {formatSignedPctValue(summary.universe?.avgReturn10Pct)} · 20 gün {formatSignedPctValue(summary.universe?.avgReturn20Pct)}
      </div>
    </Panel>
  )
}

function BacktestCard({ title, color, data = {}, interpretation, inverse = false }) {
  const excess = Number(data.avgExcessReturn10Pct || 0)
  const excessColor = inverse
    ? (excess < 0 ? GREEN : RED)
    : (excess >= 0 ? GREEN : RED)

  return (
    <div style={{
      background: '#0b1220',
      border: `1px solid ${color}44`,
      borderRadius: '18px',
      padding: '15px'
    }}>
      <div style={{ color, fontWeight: 'bold', marginBottom: 10 }}>{title}</div>

      <BacktestMetric label="10g getiri" value={formatSignedPctValue(data.avgReturn10Pct)} />
      <BacktestMetric label="evrene göre fark" value={formatSignedPctValue(data.avgExcessReturn10Pct)} color={excessColor} />
      <BacktestMetric label="reward / risk" value={formatNumber(data.rewardRisk10)} />
      <BacktestMetric label="hit spread" value={formatSignedPctValue(data.hitSpread10Pct)} />
      <BacktestMetric label="gün sayısı" value={data.days ?? '-'} />

      <p style={{
        color: '#9ca3af',
        fontSize: 12,
        lineHeight: 1.55,
        marginTop: 12
      }}>
        {interpretation}
      </p>
    </div>
  )
}

function BacktestMetric({ label, value, color = '#e5e7eb' }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      gap: 10,
      padding: '7px 0',
      borderBottom: '1px solid #111827',
      fontSize: 12
    }}>
      <span style={{ color: '#6b7280' }}>{label}</span>
      <strong style={{ color }}>{value}</strong>
    </div>
  )
}

function MiniArchitecture() {
  const items = [
    ['React', 'Radar arayüzü ve brifing ekranı'],
    ['.NET API', 'Zeta JSON çıktılarını servis eden controller'],
    ['Python', 'Panel dataset, model eğitimi ve radar üretimi'],
    ['SQL Server', 'Hisse, OHLCV, dış veri ve portföy kayıtları']
  ]

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {items.map(([title, text]) => (
        <div
          key={title}
          style={{
            background: '#0b1220',
            border: '1px solid #1f2937',
            borderRadius: 14,
            padding: 12
          }}
        >
          <div style={{ color: '#93c5fd', fontWeight: 'bold', marginBottom: 5 }}>{title}</div>
          <div style={{ color: '#9ca3af', fontSize: 12, lineHeight: 1.5 }}>{text}</div>
        </div>
      ))}
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
        fontSize: '25px',
        letterSpacing: '-0.4px'
      }}>
        {value}
      </div>
    </div>
  )
}

function Panel({ children, borderColor = '#1f2937' }) {
  return (
    <div style={{
      background: 'linear-gradient(180deg, #111827 0%, #0f172a 100%)',
      border: `1px solid ${borderColor}`,
      borderRadius: '20px',
      padding: '22px',
      marginBottom: '22px',
      boxShadow: '0 18px 40px rgba(0,0,0,0.22)'
    }}>
      {children}
    </div>
  )
}

function Pill({ color, label, value }) {
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '7px',
      background: '#0b1220',
      border: '1px solid #1f2937',
      borderRadius: '999px',
      padding: '7px 10px',
      color: '#d1d5db',
      fontSize: '12px'
    }}>
      <span style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 12px ${color}`
      }} />
      <span style={{ color: '#6b7280' }}>{label}</span>
      <strong style={{ color }}>{value}</strong>
    </div>
  )
}

function MiniMetric({ label, value, color }) {
  return (
    <div style={{
      background: '#111827',
      border: '1px solid #1f2937',
      borderRadius: 12,
      padding: '9px'
    }}>
      <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 4 }}>{label}</div>
      <div style={{ color, fontWeight: 'bold' }}>{value}</div>
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      gap: 12,
      padding: '10px 0',
      borderBottom: '1px solid #1f2937',
      fontSize: 13
    }}>
      <span style={{ color: '#6b7280' }}>{label}</span>
      <strong style={{ color: '#e5e7eb', textAlign: 'right' }}>{value}</strong>
    </div>
  )
}

function EmptyState({ title, text }) {
  return (
    <div style={{
      background: '#0b1220',
      border: '1px dashed #334155',
      borderRadius: '18px',
      padding: '28px',
      textAlign: 'center'
    }}>
      <div style={{ color: '#e5e7eb', fontWeight: 'bold', marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ color: '#9ca3af', fontSize: 13 }}>
        {text}
      </div>
    </div>
  )
}

function Eyebrow({ children }) {
  return (
    <div style={{ color: '#6b7280', fontSize: '12px', marginBottom: 4 }}>
      {children}
    </div>
  )
}

function scenarioName(value) {
  return SCENARIO_META[value]?.shortLabel || String(value || '').toLowerCase().replaceAll('_', ' ')
}

function formatModelName(value) {
  if (!value) return '-'

  return String(value)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-'
  return Number(value).toFixed(2)
}

function formatInt(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-'
  return Number(value).toLocaleString('tr-TR')
}

function formatPrice(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-'
  return Number(value).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

function formatPct(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-'
  return `${(Number(value) * 100).toFixed(2)}%`
}

function formatSignedPctValue(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-'
  const number = Number(value)
  const sign = number > 0 ? '+' : ''
  return `${sign}${number.toFixed(4)}%`
}

const h3 = {
  margin: 0,
  letterSpacing: '-0.4px',
  marginBottom: '10px'
}

const p = {
  color: '#d1d5db',
  fontSize: '14px',
  lineHeight: 1.7,
  margin: '0 0 12px'
}
