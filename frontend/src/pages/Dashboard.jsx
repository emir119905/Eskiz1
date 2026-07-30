import { useEffect, useMemo, useState } from 'react'
import { getBehaviorSignal, getZetaLatestRadar, searchStocks } from '../api/client'
import { useAnalysis } from '../context/AnalysisContext'
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  ReferenceLine
} from 'recharts'
import {
  pct,
  num,
  money,
  formatTooltipValue,
  getBiasLabel,
  getBiasColor
} from '../utils/formatters'
import { buildFusionSummary } from '../utils/fusionLayer'

const BLUE = '#2dd4bf'
const GREEN = '#10b981'
const YELLOW = '#f59e0b'
const RED = '#ef4444'
const PURPLE = '#8b5cf6'
const GRAY = '#66625a'

function safeNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function getStockId(stock) {
  return stock?.stockID ?? stock?.StockID ?? stock?.stockId ?? stock?.id ?? null
}

function CustomTooltip({ active, payload, label, asset, mode }) {
  if (!active || !payload?.length) return null

  return (
    <div style={{
      background: '#141312',
      border: '1px solid #2a2825',
      borderRadius: '14px',
      padding: '11px 14px',
      fontSize: '13px',
      boxShadow: '0 18px 38px rgba(0,0,0,0.35)'
    }}>
      <p style={{
        color: '#9a968c',
        margin: '0 0 7px',
        fontWeight: 'bold'
      }}>
        {label}
      </p>

      {payload.map((p, i) => {
        if (p.value == null) return null

        return (
          <p key={i} style={{
            color: p.color,
            margin: '5px 0',
            display: 'flex',
            gap: '8px',
            justifyContent: 'space-between'
          }}>
            <span>{p.name}</span>
            <strong>{formatTooltipValue(p.value, mode, asset)}</strong>
          </p>
        )
      })}
    </div>
  )
}

export default function Dashboard() {
  const {
    selectedStock,
    prediction,
    loading,
    error,
    toast,
    selectStock,
    runPrediction
  } = useAnalysis()

  const [searchQ, setSearchQ] = useState(selectedStock?.symbol || '')
  const [searchResults, setSearchResults] = useState([])
  const [chartView, setChartView] = useState('scenario')
  const [scaleMode, setScaleMode] = useState('price')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [behaviorSignal, setBehaviorSignal] = useState(null)
  const [behaviorLoading, setBehaviorLoading] = useState(false)
  const [behaviorError, setBehaviorError] = useState(null)
  const [zetaRadar, setZetaRadar] = useState(null)
  const [zetaLoading, setZetaLoading] = useState(false)
  const [zetaError, setZetaError] = useState(null)

  const selectedStockId = getStockId(selectedStock)
  const zetaItem = useMemo(() => {
    return findZetaItemForStock(zetaRadar, selectedStock)
  }, [zetaRadar, selectedStock])

  const pm = prediction?.practicalHorizonMetrics
  const pn = prediction?.practicalNaiveMetrics
  const skill = prediction?.practicalSkillVsNaive
  const signal = prediction?.signalQuality

  const fusionSummary = useMemo(() => {
    return buildFusionSummary({
      signal,
      behaviorSignal,
      zetaItem,
      behaviorLoading,
      zetaLoading
    })
  }, [signal, behaviorSignal, zetaItem, behaviorLoading, zetaLoading])

  useEffect(() => {
    let alive = true

    async function loadBehaviorSignal() {
      if (!prediction || !selectedStockId) {
        setBehaviorSignal(null)
        setBehaviorError(null)
        setBehaviorLoading(false)
        return
      }

      setBehaviorLoading(true)
      setBehaviorError(null)

      try {
        const res = await getBehaviorSignal(selectedStockId)

        if (!alive) return

        if (res.data?.error) {
          setBehaviorSignal(null)
          setBehaviorError(res.data.error)
        } else {
          setBehaviorSignal(res.data)
        }
      } catch (e) {
        if (!alive) return

        const err = e.response?.data?.detail || e.response?.data || e.message
        setBehaviorSignal(null)
        setBehaviorError(String(err))
      } finally {
        if (alive) setBehaviorLoading(false)
      }
    }

    loadBehaviorSignal()

    return () => {
      alive = false
    }
  }, [prediction, selectedStockId])

  useEffect(() => {
  let alive = true

  async function loadZetaRadar() {
    setZetaLoading(true)
    setZetaError(null)

    try {
      const res = await getZetaLatestRadar()

      if (!alive) return

      setZetaRadar(res.data)
    } catch (e) {
      if (!alive) return

      const err = e.response?.data?.message || e.response?.data || e.message
      setZetaRadar(null)
      setZetaError(String(err))
    } finally {
      if (alive) setZetaLoading(false)
    }
  }

  loadZetaRadar()

  return () => {
    alive = false
  }
}, [])

  async function handleSearch(e) {
    const q = e.target.value
    setSearchQ(q)

    if (q.length < 2) {
      setSearchResults([])
      return
    }

    try {
      const res = await searchStocks(q)
      setSearchResults(res.data)
    } catch {
      setSearchResults([])
    }
  }

  function handleSelectStock(stock) {
    selectStock(stock)
    setSearchQ(stock.symbol)
    setSearchResults([])
  }

  function firstNonNull(data, keys) {
    for (const row of data) {
      for (const key of keys) {
        const value = row[key]
        if (value != null && Number.isFinite(Number(value))) {
          return Number(value)
        }
      }
    }

    return null
  }

  function transformValue(value, base) {
    if (value == null || base == null || base === 0) return value

    if (scaleMode === 'normalized') {
      return (Number(value) / base) * 100
    }

    if (scaleMode === 'percent') {
      return ((Number(value) / base) - 1) * 100
    }

    return value
  }

  const chartData = useMemo(() => {
    if (!prediction?.chartData) return []

    const backtest = prediction.chartData.backtest || []
    const forecast = prediction.chartData.forecast || []

    if (chartView === 'distribution') return []

    if (chartView === 'returns') {
      return backtest.map(x => ({
        label: x.date,
        actualReturn: safeNumber(x.actualReturn) * 100,
        predictedReturn: safeNumber(x.predictedReturn) * 100
      }))
    }

    if (chartView === 'error') {
      return backtest.map(x => {
        const real = Number(x.realPrice)
        const model = Number(x.modelPrediction)
        const naive = Number(x.naivePrediction)

        return {
          label: x.date,
          modelError: real ? Math.abs((model - real) / real) * 100 : null,
          naiveError: real ? Math.abs((naive - real) / real) * 100 : null
        }
      })
    }

    let data = []

    if (chartView === 'backtest' || chartView === 'scenario') {
      data = [
        ...data,
        ...backtest.map(x => ({
          label: x.date,
          real: x.realPrice,
          modelBacktest: x.modelPrediction,
          naive: x.naivePrediction,
          forecastMean: null,
          lower: null,
          upper: null
        }))
      ]
    }

    if (chartView === 'forecast' || chartView === 'scenario') {
      data = [
        ...data,
        ...forecast.map(x => ({
          label: x.date,
          real: null,
          modelBacktest: null,
          naive: null,
          forecastMean: x.mean,
          lower: x.lower,
          upper: x.upper
        }))
      ]
    }

    if (scaleMode === 'price') return data

    const base = firstNonNull(data, ['real', 'modelBacktest', 'naive', 'forecastMean'])

    return data.map(row => ({
      ...row,
      real: transformValue(row.real, base),
      modelBacktest: transformValue(row.modelBacktest, base),
      naive: transformValue(row.naive, base),
      forecastMean: transformValue(row.forecastMean, base),
      lower: transformValue(row.lower, base),
      upper: transformValue(row.upper, base)
    }))
  }, [prediction, chartView, scaleMode])

  const distributionData = useMemo(() => {
    const actual = pm?.actualClassDistribution
    const pred = pm?.predictedClassDistribution
    const naive = pn?.predictedClassDistribution

    return [
      {
        name: 'Gerçek',
        down: actual?.downPct ?? 0,
        flat: actual?.flatPct ?? 0,
        up: actual?.upPct ?? 0
      },
      {
        name: 'Model',
        down: pred?.downPct ?? 0,
        flat: pred?.flatPct ?? 0,
        up: pred?.upPct ?? 0
      },
      {
        name: 'Basit Karşılaştırma',
        down: naive?.downPct ?? 0,
        flat: naive?.flatPct ?? 0,
        up: naive?.upPct ?? 0
      }
    ]
  }, [pm, pn])

  const chartTitle = {
    scenario: 'Horizon Backtest ve 30 Günlük Senaryo',
    backtest: 'T+5 Horizon Backtest',
    forecast: '30 Günlük Senaryo Bandı',
    returns: 'Gerçek vs Model 5G Getiri',
    error: 'Model vs Basit Karşılaştırma Hata Grafiği',
    distribution: 'Aşağı / Nötr / Yukarı Dağılımı'
  }[chartView]

  const isReturnChart = chartView === 'returns' || chartView === 'error'
  const axisSuffix = isReturnChart || scaleMode === 'percent' ? '%' : ''

  return (
    <div style={{
      maxWidth: '1280px',
      margin: '0 auto',
      position: 'relative'
    }}>
      <Toast toast={toast} />

      <HeaderBlock />

      <SearchPanel
        searchQ={searchQ}
        searchResults={searchResults}
        selectedStock={selectedStock}
        loading={loading}
        error={error}
        prediction={prediction}
        handleSearch={handleSearch}
        handleSelectStock={handleSelectStock}
        runPrediction={runPrediction}
      />

      {prediction && (
        <>
          <SignalHero
            selectedStock={selectedStock}
            signal={signal}
            pm={pm}
            skill={skill}
          />

          <BehaviorSignalCard
            selectedStock={selectedStock}
            behaviorSignal={behaviorSignal}
            loading={behaviorLoading}
            error={behaviorError}
          />
        <ZetaRadarCard
          selectedStock={selectedStock}
          zetaItem={zetaItem}
          radar={zetaRadar}
          loading={zetaLoading}
          error={zetaError}
        />

        <FusionSummaryCard
          selectedStock={selectedStock}
          fusion={fusionSummary}
        />

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.15fr 0.85fr',
            gap: '18px',
            marginBottom: '20px'
          }}>
            <ModelVsNaiveCard
              pm={pm}
              pn={pn}
              skill={skill}
              selectedStock={selectedStock}
            />

            <SignalHealthCard
              signal={signal}
              pm={pm}
            />
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(160px, 1fr))',
            gap: '14px',
            marginBottom: '22px'
          }}>
            <MetricCard
              label="Fiyat Hatası Avantajı"
              value={pct(skill?.mapeSkillPct)}
              sub={skill?.beatsNaiveByMape ? 'Model, basit karşılaştırma modelinden daha iyi' : 'Basit karşılaştırma modeli daha iyi'}
              color={(skill?.mapeSkillPct || 0) >= 0 ? GREEN : RED}
              icon="⚔️"
            />

            <MetricCard
              label="Yön Tahmin Başarısı"
              value={pct(pm?.directionScore)}
              sub={`Kapsama: ${pct(pm?.directionCoverage)}`}
              color={(pm?.directionScore || 0) >= 50 ? GREEN : YELLOW}
              icon="🧭"
            />

            <MetricCard
              label="Sinyal Sıklığı"
              value={pct(pm?.predictedActionRate)}
              sub="Modelin yukarı/aşağı sinyal üretme oranı"
              color={(pm?.predictedActionRate || 0) > 0 ? BLUE : GRAY}
              icon="⚡"
            />

            <MetricCard
              label="Yön Sınıflama Başarısı"
              value={pct(pm?.threeClassAccuracy)}
              sub="Aşağı / nötr / yukarı sınıflaması"
              color={PURPLE}
              icon="📊"
            />
          </div>

          <ChartPanel
            selectedStock={selectedStock}
            chartTitle={chartTitle}
            chartView={chartView}
            setChartView={setChartView}
            scaleMode={scaleMode}
            setScaleMode={setScaleMode}
            chartData={chartData}
            distributionData={distributionData}
            axisSuffix={axisSuffix}
            isReturnChart={isReturnChart}
          />

          <DistributionMiniPanel data={distributionData} />

          <DetailsPanel
            prediction={prediction}
            pm={pm}
            signal={signal}
            detailsOpen={detailsOpen}
            setDetailsOpen={setDetailsOpen}
          />
        </>
      )}

      {!prediction && (
        <EmptyState selectedStock={selectedStock} loading={loading} />
      )}
    </div>
  )
}

function HeaderBlock() {
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
          background: GREEN,
          boxShadow: `0 0 18px ${GREEN}`
        }} />
        Pusula AI · Karar Destek Paneli
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: '18px',
        alignItems: 'flex-end',
        flexWrap: 'wrap'
      }}>
        <div>
          <h2 style={{
            margin: 0,
            letterSpacing: '-0.8px',
            fontSize: '31px'
          }}>
            📈 Finansal Analiz Paneli
          </h2>

          <p style={{
            color: '#9a968c',
            marginTop: '9px',
            maxWidth: '830px',
            lineHeight: 1.65
          }}>
            Seçili hisse için ana tahmin motoru, davranış sinyali ve Zeta Radar senaryosu birlikte gösterilir.
            Amaç tek başına “al/sat” demek değil; modelin güçlü gördüğü, kararsız kaldığı veya riskli bulduğu alanları okunabilir hale getirmektir.
          </p>
        </div>

        <div style={{
          border: '1px solid #2a2825',
          borderRadius: '16px',
          padding: '12px 14px',
          background: 'linear-gradient(180deg, #141312, #0f0f10)',
          minWidth: 240
        }}>
          <div style={{ color: '#66625a', fontSize: '11px', marginBottom: 4 }}>
            Aktif Analiz Yapısı
          </div>

          <div style={{ color: '#e8e5df', fontWeight: 'bold' }}>
            Ana Model + Davranış Katmanı + Zeta Radar
          </div>

          <div style={{ color: '#66625a', fontSize: '11px', marginTop: 4, lineHeight: 1.45 }}>
            Sonuçlar deneysel karar destek çıktısıdır; yatırım tavsiyesi olarak yorumlanmamalıdır.
          </div>
        </div>
      </div>
    </div>
  )
}

function SearchPanel({
  searchQ,
  searchResults,
  selectedStock,
  loading,
  error,
  prediction,
  handleSearch,
  handleSelectStock,
  runPrediction
}) {
  return (
    <Panel style={{ marginBottom: '22px' }}>
      <div style={{
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start',
        flexWrap: 'wrap'
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '290px' }}>
          <input
            placeholder="Analiz etmek istediğiniz varlığı seçin... (örn: THYAO.IS, AAPL)"
            value={searchQ}
            onChange={handleSearch}
            style={inputStyle}
          />

          {searchResults.length > 0 && (
            <div style={searchBoxStyle}>
              {searchResults.map(s => (
                <div
                  key={s.stockID}
                  onClick={() => handleSelectStock(s)}
                  style={searchItemStyle}
                  onMouseEnter={e => { e.currentTarget.style.background = '#2a2825' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <div>
                    <div style={{ fontWeight: 'bold', color: '#60a5fa' }}>
                      {s.symbol}
                    </div>
                    <div style={{ color: '#9a968c', fontSize: '12px' }}>
                      {s.companyName}
                    </div>
                  </div>

                  <span style={{
                    color: '#66625a',
                    fontSize: '12px',
                    border: '1px solid #2a2825',
                    borderRadius: '999px',
                    padding: '4px 8px'
                  }}>
                    Seç
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => runPrediction()}
          disabled={loading || !selectedStock}
          style={{
            ...primaryButton,
            background: loading
              ? '#3a372f'
              : '#d97706',
            cursor: loading || !selectedStock ? 'not-allowed' : 'pointer',
            opacity: !selectedStock ? 0.65 : 1
          }}
        >
          {loading ? '⏳ Analiz ediliyor...' : prediction ? '🔁 Analizi Yenile' : '🔍 Analizi Başlat'}
        </button>
      </div>

      {selectedStock && (
        <div style={{
          marginTop: '14px',
          display: 'flex',
          gap: '10px',
          flexWrap: 'wrap',
          alignItems: 'center'
        }}>
          <Badge color={BLUE}>Seçili: {selectedStock.symbol}</Badge>
          {selectedStock.companyName && (
            <span style={{ color: '#9a968c', fontSize: '13px' }}>
              {selectedStock.companyName}
            </span>
          )}
        </div>
      )}

      {error && (
        <div style={{
          marginTop: '14px',
          color: '#fecaca',
          background: '#ef444422',
          border: '1px solid #ef4444',
          borderRadius: '10px',
          padding: '10px 12px',
          fontSize: '13px'
        }}>
          Analiz servisi hatası: {error}
        </div>
      )}

      {prediction?.message && (
        <p style={{
          color: '#66625a',
          marginTop: '12px',
          fontSize: '13px',
          fontStyle: 'italic'
        }}>
          ⚙️ {prediction.message}
        </p>
      )}
    </Panel>
  )
}

function SignalHero({ selectedStock, signal, pm, skill }) {
  const color = getBiasColor(signal?.tradeBias)
  const rawLabel = getBiasLabel(signal?.tradeBias)

  const actionRate = safeNumber(pm?.predictedActionRate)
  const mapeSkill = safeNumber(skill?.mapeSkillPct)
  const confidence = safeNumber(signal?.directionConfidence)
  const edge = safeNumber(signal?.directionEdge)

  const readableLabel = (() => {
    const bias = String(signal?.tradeBias || '').toLowerCase()

    if (bias.includes('buy') || bias.includes('up') || bias.includes('long')) {
      return 'Pozitif Senaryo Öne Çıkıyor'
    }

    if (bias.includes('sell') || bias.includes('down') || bias.includes('short')) {
      return 'Aşağı Risk Öne Çıkıyor'
    }

    if (bias.includes('hold') || bias.includes('flat') || bias.includes('neutral') || bias.includes('wait')) {
      return 'Bekle-Gör Daha Sağlıklı'
    }

    return rawLabel || 'Model Senaryosu'
  })()

  const behavior = (() => {
    if (actionRate === 0) {
      return 'Model bu analizde net yukarı/aşağı kararı üretmemiş. Bu durum genelde “bekle-gör” veya yön belirsizliği anlamına gelir.'
    }

    if (actionRate >= 80) {
      return 'Model çok sık işlem sinyali üretiyor. Bu, güçlü bir yön okuması gibi görünebilir; ancak bazen tek tarafa aşırı yüklenme riski de taşır.'
    }

    if (actionRate >= 35) {
      return 'Model belirli aralıklarla yön sinyali üretiyor. Bu sonuç, diğer kartlardaki Zeta ve davranış sinyaliyle birlikte okunmalıdır.'
    }

    return 'Model seçici davranıyor. Yani her durumda yön söylemek yerine yalnızca daha belirgin gördüğü alanlarda sinyal üretmeye çalışıyor.'
  })()

  const baselineText = mapeSkill >= 0
    ? `Ana model, basit karşılaştırma modeline göre fiyat hatasında ${pct(mapeSkill)} daha iyi sonuç vermiş.`
    : `Bu testte basit karşılaştırma modeli, ana modelden ${pct(Math.abs(mapeSkill))} daha düşük fiyat hatası üretmiş.`

  const confidenceText = confidence >= 0.60
    ? 'Sinyal güveni güçlü.'
    : confidence >= 0.40
      ? 'Sinyal güveni orta seviyede.'
      : 'Sinyal güveni düşük; sonuç temkinli okunmalı.'

  const edgeText = edge >= 0.15
    ? 'Model yukarı/aşağı ayrımını belirgin görüyor.'
    : edge >= 0.07
      ? 'Modelde sınırlı bir yön ayrımı var.'
      : 'Model net yön ayrımı üretmekte zorlanıyor.'

  return (
    <div style={{
      background: `radial-gradient(circle at top left, ${color}30, transparent 32%), linear-gradient(135deg, rgba(20,19,18,0.98), rgba(12,12,13,0.98))`,
      border: `1px solid ${color}70`,
      borderRadius: '22px',
      padding: '22px',
      marginBottom: '18px',
      boxShadow: `0 22px 52px ${color}10`,
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div style={{
        position: 'absolute',
        right: -70,
        top: -70,
        width: 170,
        height: 170,
        borderRadius: '50%',
        background: `${color}18`
      }} />

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.15fr 1fr 0.95fr',
        gap: '18px',
        alignItems: 'center',
        position: 'relative'
      }}>
        <div>
          <div style={{ color: '#9a968c', fontSize: '12px', marginBottom: '7px' }}>
            {selectedStock?.symbol || 'Seçili Varlık'} · Ana Model Yorumu
          </div>

          <div style={{
            fontSize: '27px',
            fontWeight: 'bold',
            color,
            letterSpacing: '-0.6px',
            marginBottom: '8px'
          }}>
            {readableLabel}
          </div>

          <div style={{ color: '#c7c3b8', fontSize: '13px', lineHeight: 1.6 }}>
            {baselineText}
          </div>
        </div>

        <div style={{ color: '#c7c3b8', fontSize: '13px', lineHeight: 1.65 }}>
          <div style={{ color: '#9a968c', fontSize: '12px', marginBottom: 5 }}>
            Modelin Karar Verme Şekli
          </div>

          {behavior}
        </div>

        <div>
          <div style={{ color: '#9a968c', fontSize: '12px', marginBottom: 8 }}>
            Güven ve Ayrım Gücü
          </div>

          <HealthRow label="Sinyal Güveni" value={confidence * 100} color={color} />
          <HealthRow label="Yön Ayrımı" value={edge * 100} color={edge >= 0.1 ? GREEN : YELLOW} />

          <div style={{
            color: '#9a968c',
            fontSize: '11px',
            lineHeight: 1.45,
            marginTop: '8px'
          }}>
            {confidenceText} {edgeText}
          </div>
        </div>
      </div>
    </div>
  )
}

function getBehaviorDirectionColor(directionBias) {
  if (directionBias === 'up') return GREEN
  if (directionBias === 'down') return RED
  return YELLOW
}

function getBehaviorDirectionLabel(directionBias) {
  if (directionBias === 'up') return 'Yukarı eğilim destekleniyor'
  if (directionBias === 'down') return 'Aşağı baskı izleniyor'
  return 'Net yön oluşmamış'
}

function getBehaviorTrendLabel(trendState) {
  const labels = {
    trend_following: 'Trend devamı',
    mean_reverting: 'Ortalamaya dönüş',
    choppy_high_vol: 'Dalgalı ve sert piyasa',
    choppy: 'Kararsız piyasa',
    unknown: 'Belirsiz'
  }

  return labels[trendState] || trendState || '-'
}

function getBehaviorVolLabel(volatilityState) {
  const labels = {
    low: 'Sakin',
    normal: 'Normal',
    high: 'Hareketli',
    unknown: 'Belirsiz'
  }

  return labels[volatilityState] || volatilityState || '-'
}

function getBehaviorVolumeLabel(volumePressure) {
  const labels = {
    low: 'Düşük ilgi',
    normal: 'Normal ilgi',
    high: 'Yüksek ilgi'
  }

  return labels[volumePressure] || volumePressure || '-'
}

function getBehaviorWarningLabel(warning) {
  const labels = {
    HIGH_FLAT_RISK: 'Net yön belirsizliği yüksek',
    CHOPPY_REGIME: 'Piyasa davranışı kararsız',
    LOW_CONFIDENCE: 'Sinyal güveni düşük',
    HIGH_VOLATILITY: 'Oynaklık yüksek'
  }

  return labels[warning] || warning
}

function getBehaviorInterpretation(signal) {
  if (!signal) return '-'

  if (signal.directionBias === 'flat') {
    if (safeNumber(signal.flatRisk) >= 75) {
      return 'Davranış katmanı bu hissede net bir yukarı veya aşağı yön göremiyor. Bu nedenle ana model sonucu tek başına güçlü bir sinyal gibi okunmamalı.'
    }

    return 'Davranış katmanı yatay veya kararsız bir fiyat yapısına işaret ediyor. Bu durumda bekle-gör yaklaşımı daha sağlıklı olabilir.'
  }

  if (signal.directionBias === 'up') {
    return signal.actionable
      ? 'Son fiyat davranışı yukarı yönlü hareketi destekliyor. Bu, ana modelin pozitif çıktılarıyla birlikte okunabilecek yardımcı bir işarettir.'
      : 'Yukarı eğilim belirtileri var; ancak güven veya yön belirsizliği nedeniyle bu sonuç tek başına güçlü sinyal sayılmamalı.'
  }

  if (signal.directionBias === 'down') {
    return signal.actionable
      ? 'Son fiyat davranışı aşağı yönlü baskıyı destekliyor. Bu, seçili hissede temkinli olunması gerektiğini gösteren yardımcı bir işarettir.'
      : 'Aşağı eğilim belirtileri var; ancak güven veya yön belirsizliği nedeniyle bu sonuç dikkatli yorumlanmalı.'
  }

  return 'Davranış sinyali bu hisse için net yorum üretmedi.'
}

function normalizeSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase()
}

function findZetaItemForStock(radar, stock) {
  if (!radar || !stock) return null

  const symbol = normalizeSymbol(stock.symbol || stock.Symbol)

  if (!symbol) return null

  if (Array.isArray(radar.allStocks)) {
    return radar.allStocks.find(item => normalizeSymbol(item.symbol) === symbol) || null
  }

  const groups = radar.radars || {}

  const items = [
    ...(groups.momentumLong || []),
    ...(groups.dipRebound || []),
    ...(groups.downsideRisk || []),
    ...(groups.riskWatch || []),
    ...(groups.neutral || [])
  ]

  return items.find(item => normalizeSymbol(item.symbol) === symbol) || null
}

const ZETA_SCENARIO_LABELS = {
  MOMENTUM_LONG: 'Güçlü gidiş izlenebilir',
  DIP_REBOUND_WATCH: 'Toparlanma ihtimali izlenebilir',
  DOWNSIDE_RISK: 'Aşağı yönlü risk var',
  RISK_WATCH: 'Dikkatli izlenmeli',
  NEUTRAL: 'Net senaryo oluşmamış'
}

const ZETA_SCENARIO_TEXTS = {
  MOMENTUM_LONG:
    'Zeta, bu hissenin son verilerde piyasaya göre güçlü kaldığını görüyor. Bu, fiyatın aynı yönde devam edebileceği anlamına gelebilir; ancak tek başına alım önerisi değildir.',
  DIP_REBOUND_WATCH:
    'Zeta, bu hissede düşüş sonrası toparlanma ihtimalini izlenebilir buluyor. Burada amaç “düştü diye alınır” demek değil; düşüşün kontrollü şekilde tepkiye dönüp dönmediğini takip etmektir.',
  DOWNSIDE_RISK:
    'Zeta, bu hissede kısa vadeli aşağı baskının öne çıktığını düşünüyor. Bu senaryo fırsattan çok risk uyarısı olarak okunmalıdır.',
  RISK_WATCH:
    'Zeta, bu hissede net bir fırsat görmüyor; ancak belirsizlik veya kırılganlık nedeniyle dikkatli takip edilmesini daha sağlıklı buluyor.',
  NEUTRAL:
    'Zeta, bu hisse için yeterince güçlü bir fırsat veya risk ayrımı görmüyor. Bu durumda bekle-gör yaklaşımı daha doğru olabilir.'
}

const ZETA_TAG_LABELS = {
  BREAKOUT_PRESSURE: 'kırılım baskısı',
  POSITIVE_MOMENTUM: 'pozitif gidiş',
  RELATIVE_STRENGTH: 'piyasaya göre güçlü duruş',
  UP_PROBABILITY_SUPPORT: 'model yukarı ihtimalini destekliyor',
  CONTROLLED_VOLATILITY: 'oynaklık kontrollü',
  LOWER_WICK_SUPPORT: 'gün içinde alıcı tepkisi',
  LOW_RANGE_POSITION: 'fiyat bandın alt bölgesinde',
  RECOVERY_CLOSE: 'gün sonuna doğru toparlanma',
  HIGH_VOLUME_WEAK_CLOSE: 'yüksek hacimli zayıf kapanış',
  HIGH_FLAT_RISK: 'net yön belirsizliği yüksek',
  NO_CLEAR_EDGE: 'net avantaj yok',
  FALLING_KNIFE_RISK: 'düşüşün devam etme riski',
  MEDIUM_FALLING_KNIFE_RISK: 'orta seviye düşüş riski',
  ELEVATED_VOLATILITY: 'oynaklık yüksek',
  DOWN_PROBABILITY_PRESSURE: 'aşağı ihtimal baskısı',
  NEGATIVE_MOMENTUM: 'negatif gidiş',
  RELATIVE_WEAKNESS: 'piyasaya göre zayıf duruş',
  WEAK_CLOSE: 'zayıf kapanış'
}

function getZetaScenarioLabel(scenario) {
  return ZETA_SCENARIO_LABELS[scenario] || 'Zeta Senaryosu'
}

function getZetaScenarioText(scenario) {
  return ZETA_SCENARIO_TEXTS[scenario] || 'Zeta bu hisse için deneysel bir senaryo değerlendirmesi üretmiştir.'
}

function sentenceCase(text) {
  const value = String(text || '').trim()

  if (!value) return ''

  return value.charAt(0).toLocaleUpperCase('tr-TR') + value.slice(1)
}

function getZetaTagLabel(tag) {
  return sentenceCase(ZETA_TAG_LABELS[tag] || tag)
}

function getZetaScenarioColor(scenario) {
  if (scenario === 'MOMENTUM_LONG') return GREEN
  if (scenario === 'DIP_REBOUND_WATCH') return BLUE
  if (scenario === 'DOWNSIDE_RISK') return RED
  if (scenario === 'RISK_WATCH') return YELLOW
  return GRAY
}
function FusionSummaryCard({ selectedStock, fusion }) {
  if (!fusion) return null

  const alignmentColor =
    fusion.alignment === 'aligned'
      ? GREEN
      : fusion.alignment === 'conflicting'
        ? RED
        : YELLOW

  const headlineColor =
    fusion.riskLevel === 'Yüksek' && fusion.opportunityLevel !== 'Yüksek'
      ? RED
      : fusion.opportunityLevel === 'Yüksek' && fusion.riskLevel !== 'Yüksek'
        ? GREEN
        : fusion.alignment === 'conflicting'
          ? YELLOW
          : BLUE

  return (
    <div style={{
      background: `radial-gradient(circle at top left, ${headlineColor}22, transparent 34%), linear-gradient(135deg, rgba(20,19,18,0.98), rgba(12,12,13,0.98))`,
      border: `1px solid ${headlineColor}66`,
      borderRadius: '22px',
      padding: '22px',
      marginBottom: '18px',
      boxShadow: `0 22px 52px ${headlineColor}10`
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '18px',
        marginBottom: '18px',
        flexWrap: 'wrap'
      }}>
        <div>
          <div style={{ color: '#66625a', fontSize: '12px', marginBottom: 5 }}>
            {selectedStock?.symbol || 'Seçili Varlık'} · Birleşik Karar Özeti
          </div>

          <div style={{
            color: headlineColor,
            fontWeight: 'bold',
            fontSize: '25px',
            letterSpacing: '-0.5px',
            marginBottom: '8px'
          }}>
            {fusion.headline}
          </div>

          <div style={{
            color: '#c7c3b8',
            fontSize: '13px',
            lineHeight: 1.65,
            maxWidth: 860
          }}>
            {fusion.summary}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Badge color={alignmentColor}>
            Uyum: {fusion.alignmentLabel}
          </Badge>

          <Badge color={fusion.opportunityLevel === 'Yüksek' ? GREEN : fusion.opportunityLevel === 'Orta' ? YELLOW : GRAY}>
            İzleme gücü: {fusion.opportunityLevel}
          </Badge>

          <Badge color={fusion.riskLevel === 'Yüksek' ? RED : fusion.riskLevel === 'Orta' ? YELLOW : GREEN}>
            Risk: {fusion.riskLevel}
          </Badge>
        </div>
      </div>

      {fusion.layers && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(160px, 1fr))',
          gap: '12px',
          marginBottom: fusion.notes?.length ? '16px' : 0
        }}>
          <FusionLayerChip label="Ana Model" value={fusion.layers.model} color={BLUE} />
          <FusionLayerChip label="Fiyat Davranışı" value={fusion.layers.behavior} color={PURPLE} />
          <FusionLayerChip label="Zeta Senaryosu" value={fusion.layers.zeta} color={GREEN} />
        </div>
      )}

      {fusion.notes?.length > 0 && (
        <div style={{
          borderTop: '1px solid #2a2825',
          paddingTop: '14px',
          display: 'grid',
          gap: '8px'
        }}>
          {fusion.notes.map(note => (
            <div
              key={note}
              style={{
                color: '#9a968c',
                fontSize: '12px',
                lineHeight: 1.5,
                display: 'flex',
                gap: '8px'
              }}
            >
              <span style={{ color: headlineColor }}>•</span>
              <span>{note}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FusionLayerChip({ label, value, color }) {
  return (
    <div style={{
      background: '#0f0f10',
      border: '1px solid #2a2825',
      borderRadius: '14px',
      padding: '12px 14px'
    }}>
      <div style={{ color: '#66625a', fontSize: '11px', marginBottom: 5 }}>{label}</div>
      <div style={{ color, fontWeight: 'bold', fontSize: '14px', lineHeight: 1.45 }}>{value}</div>
    </div>
  )
}

function ZetaRadarCard({ selectedStock, zetaItem, radar, loading, error }) {
  if (loading) {
    return (
      <Panel style={{ marginBottom: '18px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', color: '#9a968c' }}>
          <span style={{ fontSize: 22 }}>⏳</span>
          <div>
            <strong style={{ color: '#e8e5df' }}>Zeta Radar yükleniyor</strong>
            <div style={{ fontSize: '12px', marginTop: 3 }}>
              BIST senaryo taraması son JSON çıktısından okunuyor.
            </div>
          </div>
        </div>
      </Panel>
    )
  }

  if (error) {
    return (
      <Panel style={{ marginBottom: '18px', borderColor: '#ef444466' }}>
        <div style={{ color: '#fecaca', fontSize: '13px', lineHeight: 1.55 }}>
          <strong>Zeta Radar verisi alınamadı:</strong> {error}
        </div>
      </Panel>
    )
  }

  if (!selectedStock || !radar) return null

  if (!zetaItem) {
    return (
      <Panel style={{ marginBottom: '18px' }}>
        <div style={{ color: '#66625a', fontSize: '12px', marginBottom: 5 }}>
          {selectedStock?.symbol || 'Seçili Varlık'} · Zeta Radar
        </div>

        <h3 style={{ margin: 0, color: '#e8e5df', marginBottom: 8 }}>
          Zeta bu hisse için üst radar listesinde aktif kayıt bulamadı
        </h3>

        <div style={{ color: '#9a968c', fontSize: '13px', lineHeight: 1.6 }}>
          Bu durum hata değildir. Hisse son radar tarihinde güçlü gidiş, toparlanma veya risk izleme listelerinde öne çıkmamış olabilir.
          Zeta Radar tarihi: <strong style={{ color: '#c7c3b8' }}>{radar.date || '-'}</strong>
        </div>
      </Panel>
    )
  }

  const scenario = zetaItem.scenario
  const color = getZetaScenarioColor(scenario)
  const probabilities = zetaItem.modelProbabilities || {}
  const scores = zetaItem.scores || {}

  return (
    <div style={{
      background: `radial-gradient(circle at top left, ${color}24, transparent 34%), linear-gradient(135deg, rgba(20,19,18,0.98), rgba(12,12,13,0.98))`,
      border: `1px solid ${color}66`,
      borderRadius: '22px',
      padding: '22px',
      marginBottom: '18px',
      boxShadow: `0 22px 52px ${color}10`
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '18px',
        marginBottom: '18px',
        flexWrap: 'wrap'
      }}>
        <div>
          <div style={{ color: '#66625a', fontSize: '12px', marginBottom: 5 }}>
            {selectedStock?.symbol || zetaItem.symbol} · Zeta Senaryo Okuması
          </div>

          <div style={{
            color,
            fontWeight: 'bold',
            fontSize: '25px',
            letterSpacing: '-0.5px',
            marginBottom: '7px'
          }}>
            {getZetaScenarioLabel(scenario)}
          </div>

          <div style={{
            color: '#c7c3b8',
            fontSize: '13px',
            lineHeight: 1.65,
            maxWidth: 850
          }}>
            {getZetaScenarioText(scenario)}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Badge color={color}>
            Senaryo skoru: {num(zetaItem.score, 2)}
          </Badge>

          <Badge color={PURPLE}>
            Okuma güveni: {num(zetaItem.confidence, 2)}
          </Badge>

          <Badge color={GRAY}>
            Radar: {radar.date || '-'}
          </Badge>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: '14px',
        marginBottom: '16px'
      }}>
<ZetaProbabilityBox
  title="Aşağı senaryo"
  value={probabilities.down}
  color={RED}
  helper="Model, kısa vadede aşağı yönlü baskı ihtimalini burada gösterir."
/>

<ZetaProbabilityBox
  title="Yön belirsiz"
  value={probabilities.flat}
  color={GRAY}
  helper="Model net yukarı veya aşağı ayrımı göremediğinde bu olasılık yükselir."
/>

<ZetaProbabilityBox
  title="Yukarı senaryo"
  value={probabilities.up}
  color={GREEN}
  helper="Model, kısa vadede toparlanma veya yukarı hareket ihtimalini burada gösterir."
/>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.1fr 0.9fr',
        gap: '14px',
        alignItems: 'stretch'
      }}>
        <div style={{
          background: '#0f0f10',
          border: '1px solid #2a2825',
          borderRadius: '16px',
          padding: '15px'
        }}>
          <div style={{ color: '#66625a', fontSize: '12px', marginBottom: 12 }}>
            Senaryo Ayrımı
          </div>

<ZetaScoreLine label="Güçlü gidiş ihtimali" value={scores.momentumLong} color={GREEN} />
<ZetaScoreLine label="Toparlanma ihtimali" value={scores.dipRebound} color={BLUE} />
<ZetaScoreLine label="Aşağı risk" value={scores.downsideRisk} color={RED} />
<ZetaScoreLine label="Yön belirsizliği" value={scores.flatRisk} color={GRAY} />
<ZetaScoreLine label="Düşüşün sürme riski" value={scores.fallingKnifeRisk} color={YELLOW} />
        </div>

        <div style={{
          background: '#0f0f10',
          border: '1px solid #2a2825',
          borderRadius: '16px',
          padding: '15px'
        }}>
          <div style={{ color: '#66625a', fontSize: '12px', marginBottom: 12 }}>
            Zeta bu sonuca neden vardı?
          </div>

          <ZetaTagGroup
            title="Destekleyen veriler"
            tags={zetaItem.reasonTags || []}
            color={color}
            emptyText="Bu senaryo için öne çıkan ek destek etiketi yok."
          />

          <ZetaTagGroup
            title="Dikkat edilmesi gerekenler"
            tags={zetaItem.warningTags || []}
            color={YELLOW}
            emptyText="Ek risk uyarısı görünmüyor."
          />
        </div>
      </div>

      <div style={{
        borderTop: '1px solid #2a2825',
        marginTop: '16px',
        paddingTop: '13px',
        color: '#9a968c',
        fontSize: '12px',
        lineHeight: 1.55
      }}>
        Zeta, seçili hisseyi tek başına al/sat önerisi olarak değerlendirmez.
        Bu kart, ana tahmin motoruna ek olarak hissenin hangi senaryoda izlenebileceğini açıklar.
      </div>
    </div>
  )
}

function ZetaProbabilityBox({ title, value, color, helper }) {
  const pctValue = Math.max(0, Math.min(100, safeNumber(value) * 100))

  return (
    <div style={{
      background: '#0f0f10',
      border: '1px solid #2a2825',
      borderRadius: '16px',
      padding: '14px'
    }}>
      <div style={{ color: '#66625a', fontSize: '12px', marginBottom: 6 }}>
        {title}
      </div>

      <div style={{ color, fontWeight: 'bold', fontSize: '22px', marginBottom: 8 }}>
        {pct(pctValue)}
      </div>

      <div style={{
        height: 8,
        background: '#141312',
        borderRadius: '999px',
        overflow: 'hidden',
        marginBottom: 8
      }}>
        <div style={{
          width: `${pctValue}%`,
          height: '100%',
          borderRadius: '999px',
          background: color
        }} />
      </div>

      <div style={{ color: '#66625a', fontSize: '11px', lineHeight: 1.45 }}>
        {helper}
      </div>
    </div>
  )
}

function ZetaScoreLine({ label, value, color }) {
  const safe = Math.max(0, Math.min(100, safeNumber(value)))

  return (
    <div style={{ marginBottom: '11px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        color: '#9a968c',
        fontSize: '12px',
        marginBottom: 5
      }}>
        <span>{label}</span>
        <strong style={{ color }}>{num(safe, 2)}</strong>
      </div>

      <div style={{
        height: 8,
        background: '#141312',
        border: '1px solid #2a2825',
        borderRadius: '999px',
        overflow: 'hidden'
      }}>
        <div style={{
          width: `${safe}%`,
          height: '100%',
          background: color,
          borderRadius: '999px'
        }} />
      </div>
    </div>
  )
}

function ZetaTagGroup({ title, tags, color, emptyText }) {
  return (
    <div style={{ marginBottom: '13px' }}>
      <div style={{ color: '#66625a', fontSize: '11px', marginBottom: 7 }}>
        {title}
      </div>

      {tags.length === 0 ? (
        <div style={{ color: '#66625a', fontSize: '12px', lineHeight: 1.45 }}>
          {emptyText}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
          {tags.map(tag => (
            <Badge key={tag} color={color}>
              {getZetaTagLabel(tag)}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

function BehaviorSignalCard({ selectedStock, behaviorSignal, loading, error }) {
  if (loading) {
    return (
      <Panel style={{ marginBottom: '18px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          color: '#9a968c'
        }}>
          <span style={{ fontSize: 22 }}>⏳</span>
          <div>
            <strong style={{ color: '#e8e5df' }}>Fiyat davranışı okunuyor</strong>
            <div style={{ fontSize: '12px', marginTop: 3 }}>
              Son fiyat hareketi, oynaklık, hacim ilgisi ve yön belirsizliği değerlendiriliyor.
            </div>
          </div>
        </div>
      </Panel>
    )
  }

  if (error) {
    return (
      <Panel style={{ marginBottom: '18px', borderColor: '#ef444466' }}>
        <div style={{ color: '#fecaca', fontSize: '13px', lineHeight: 1.55 }}>
          <strong>Fiyat davranışı bilgisi alınamadı:</strong> {error}
        </div>
      </Panel>
    )
  }

  if (!behaviorSignal) return null

  const color = getBehaviorDirectionColor(behaviorSignal.directionBias)
  const warnings = behaviorSignal.warnings || []
  const metrics = behaviorSignal.metrics || {}

  const confidence = safeNumber(behaviorSignal.directionConfidence)
  const flatRisk = safeNumber(behaviorSignal.flatRisk)
  const momentum = safeNumber(behaviorSignal.momentumScore)
  const breakout = safeNumber(behaviorSignal.breakoutScore)
  const composite = safeNumber(behaviorSignal.directionComposite)

  return (
    <div style={{
      background: `radial-gradient(circle at top left, ${color}24, transparent 34%), linear-gradient(135deg, rgba(20,19,18,0.98), rgba(12,12,13,0.98))`,
      border: `1px solid ${color}66`,
      borderRadius: '22px',
      padding: '22px',
      marginBottom: '18px',
      boxShadow: `0 22px 52px ${color}10`,
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '18px',
        marginBottom: '18px',
        flexWrap: 'wrap'
      }}>
        <div>
          <div style={{ color: '#66625a', fontSize: '12px', marginBottom: 5 }}>
            {selectedStock?.symbol || 'Seçili Varlık'} · Fiyat Davranışı
          </div>

          <div style={{
            color,
            fontWeight: 'bold',
            fontSize: '25px',
            letterSpacing: '-0.5px',
            marginBottom: '7px'
          }}>
            {getBehaviorDirectionLabel(behaviorSignal.directionBias)}
          </div>

          <div style={{
            color: '#c7c3b8',
            fontSize: '13px',
            lineHeight: 1.6,
            maxWidth: 760
          }}>
            {getBehaviorInterpretation(behaviorSignal)}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Badge color={behaviorSignal.actionable ? GREEN : YELLOW}>
            {behaviorSignal.actionable ? 'Daha Net Sinyal' : 'Yardımcı Okuma'}
          </Badge>

          <Badge color={PURPLE}>
            Davranış Katmanı
          </Badge>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.1fr 0.9fr 0.9fr',
        gap: '16px',
        alignItems: 'stretch'
      }}>
        <div style={{
          background: '#0f0f10',
          border: '1px solid #2a2825',
          borderRadius: '16px',
          padding: '15px'
        }}>
          <div style={{ color: '#66625a', fontSize: '12px', marginBottom: 12 }}>
            Davranış Özeti
          </div>

          <BehaviorBar label="Genel yön eğilimi" value={composite} color={color} />
          <BehaviorBar label="Gidiş gücü" value={momentum} color={momentum >= 0 ? GREEN : RED} />
          <BehaviorBar label="Kopma baskısı" value={breakout} color={BLUE} positiveOnly />
        </div>

        <div style={{
          background: '#0f0f10',
          border: '1px solid #2a2825',
          borderRadius: '16px',
          padding: '15px'
        }}>
          <div style={{ color: '#66625a', fontSize: '12px', marginBottom: 12 }}>
            Güven ve Belirsizlik
          </div>

          <ScoreGauge
            label="Davranış Güveni"
            value={confidence}
            color={confidence >= 55 ? GREEN : YELLOW}
          />

          <ScoreGauge
            label="Net yön belirsizliği"
            value={flatRisk}
            color={flatRisk >= 75 ? RED : flatRisk >= 55 ? YELLOW : GREEN}
          />
        </div>

        <div style={{
          background: '#0f0f10',
          border: '1px solid #2a2825',
          borderRadius: '16px',
          padding: '15px'
        }}>
          <div style={{ color: '#66625a', fontSize: '12px', marginBottom: 12 }}>
            Piyasa Davranışı
          </div>

          <BehaviorInfo label="Trend" value={getBehaviorTrendLabel(behaviorSignal.trendState)} />
          <BehaviorInfo label="Hareketlilik" value={getBehaviorVolLabel(behaviorSignal.volatilityState)} />
          <BehaviorInfo label="Hacim ilgisi" value={getBehaviorVolumeLabel(behaviorSignal.volumePressure)} />
          <BehaviorInfo
            label="20 günlük hacim oranı"
            value={metrics.volumeRatio20 == null ? '-' : `${num(metrics.volumeRatio20, 2)}x`}
          />
        </div>
      </div>

      {warnings.length > 0 && (
        <div style={{
          borderTop: '1px solid #2a2825',
          marginTop: '16px',
          paddingTop: '14px',
          display: 'flex',
          gap: '7px',
          flexWrap: 'wrap'
        }}>
          {warnings.map(w => (
            <Badge key={w} color={w === 'HIGH_FLAT_RISK' ? RED : YELLOW}>
              {getBehaviorWarningLabel(w)}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

function BehaviorInfo({ label, value }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      gap: '10px',
      color: '#c7c3b8',
      fontSize: '13px',
      marginBottom: '9px'
    }}>
      <span style={{ color: '#66625a' }}>{label}</span>
      <strong style={{ textAlign: 'right' }}>{value}</strong>
    </div>
  )
}

function BehaviorBar({ label, value, color, positiveOnly = false }) {
  const safe = positiveOnly
    ? Math.max(0, Math.min(100, safeNumber(value)))
    : Math.max(-100, Math.min(100, safeNumber(value)))

  const width = positiveOnly
    ? safe
    : Math.abs(safe)

  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        color: '#9a968c',
        fontSize: '12px',
        marginBottom: 5
      }}>
        <span>{label}</span>
        <strong style={{ color }}>{num(safe, 2)}</strong>
      </div>

      <div style={{
        height: 9,
        background: '#141312',
        border: '1px solid #2a2825',
        borderRadius: '999px',
        overflow: 'hidden',
        position: 'relative'
      }}>
        {!positiveOnly && (
          <div style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            bottom: 0,
            width: 1,
            background: '#3a372f'
          }} />
        )}

        <div style={{
          width: `${width / (positiveOnly ? 1 : 2)}%`,
          height: '100%',
          background: color,
          borderRadius: '999px',
          marginLeft: positiveOnly
            ? 0
            : safe >= 0
              ? '50%'
              : `${50 - width / 2}%`
        }} />
      </div>
    </div>
  )
}


function ModelVsNaiveCard({ pm, pn, skill, selectedStock }) {
  const mapeSkill = safeNumber(skill?.mapeSkillPct)
  const rmseSkill = safeNumber(skill?.rmseSkillPct)

  const modelWinsMape = mapeSkill >= 0
  const modelWinsRmse = rmseSkill >= 0

  return (
    <Panel style={{ marginBottom: 0 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: '14px',
        alignItems: 'flex-start',
        marginBottom: '18px'
      }}>
        <div>
          <div style={{ color: '#66625a', fontSize: '12px', marginBottom: 4 }}>
            Ölçüm Sistemi
          </div>
          <h3 style={{ margin: 0, letterSpacing: '-0.4px' }}>
            Model vs Basit Karşılaştırma
          </h3>
        </div>

        <Badge color={modelWinsMape ? GREEN : RED}>
          {modelWinsMape ? 'Model MAPE’de önde' : 'Basit model MAPE’de önde'}
        </Badge>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px',
        marginBottom: '16px'
      }}>
        <CompareBox
          title="MAPE"
          model={pm?.mape}
          naive={pn?.mape}
          skill={mapeSkill}
          positive={modelWinsMape}
          formatter={(v) => pct(safeNumber(v) * 100, 2)}
        />

        <CompareBox
          title="RMSE"
          model={pm?.rmse}
          naive={pn?.rmse}
          skill={rmseSkill}
          positive={modelWinsRmse}
          formatter={(v) => money(v, selectedStock)}
        />
      </div>

      <div style={{
        color: '#9a968c',
        fontSize: '13px',
        lineHeight: 1.55,
        borderTop: '1px solid #2a2825',
        paddingTop: '13px'
      }}>
        Basit karşılaştırma modeli, “5 gün sonra fiyat bugünkü seviyeye yakın kalır” varsayımıdır.
        Ana modelin gerçek katkısı bu karşılaştırmayla okunur.
      </div>
    </Panel>
  )
}

function SignalHealthCard({ signal, pm }) {
  const confidence = safeNumber(signal?.directionConfidence) * 100
  const edge = safeNumber(signal?.directionEdge) * 100
  const actionRate = safeNumber(pm?.predictedActionRate)
  const directionScore = safeNumber(pm?.directionScore)

  return (
    <Panel style={{ marginBottom: 0 }}>
      <div style={{ color: '#66625a', fontSize: '12px', marginBottom: 4 }}>
        Karar Katmanı
      </div>

      <h3 style={{ margin: 0, marginBottom: '16px', letterSpacing: '-0.4px' }}>
        Sinyal Sağlığı
      </h3>

      <ScoreGauge
        label="Yön Skoru"
        value={directionScore}
        color={directionScore >= 50 ? GREEN : YELLOW}
      />

      <ScoreGauge
        label="Sinyal Sıklığı"
        value={actionRate}
        color={actionRate > 0 ? BLUE : GRAY}
      />

      <ScoreGauge
        label="Sinyal Güveni"
        value={confidence}
        color={confidence >= 55 ? GREEN : YELLOW}
      />

      <ScoreGauge
        label="Yön Ayrımı"
        value={edge}
        color={edge >= 10 ? GREEN : YELLOW}
      />
    </Panel>
  )
}

function ChartPanel({
  selectedStock,
  chartTitle,
  chartView,
  setChartView,
  scaleMode,
  setScaleMode,
  chartData,
  distributionData,
  axisSuffix,
  isReturnChart
}) {
  return (
    <Panel>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '17px',
        flexWrap: 'wrap',
        gap: '14px'
      }}>
        <div>
          <div style={{ color: '#66625a', fontSize: '12px', marginBottom: 4 }}>
            Grafik Alanı
          </div>

          <h3 style={{
            margin: 0,
            marginBottom: '5px',
            letterSpacing: '-0.4px'
          }}>
            {selectedStock?.symbol} — {chartTitle}
          </h3>

          <p style={{ color: '#66625a', fontSize: '12px', margin: 0 }}>
            Analiz servisinden gelen gerçek tarihli chartData verisi kullanılır. Arayüz tarafında tarih üretilmez.
          </p>
        </div>

        <div style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          justifyContent: 'flex-end'
        }}>
          <SegmentedButton
            value={chartView}
            setValue={setChartView}
            options={[
              ['scenario', 'Senaryo'],
              ['backtest', 'Backtest'],
              ['forecast', 'Forecast'],
              ['returns', 'Getiri'],
              ['error', 'Hata'],
              ['distribution', 'Dağılım']
            ]}
          />

          {chartView !== 'returns' && chartView !== 'error' && chartView !== 'distribution' && (
            <SegmentedButton
              value={scaleMode}
              setValue={setScaleMode}
              options={[
                ['price', 'Fiyat'],
                ['normalized', 'Normalize 100'],
                ['percent', '% Değişim']
              ]}
            />
          )}
        </div>
      </div>

      {chartView === 'distribution' ? (
        <DistributionPanel data={distributionData} />
      ) : (
        <ResponsiveContainer width="100%" height={440}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2825" />

            <XAxis
              dataKey="label"
              tick={{ fill: '#66625a', fontSize: 11 }}
              interval="preserveStartEnd"
            />

            <YAxis
              tick={{ fill: '#66625a', fontSize: 11 }}
              tickFormatter={v => `${Number(v).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}${axisSuffix}`}
              width={78}
            />

            {(chartView === 'returns' || chartView === 'error' || scaleMode === 'percent') && (
              <ReferenceLine y={0} stroke="#3a372f" strokeDasharray="4 4" />
            )}

            <Tooltip
              content={
                <CustomTooltip
                  asset={selectedStock}
                  mode={isReturnChart ? chartView : scaleMode}
                />
              }
            />

            <Legend wrapperStyle={{
              color: '#9a968c',
              fontSize: '13px',
              paddingTop: '10px'
            }} />

            {chartView === 'scenario' && scaleMode === 'price' && (
              <>
                <Area
                  dataKey="upper"
                  name="Üst Bant (q90)"
                  fill="#2dd4bf14"
                  stroke="#2dd4bf44"
                  strokeWidth={1}
                  dot={false}
                  activeDot={false}
                />
                <Area
                  dataKey="lower"
                  name="Alt Bant (q10)"
                  fill="#0c0c0d"
                  stroke="#2dd4bf44"
                  strokeWidth={1}
                  dot={false}
                  activeDot={false}
                />
              </>
            )}

            {(chartView === 'scenario' || chartView === 'backtest') && (
              <>
                <Line
                  dataKey="real"
                  name="Gerçek Fiyat"
                  stroke="#ffffff"
                  strokeWidth={2.4}
                  dot={false}
                  connectNulls={false}
                />

                <Line
                  dataKey="modelBacktest"
                  name="Model Backtest (T+5)"
                  stroke={RED}
                  strokeWidth={1.9}
                  strokeDasharray="4 4"
                  dot={false}
                  connectNulls={false}
                />

                <Line
                  dataKey="naive"
                  name="Basit Karşılaştırma"
                  stroke={YELLOW}
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  dot={false}
                  connectNulls={false}
                />
              </>
            )}

            {(chartView === 'scenario' || chartView === 'forecast') && (
              <>
                <Line
                  dataKey="forecastMean"
                  name="30G Medyan Senaryo"
                  stroke={BLUE}
                  strokeWidth={2.5}
                  strokeDasharray="6 3"
                  dot={false}
                  connectNulls={false}
                />

                {chartView === 'forecast' && (
                  <>
                    <Line
                      dataKey="upper"
                      name="Üst Bant (q90)"
                      stroke="#60a5fa"
                      strokeWidth={1.4}
                      dot={false}
                      connectNulls={false}
                    />
                    <Line
                      dataKey="lower"
                      name="Alt Bant (q10)"
                      stroke="#60a5fa"
                      strokeWidth={1.4}
                      dot={false}
                      connectNulls={false}
                    />
                  </>
                )}
              </>
            )}

            {chartView === 'returns' && (
              <>
                <Line
                  dataKey="actualReturn"
                  name="Gerçek 5G Getiri"
                  stroke="#ffffff"
                  strokeWidth={2.2}
                  dot={false}
                />
                <Line
                  dataKey="predictedReturn"
                  name="Model 5G Getiri"
                  stroke={RED}
                  strokeWidth={1.9}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </>
            )}

            {chartView === 'error' && (
              <>
                <Line
                  dataKey="modelError"
                  name="Model Hata %"
                  stroke={RED}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  dataKey="naiveError"
                  name="Basit Model Hata %"
                  stroke={YELLOW}
                  strokeWidth={2}
                  dot={false}
                />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </Panel>
  )
}

function DistributionMiniPanel({ data }) {
  return (
    <Panel>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '16px',
        gap: '12px',
        flexWrap: 'wrap'
      }}>
        <div>
          <div style={{ color: '#66625a', fontSize: '12px', marginBottom: 4 }}>
            Sınıf Dağılımı
          </div>
          <h3 style={{ margin: 0, letterSpacing: '-0.4px' }}>
            Gerçek / Model / Basit Karşılaştırma
          </h3>
        </div>

        <div style={{ color: '#66625a', fontSize: '12px', maxWidth: 420, lineHeight: 1.5 }}>
          Modelin net yön sınıfına fazla yüklenip yüklenmediğini veya tek yöne aşırı kayıp kaymadığını burada okuyabilirsiniz.
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '14px'
      }}>
        {data.map(row => (
          <DistributionCard key={row.name} row={row} />
        ))}
      </div>
    </Panel>
  )
}

function DistributionCard({ row }) {
  return (
    <div style={{
      background: '#0f0f10',
      border: '1px solid #2a2825',
      borderRadius: '16px',
      padding: '14px'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '10px'
      }}>
        <strong>{row.name}</strong>
        <span style={{ color: '#66625a', fontSize: '12px' }}>Aşağı / Nötr / Yukarı</span>
      </div>

      <div style={{
        height: 12,
        borderRadius: '999px',
        overflow: 'hidden',
        display: 'flex',
        background: '#141312',
        marginBottom: '10px'
      }}>
        <div style={{ width: `${row.down}%`, background: RED }} />
        <div style={{ width: `${row.flat}%`, background: GRAY }} />
        <div style={{ width: `${row.up}%`, background: GREEN }} />
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        color: '#9a968c',
        fontSize: '12px'
      }}>
        <span style={{ color: RED }}>↓ {pct(row.down)}</span>
        <span style={{ color: GRAY }}>→ {pct(row.flat)}</span>
        <span style={{ color: GREEN }}>↑ {pct(row.up)}</span>
      </div>
    </div>
  )
}

function DistributionPanel({ data }) {
  return (
    <div style={{ height: 360 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 16, right: 24, left: 20, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2825" />

          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fill: '#66625a' }}
            tickFormatter={v => `${v}%`}
          />

          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: '#c7c3b8', fontSize: 13 }}
            width={70}
          />

          <Tooltip
            formatter={(value, name) => [`${Number(value).toFixed(2)}%`, name]}
            contentStyle={{
              background: '#141312',
              border: '1px solid #2a2825',
              borderRadius: '12px',
              color: '#fff'
            }}
          />

          <Legend />

          <Bar dataKey="down" name="Aşağı" stackId="a" fill={RED} />
          <Bar dataKey="flat" name="Nötr" stackId="a" fill={GRAY} />
          <Bar dataKey="up" name="Yukarı" stackId="a" fill={GREEN} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function DetailsPanel({ prediction, pm, signal, detailsOpen, setDetailsOpen }) {
  return (
    <Panel>
      <button
        onClick={() => setDetailsOpen(v => !v)}
        style={{
          background: 'transparent',
          color: '#93c5fd',
          border: '1px solid #2a2825',
          borderRadius: '12px',
          padding: '10px 13px',
          cursor: 'pointer',
          fontWeight: 'bold'
        }}
      >
        {detailsOpen ? 'Model Detaylarını Gizle' : 'Model Detaylarını Göster'}
      </button>

      {detailsOpen && (
        <div style={{
          marginTop: '16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))',
          gap: '12px',
          color: '#c7c3b8',
          fontSize: '13px'
        }}>
          <Detail label="Model Versiyonu" value={prediction.modelVersion} />
          <Detail label="Aktif Feature" value={prediction.activeFeatures} />
          <Detail label="Sinyal Güveni" value={num(signal?.directionConfidence, 4)} />
          <Detail label="Yön Ayrımı Gücü" value={num(signal?.directionEdge, 4)} />
          <Detail label="Getiri Korelasyonu" value={num(pm?.returnCorrelation, 4)} />
          <Detail
            label="Ort. Tahmin Getirisi"
            value={pm?.meanPredictedReturn == null ? '-' : pct(pm.meanPredictedReturn * 100, 2)}
          />
          <Detail
            label="Ort. Gerçek Getirisi"
            value={pm?.meanRealReturn == null ? '-' : pct(pm.meanRealReturn * 100, 2)}
          />
          <Detail
            label="Yön Eşiği"
            value={pm?.directionThreshold == null ? '-' : pct(pm.directionThreshold * 100, 2)}
          />
          <Detail label="Sample Sayısı" value={pm?.samples ?? '-'} />
        </div>
      )}
    </Panel>
  )
}

function EmptyState({ selectedStock, loading }) {
  return (
    <Panel>
      <div style={{
        minHeight: 230,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        color: '#9a968c'
      }}>
        <div>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🧭</div>
          <h3 style={{ color: '#e8e5df', marginBottom: 8 }}>
            {selectedStock ? `${selectedStock.symbol} analize hazır` : 'Bir varlık seçerek başlayın'}
          </h3>
          <p style={{ maxWidth: 520, lineHeight: 1.6, margin: 0 }}>
            {loading
              ? 'Analiz hazırlanıyor. Sonuçlar tamamlandığında burada görünecek.'
              : 'Pusula AI, model çıktısını basit karşılaştırma modeliyle karşılaştırır ve düşük güvenli sonuçlarda işlem sinyali üretmez.'}
          </p>
        </div>
      </div>
    </Panel>
  )
}

function Toast({ toast }) {
  return (
    <div style={{
      position: 'fixed',
      top: '24px',
      right: '24px',
      transform: toast.show ? 'translateX(0)' : 'translateX(420px)',
      opacity: toast.show ? 1 : 0,
      transition: 'all 0.35s ease',
      background: toast.type === 'success' ? GREEN : RED,
      color: '#fff',
      padding: '14px 22px',
      borderRadius: '14px',
      boxShadow: '0 18px 35px rgba(0,0,0,0.45)',
      zIndex: 9999,
      fontWeight: 'bold',
      display: 'flex',
      alignItems: 'center',
      gap: '10px'
    }}>
      <span>{toast.type === 'success' ? '✅' : '❌'}</span>
      <span>{toast.message}</span>
    </div>
  )
}

function Panel({ children, style = {} }) {
  return (
    <div style={{
      background: 'linear-gradient(180deg, #141312 0%, #141312 100%)',
      border: '1px solid #2a2825',
      borderRadius: '20px',
      padding: '22px',
      marginBottom: '22px',
      boxShadow: '0 18px 40px rgba(0,0,0,0.22)',
      ...style
    }}>
      {children}
    </div>
  )
}

function MetricCard({ label, value, sub, color, icon }) {
  return (
    <div style={{
      background: 'linear-gradient(180deg, #141312 0%, #0f0f10 100%)',
      border: '1px solid #2a2825',
      borderRadius: '18px',
      padding: '16px',
      minHeight: '104px',
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
        fontSize: '25px',
        marginBottom: '7px',
        letterSpacing: '-0.4px'
      }}>
        {value}
      </div>

      <div style={{
        color: '#9a968c',
        fontSize: '12px',
        lineHeight: 1.4
      }}>
        {sub}
      </div>
    </div>
  )
}

function CompareBox({ title, model, naive, skill, positive, formatter }) {
  return (
    <div style={{
      background: '#0f0f10',
      border: '1px solid #2a2825',
      borderRadius: '16px',
      padding: '14px'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '11px'
      }}>
        <strong>{title}</strong>
        <span style={{
          color: positive ? GREEN : RED,
          fontWeight: 'bold'
        }}>
          {positive ? '+' : ''}{pct(skill)}
        </span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '8px'
      }}>
        <div>
          <div style={{ color: '#66625a', fontSize: '11px', marginBottom: 4 }}>Model</div>
          <div style={{ color: '#e8e5df', fontWeight: 'bold' }}>{formatter(model)}</div>
        </div>

        <div>
          <div style={{ color: '#66625a', fontSize: '11px', marginBottom: 4 }}>Basit model</div>
          <div style={{ color: '#e8e5df', fontWeight: 'bold' }}>{formatter(naive)}</div>
        </div>
      </div>
    </div>
  )
}

function HealthRow({ label, value, color }) {
  const safe = Math.max(0, Math.min(100, safeNumber(value)))

  return (
    <div style={{ marginBottom: '8px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '12px',
        color: '#9a968c',
        marginBottom: 4
      }}>
        <span>{label}</span>
        <strong style={{ color }}>{pct(safe)}</strong>
      </div>

      <div style={{
        height: 7,
        borderRadius: '999px',
        background: '#2a2825',
        overflow: 'hidden'
      }}>
        <div style={{
          width: `${safe}%`,
          height: '100%',
          background: color,
          borderRadius: '999px'
        }} />
      </div>
    </div>
  )
}

function ScoreGauge({ label, value, color }) {
  const safe = Math.max(0, Math.min(100, safeNumber(value)))

  return (
    <div style={{ marginBottom: '13px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        color: '#9a968c',
        fontSize: '12px',
        marginBottom: 5
      }}>
        <span>{label}</span>
        <strong style={{ color }}>{pct(safe)}</strong>
      </div>

      <div style={{
        height: 9,
        background: '#0f0f10',
        border: '1px solid #2a2825',
        borderRadius: '999px',
        overflow: 'hidden'
      }}>
        <div style={{
          width: `${safe}%`,
          height: '100%',
          background: `linear-gradient(90deg, ${color}, ${color}aa)`,
          borderRadius: '999px'
        }} />
      </div>
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
            padding: '7px 10px',
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

function Detail({ label, value }) {
  return (
    <div style={{
      background: '#0f0f10',
      border: '1px solid #2a2825',
      borderRadius: '13px',
      padding: '12px'
    }}>
      <div style={{ color: '#66625a', fontSize: '11px', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ color: '#e8e5df', fontWeight: 'bold' }}>
        {value ?? '-'}
      </div>
    </div>
  )
}

function Badge({ children, color }) {
  return (
    <span style={{
      color,
      border: `1px solid ${color}55`,
      background: `${color}18`,
      borderRadius: '999px',
      padding: '5px 9px',
      fontSize: '12px',
      fontWeight: 'bold'
    }}>
      {children}
    </span>
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
  padding: '13px 24px',
  color: '#fff',
  border: 'none',
  borderRadius: '13px',
  fontWeight: 'bold',
  fontSize: '14px',
  boxShadow: '0 14px 28px rgba(217,119,6,0.24)'
}

const searchBoxStyle = {
  position: 'absolute',
  top: 'calc(100% + 8px)',
  left: 0,
  right: 0,
  background: '#141312',
  border: '1px solid #2a2825',
  borderRadius: '14px',
  zIndex: 20,
  maxHeight: '260px',
  overflowY: 'auto',
  boxShadow: '0 24px 44px rgba(0,0,0,0.42)'
}

const searchItemStyle = {
  padding: '13px 16px',
  cursor: 'pointer',
  borderBottom: '1px solid #2a2825',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center'
}