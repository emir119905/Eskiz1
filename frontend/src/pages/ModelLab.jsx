import { useEffect, useMemo, useState } from 'react'
import { getStocks, getPrediction, getBehaviorSignal } from '../api/client'
import {
  pct,
  num,
  money,
  getBiasLabel,
  getBiasColor
} from '../utils/formatters'

const BLUE = '#3b82f6'
const GREEN = '#10b981'
const YELLOW = '#f59e0b'
const RED = '#ef4444'
const PURPLE = '#8b5cf6'
const GRAY = '#6b7280'

const PROBLEM_SET_IDS = [31, 32, 34, 4, 6, 28, 21, 3, 33]

function firstDefined(...values) {
  return values.find(v => v !== undefined && v !== null && v !== '')
}

function safeNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function normalizeStocks(payload) {
  if (!payload) return []
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload.$values)) return payload.$values
  return []
}

function formatSmartPct(value, digits = 2) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '-'

  const n = Number(value)

  // 0.34 gibi probability gelirse yüzdeye çevir.
  if (Math.abs(n) <= 1) return pct(n * 100, digits)

  // 34 gibi zaten yüzde gelirse olduğu gibi göster.
  return pct(n, digits)
}
function normalizeBehaviorSignal(payload) {
  if (!payload) return null

  if (payload.error) {
    return {
      error: String(payload.error),
      directionBias: null,
      actionable: false,
      warnings: []
    }
  }

  return {
    directionBias: payload.directionBias || null,
    tradeBias: payload.tradeBias || null,
    directionConfidence: payload.directionConfidence,
    flatRisk: payload.flatRisk,
    momentumScore: payload.momentumScore,
    breakoutScore: payload.breakoutScore,
    trendState: payload.trendState || null,
    volatilityState: payload.volatilityState || null,
    volumePressure: payload.volumePressure || null,
    actionable: Boolean(payload.actionable),
    warnings: Array.isArray(payload.warnings) ? payload.warnings : []
  }
}

function getBehaviorColor(directionBias, actionable = false) {
  if (directionBias === 'up') return actionable ? GREEN : '#86efac'
  if (directionBias === 'down') return actionable ? RED : '#fca5a5'
  if (directionBias === 'flat') return GRAY
  return YELLOW
}

function getBehaviorLabel(directionBias) {
  if (directionBias === 'up') return 'Yukarı Davranış'
  if (directionBias === 'down') return 'Aşağı Davranış'
  if (directionBias === 'flat') return 'Kararsız / Flat'
  return 'Okunamadı'
}

function getRegimeLabel(value) {
  const map = {
    trend_following: 'Trend Takip',
    mean_reverting: 'Ortalamaya Dönüş',
    choppy: 'Kararsız',
    choppy_high_vol: 'Kararsız / Yüksek Vol',
    low: 'Düşük',
    normal: 'Normal',
    high: 'Yüksek'
  }

  return map[value] || value || '-'
}

function getPredictionMetrics(stock, prediction, behaviorSignal = null) {
  const pm = prediction?.practicalHorizonMetrics || {}
  const pn = prediction?.practicalNaiveMetrics || {}
  const skill = prediction?.practicalSkillVsNaive || {}
  const signal = prediction?.signalQuality || {}

  const predictedDist =
    pm.predictedClassDistribution ||
    prediction?.predictedClassDistribution ||
    {}

  const actualDist =
    pm.actualClassDistribution ||
    prediction?.actualClassDistribution ||
    {}

  const probDown = firstDefined(
    prediction?.probDown,
    signal?.probDown,
    predictedDist?.downPct != null ? predictedDist.downPct / 100 : null
  )

  const probFlat = firstDefined(
    prediction?.probFlat,
    signal?.probFlat,
    predictedDist?.flatPct != null ? predictedDist.flatPct / 100 : null
  )

  const probUp = firstDefined(
    prediction?.probUp,
    signal?.probUp,
    predictedDist?.upPct != null ? predictedDist.upPct / 100 : null
  )

  const directionScore = firstDefined(
    pm.directionScore,
    prediction?.directionScore
  )

  const rawDirectionScore = firstDefined(
    pm.rawDirectionScore,
    prediction?.rawDirectionScore
  )

  const actionRate = firstDefined(
    pm.predictedActionRate,
    prediction?.predictedActionRate,
    predictedDist?.upPct != null || predictedDist?.downPct != null
      ? safeNumber(predictedDist.upPct) + safeNumber(predictedDist.downPct)
      : null
  )

  const flatRate = firstDefined(
    predictedDist?.flatPct,
    probFlat != null ? Number(probFlat) * 100 : null
  )

  const mape = firstDefined(pm.mape, prediction?.mape)
  const rmse = firstDefined(pm.rmse, prediction?.rmse)

  const naiveMape = firstDefined(pn.mape, prediction?.naiveMape)
  const naiveRmse = firstDefined(pn.rmse, prediction?.naiveRmse)

  const mapeSkill = firstDefined(
    skill.mapeSkillPct,
    prediction?.mapeSkillPct
  )

  const rmseSkill = firstDefined(
    skill.rmseSkillPct,
    prediction?.rmseSkillPct
  )

  const tradeBias = firstDefined(
    signal.tradeBias,
    prediction?.tradeBias,
    'LOW_CONFIDENCE_OR_NO_TRADE'
  )

  const signalTopDirection = firstDefined(
    signal.topDirection,
    signal.signalTopDirection,
    prediction?.signalTopDirection,
    '-'
  )

  const signalConfidence = firstDefined(
    signal.directionConfidence,
    signal.signalConfidence,
    prediction?.signalConfidence
  )

  const signalEdge = firstDefined(
    signal.directionEdge,
    signal.signalEdge,
    prediction?.signalEdge
  )
  const behavior = normalizeBehaviorSignal(behaviorSignal)
  const riskTags = []

  if (safeNumber(actionRate) <= 1) {
    riskTags.push('FLAT_COLLAPSE')
  }

  if (safeNumber(flatRate) >= 85) {
    riskTags.push('HIGH_FLAT_RATE')
  }

  if (directionScore != null && safeNumber(directionScore) < 45) {
    riskTags.push('LOW_DIRECTION')
  }

  if (mapeSkill != null && safeNumber(mapeSkill) < 0) {
    riskTags.push('LOSES_TO_NAIVE')
  }

  if (safeNumber(actionRate) >= 85) {
    riskTags.push('OVER_ACTIVE')
  }

  if (safeNumber(signalEdge) < 0.03) {
    riskTags.push('LOW_EDGE')
  }

  const behaviorHasActionableDirection = (
    behavior?.actionable === true &&
    behavior?.directionBias &&
    behavior.directionBias !== 'flat'
  )

  // Sert ayrışma: ana model tamamen flat/action yok, behavior katmanı net yön görüyor.
  if (behaviorHasActionableDirection && safeNumber(actionRate) <= 1) {
    riskTags.push('V12_DIVERGENCE')
  }

  // Daha yumuşak ayrışma: ana model zayıf ama behavior katmanı güçlü yön sinyali veriyor.
  if (
    behaviorHasActionableDirection &&
    safeNumber(actionRate) > 1 &&
    (
      safeNumber(directionScore) < 25 ||
      safeNumber(actionRate) < 35 ||
      safeNumber(mapeSkill) < 0
    )
  ) {
    riskTags.push('BEHAVIOR_STRONG_MODEL_WEAK')
  }

  if (behavior?.flatRisk != null && safeNumber(behavior.flatRisk) >= 75) {
    riskTags.push('BEHAVIOR_FLAT_RISK')
  }

  if (behavior?.directionConfidence != null && safeNumber(behavior.directionConfidence) < 45) {
    riskTags.push('BEHAVIOR_LOW_CONF')
  }
  const quality =
    riskTags.includes('FLAT_COLLAPSE') || riskTags.includes('LOW_DIRECTION')
      ? 'problem'
      : safeNumber(directionScore) >= 55 && safeNumber(mapeSkill) >= 0
        ? 'good'
        : 'watch'

  return {
    stockID: stock.stockID,
    symbol: stock.symbol,
    companyName: stock.companyName,
    sector: stock.sector,

    modelVersion: prediction?.modelVersion || '-',
    featureSelectionMode: prediction?.featureSelectionMode || '-',

    confidenceScore: prediction?.confidenceScore,
    directionScore,
    rawDirectionScore,
    actionRate,
    directionCoverage: firstDefined(pm.directionCoverage, prediction?.directionCoverage),
    threeClassAccuracy: firstDefined(pm.threeClassAccuracy, prediction?.threeClassAccuracy),

    mape,
    rmse,
    naiveMape,
    naiveRmse,
    mapeSkill,
    rmseSkill,

    tradeBias,
    signalTopDirection,
    signalConfidence,
    signalEdge,

    probDown,
    probFlat,
    probUp,

    actualDownPct: actualDist?.downPct,
    actualFlatPct: actualDist?.flatPct,
    actualUpPct: actualDist?.upPct,

    predictedDownPct: predictedDist?.downPct,
    predictedFlatPct: predictedDist?.flatPct,
    predictedUpPct: predictedDist?.upPct,

    q50_5d: prediction?.q50_5d,
    q50_10d: prediction?.q50_10d,
    q50_20d: prediction?.q50_20d,
    q50_30d: prediction?.q50_30d,
    q10_30d: prediction?.q10_30d,
    q90_30d: prediction?.q90_30d,

    riskTags,
    quality,

    behaviorDirectionBias: behavior?.directionBias,
    behaviorTradeBias: behavior?.tradeBias,
    behaviorConfidence: behavior?.directionConfidence,
    behaviorFlatRisk: behavior?.flatRisk,
    behaviorMomentumScore: behavior?.momentumScore,
    behaviorBreakoutScore: behavior?.breakoutScore,
    behaviorTrendState: behavior?.trendState,
    behaviorVolatilityState: behavior?.volatilityState,
    behaviorVolumePressure: behavior?.volumePressure,
    behaviorActionable: behavior?.actionable,
    behaviorWarnings: behavior?.warnings || [],
    behaviorError: behavior?.error,
    error: null
  }
}

function getQualityBadge(row) {
  if (row.error) {
    return { label: 'Hata', color: RED, bg: '#ef444418' }
  }

  if (row.quality === 'good') {
    return { label: 'İyi', color: GREEN, bg: '#10b98118' }
  }

  if (row.quality === 'problem') {
    return { label: 'Problem', color: RED, bg: '#ef444418' }
  }

  return { label: 'İzle', color: YELLOW, bg: '#f59e0b18' }
}

function getRiskLabel(tag) {
  const map = {
    FLAT_COLLAPSE: 'Flat Collapse',
    HIGH_FLAT_RATE: 'Flat Baskın',
    LOW_DIRECTION: 'Düşük Yön',
    LOSES_TO_NAIVE: 'Naive Altı',
    OVER_ACTIVE: 'Aşırı Aktif',
    LOW_EDGE: 'Düşük Edge',
    V12_DIVERGENCE: 'v12 Ayrışma',
    BEHAVIOR_FLAT_RISK: 'Davranış Flat Riski',
    BEHAVIOR_LOW_CONF: 'Davranış Güveni Düşük',
    BEHAVIOR_STRONG_MODEL_WEAK: 'Davranış Güçlü / Model Zayıf',
    REQUEST_FAILED: 'İstek Hatası'
  }

  return map[tag] || tag
}

export default function ModelLab() {
  const [stocks, setStocks] = useState([])
  const [loadingStocks, setLoadingStocks] = useState(true)
  const [selectedIds, setSelectedIds] = useState(new Set(PROBLEM_SET_IDS))
  const [query, setQuery] = useState('')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [results, setResults] = useState([])
  const [message, setMessage] = useState('')
  const [resultFilter, setResultFilter] = useState('all')
  const [sortKey, setSortKey] = useState('quality')

  useEffect(() => {
    loadStocks()
  }, [])

  async function loadStocks() {
    setLoadingStocks(true)

    try {
      const res = await getStocks()
      const list = normalizeStocks(res.data)
      setStocks(list)

      const availableProblemIds = new Set(
        list
          .filter(s => PROBLEM_SET_IDS.includes(s.stockID))
          .map(s => s.stockID)
      )

      setSelectedIds(availableProblemIds)
    } catch (e) {
      setMessage('❌ Hisse listesi alınamadı: ' + e.message)
    } finally {
      setLoadingStocks(false)
    }
  }

  function toggleStock(stockID) {
    setSelectedIds(prev => {
      const next = new Set(prev)

      if (next.has(stockID)) next.delete(stockID)
      else next.add(stockID)

      return next
    })
  }

  function selectProblemSet() {
    const ids = new Set(
      stocks
        .filter(s => PROBLEM_SET_IDS.includes(s.stockID))
        .map(s => s.stockID)
    )

    setSelectedIds(ids)
  }

  function selectVisible() {
    setSelectedIds(new Set(filteredStocks.map(s => s.stockID)))
  }

  function selectAll() {
    setSelectedIds(new Set(stocks.map(s => s.stockID)))
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  async function runBatch() {
    const selectedStocks = stocks.filter(s => selectedIds.has(s.stockID))

    if (selectedStocks.length === 0) {
      setMessage('❌ Önce en az bir hisse seç.')
      return
    }

    const ok = window.confirm(
      `${selectedStocks.length} hisse analiz edilecek. İlk kez çalışıyorsa bazı modeller yeniden eğitilebilir ve işlem uzun sürebilir. Başlayalım mı?`
    )

    if (!ok) return

    setRunning(true)
    setResults([])
    setMessage('⏳ Batch analiz başladı...')
    setProgress({ done: 0, total: selectedStocks.length })

    const nextResults = []

    for (let i = 0; i < selectedStocks.length; i++) {
      const stock = selectedStocks[i]

      try {
        setMessage(`⏳ ${stock.symbol} analiz ediliyor... (${i + 1}/${selectedStocks.length})`)

        const [predictionRes, behaviorRes] = await Promise.all([
          getPrediction(stock.stockID),
          getBehaviorSignal(stock.stockID).catch(err => ({
            data: {
              error: err.response?.data?.detail || err.response?.data || err.message
            }
          }))
        ])

        const row = getPredictionMetrics(stock, predictionRes.data, behaviorRes.data)

        nextResults.push(row)
        setResults([...nextResults])
      } catch (e) {
        const err = e.response?.data?.detail || e.response?.data || e.message

        nextResults.push({
          stockID: stock.stockID,
          symbol: stock.symbol,
          companyName: stock.companyName,
          sector: stock.sector,
          riskTags: ['REQUEST_FAILED'],
          quality: 'problem',
          error: String(err)
        })

        setResults([...nextResults])
      } finally {
        setProgress({ done: i + 1, total: selectedStocks.length })
      }
    }

    setRunning(false)
    setMessage('✅ Batch analiz tamamlandı.')
  }

  async function copyResultsJson() {
    const compact = sortedResults.map(r => ({
      stockID: r.stockID,
      symbol: r.symbol,
      quality: r.quality,
      directionScore: r.directionScore,
      rawDirectionScore: r.rawDirectionScore,
      actionRate: r.actionRate,
      mape: r.mape,
      rmse: r.rmse,
      mapeSkill: r.mapeSkill,
      rmseSkill: r.rmseSkill,
      tradeBias: r.tradeBias,
      signalTopDirection: r.signalTopDirection,
      signalConfidence: r.signalConfidence,
      signalEdge: r.signalEdge,
      probDown: r.probDown,
      probFlat: r.probFlat,
      probUp: r.probUp,
      q50_30d: r.q50_30d,
      behaviorDirectionBias: r.behaviorDirectionBias,
      behaviorConfidence: r.behaviorConfidence,
      behaviorFlatRisk: r.behaviorFlatRisk,
      behaviorMomentumScore: r.behaviorMomentumScore,
      behaviorBreakoutScore: r.behaviorBreakoutScore,
      behaviorTrendState: r.behaviorTrendState,
      behaviorVolatilityState: r.behaviorVolatilityState,
      behaviorActionable: r.behaviorActionable,
      behaviorWarnings: r.behaviorWarnings,
      behaviorError: r.behaviorError,
      riskTags: r.riskTags,
      error: r.error
    }))

    try {
      await navigator.clipboard.writeText(JSON.stringify(compact, null, 2))
      setMessage('✅ Batch sonuçları JSON olarak panoya kopyalandı.')
    } catch {
      setMessage('❌ JSON panoya kopyalanamadı.')
    }
  }

  const filteredStocks = useMemo(() => {
    const q = query.trim().toLowerCase()

    return stocks.filter(s => {
      return (
        !q ||
        String(s.symbol || '').toLowerCase().includes(q) ||
        String(s.companyName || '').toLowerCase().includes(q) ||
        String(s.sector || '').toLowerCase().includes(q)
      )
    })
  }, [stocks, query])

  const resultStats = useMemo(() => {
    const total = results.length
    const successful = results.filter(r => !r.error)
    const problem = results.filter(r => r.quality === 'problem').length
    const good = results.filter(r => r.quality === 'good').length
    const watch = results.filter(r => r.quality === 'watch').length

    const avgDirection = successful.length
      ? successful.reduce((acc, r) => acc + safeNumber(r.directionScore), 0) / successful.length
      : 0

    const avgActionRate = successful.length
      ? successful.reduce((acc, r) => acc + safeNumber(r.actionRate), 0) / successful.length
      : 0

    const avgMapeSkill = successful.length
      ? successful.reduce((acc, r) => acc + safeNumber(r.mapeSkill), 0) / successful.length
      : 0

    const flatCollapse = results.filter(r => r.riskTags?.includes('FLAT_COLLAPSE')).length
    const behaviorDivergence = results.filter(r => r.riskTags?.includes('V12_DIVERGENCE')).length
    const behaviorActionable = results.filter(r => r.behaviorActionable === true).length

    return {
      total,
      successful: successful.length,
      problem,
      good,
      watch,
      avgDirection,
      avgActionRate,
      avgMapeSkill,
      flatCollapse,
      behaviorDivergence,
      behaviorActionable
    }
  }, [results])

  const filteredResults = useMemo(() => {
    return results.filter(r => {
      if (resultFilter === 'all') return true
      if (resultFilter === 'problem') return r.quality === 'problem'
      if (resultFilter === 'good') return r.quality === 'good'
      if (resultFilter === 'flat') return r.riskTags?.includes('FLAT_COLLAPSE') || safeNumber(r.predictedFlatPct) >= 85
      if (resultFilter === 'behavior') {
        return (
          r.riskTags?.includes('V12_DIVERGENCE') ||
          r.riskTags?.includes('BEHAVIOR_STRONG_MODEL_WEAK') ||
          r.behaviorActionable === true
        )
      }
      if (resultFilter === 'naive') return safeNumber(r.mapeSkill) < 0
      return true
    })
  }, [results, resultFilter])

  const sortedResults = useMemo(() => {
    const arr = [...filteredResults]

    arr.sort((a, b) => {
      if (sortKey === 'quality') {
        const order = { problem: 0, watch: 1, good: 2 }
        return (order[a.quality] ?? 9) - (order[b.quality] ?? 9)
      }

      if (sortKey === 'direction') {
        return safeNumber(a.directionScore) - safeNumber(b.directionScore)
      }

      if (sortKey === 'action') {
        return safeNumber(a.actionRate) - safeNumber(b.actionRate)
      }

      if (sortKey === 'mapeSkill') {
        return safeNumber(a.mapeSkill) - safeNumber(b.mapeSkill)
      }

      if (sortKey === 'symbol') {
        return String(a.symbol).localeCompare(String(b.symbol))
      }

      return 0
    })

    return arr
  }, [filteredResults, sortKey])

  const progressPct = progress.total
    ? (progress.done / progress.total) * 100
    : 0

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
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: '14px',
  marginBottom: '22px'
}}>
        <StatCard label="Analiz Edilen" value={resultStats.total} color={BLUE} icon="📦" />
        <StatCard label="Ortalama Yön" value={pct(resultStats.avgDirection)} color={resultStats.avgDirection >= 50 ? GREEN : YELLOW} icon="🧭" />
        <StatCard label="Ortalama Action" value={pct(resultStats.avgActionRate)} color={resultStats.avgActionRate > 0 ? PURPLE : GRAY} icon="⚡" />
        <StatCard label="Flat Collapse" value={resultStats.flatCollapse} color={resultStats.flatCollapse > 0 ? RED : GREEN} icon="🧊" />
        <StatCard
          label="v12 Ayrışma"
          value={resultStats.behaviorDivergence}
          color={resultStats.behaviorDivergence > 0 ? YELLOW : GREEN}
          icon="🧪"
        />
        <StatCard label="MAPE Skill Ort." value={pct(resultStats.avgMapeSkill)} color={resultStats.avgMapeSkill >= 0 ? GREEN : RED} icon="⚔️" />
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
              Batch Test Alanı
            </div>
            <h3 style={{ margin: 0, letterSpacing: '-0.4px' }}>
              Model Laboratuvarı
            </h3>
            <p style={{
              color: '#9ca3af',
              fontSize: '13px',
              marginTop: '7px',
              maxWidth: 760,
              lineHeight: 1.55
            }}>
              Birden fazla hisseyi sırayla analiz ederek directionScore, actionRate, MAPE skill ve tradeBias değerlerini karşılaştırır.
              Özellikle flat’e kaçan veya naive baseline’ı yenemeyen hisseleri hızlıca yakalamak için tasarlandı.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={selectProblemSet} disabled={running} style={secondaryButton}>
              Problem Set
            </button>
            <button onClick={selectVisible} disabled={running} style={secondaryButton}>
              Görünenleri Seç
            </button>
            <button onClick={selectAll} disabled={running} style={secondaryButton}>
              Tümünü Seç
            </button>
            <button onClick={clearSelection} disabled={running} style={secondaryButton}>
              Temizle
            </button>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(260px, 1fr) auto',
          gap: '12px',
          alignItems: 'center',
          marginBottom: '16px'
        }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Hisse, şirket veya sektör ara..."
            style={inputStyle}
          />

          <button
            onClick={runBatch}
            disabled={running || selectedIds.size === 0}
            style={{
              ...primaryButton,
              opacity: running || selectedIds.size === 0 ? 0.65 : 1,
              cursor: running || selectedIds.size === 0 ? 'not-allowed' : 'pointer'
            }}
          >
            {running ? '⏳ Analiz Sürüyor...' : `🚀 Batch Analiz Başlat (${selectedIds.size})`}
          </button>
        </div>

        {running && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              color: '#9ca3af',
              fontSize: '12px',
              marginBottom: 6
            }}>
              <span>İlerleme</span>
              <strong>{progress.done}/{progress.total}</strong>
            </div>

            <div style={{
              height: 10,
              borderRadius: '999px',
              overflow: 'hidden',
              background: '#0b1220',
              border: '1px solid #1f2937'
            }}>
              <div style={{
                height: '100%',
                width: `${progressPct}%`,
                background: 'linear-gradient(90deg, #2563eb, #7c3aed)',
                transition: 'width 0.25s ease'
              }} />
            </div>
          </div>
        )}

        {loadingStocks ? (
          <LoadingState />
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
            gap: '10px',
            maxHeight: '330px',
            overflowY: 'auto',
            paddingRight: '4px'
          }}>
            {filteredStocks.map(stock => {
              const selected = selectedIds.has(stock.stockID)

              return (
                <button
                  key={stock.stockID}
                  onClick={() => toggleStock(stock.stockID)}
                  disabled={running}
                  style={{
                    textAlign: 'left',
                    background: selected ? '#2563eb22' : '#0b1220',
                    border: selected ? '1px solid #3b82f6' : '1px solid #1f2937',
                    borderRadius: '14px',
                    padding: '12px',
                    color: '#d1d5db',
                    cursor: running ? 'not-allowed' : 'pointer'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '8px',
                    marginBottom: '5px'
                  }}>
                    <strong style={{ color: selected ? '#93c5fd' : '#f9fafb' }}>
                      {stock.symbol}
                    </strong>
                    <span style={{
                      color: selected ? GREEN : GRAY,
                      fontSize: '12px'
                    }}>
                      {selected ? 'Seçili' : 'Boş'}
                    </span>
                  </div>

                  <div style={{
                    color: '#6b7280',
                    fontSize: '12px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {stock.companyName}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </Panel>

      <Panel>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '14px',
          flexWrap: 'wrap',
          marginBottom: '18px',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ color: '#6b7280', fontSize: '12px', marginBottom: 4 }}>
              Sonuçlar
            </div>
            <h3 style={{ margin: 0, letterSpacing: '-0.4px' }}>
              Batch Analiz Tablosu
            </h3>
          </div>

          <div style={{
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
            justifyContent: 'flex-end'
          }}>
            <SegmentedButton
              value={resultFilter}
              setValue={setResultFilter}
              options={[
                ['all', 'Tümü'],
                ['problem', 'Problem'],
                ['flat', 'Flat'],
                ['behavior', 'Davranış'],
                ['naive', 'Naive Altı'],
                ['good', 'İyi']
              ]}  
            />

            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value)}
              style={selectStyle}
            >
              <option value="quality">Risk Öncelikli</option>
              <option value="direction">Yön Skoru Artan</option>
              <option value="action">Action Rate Artan</option>
              <option value="mapeSkill">MAPE Skill Artan</option>
              <option value="symbol">Sembol</option>
            </select>

            <button
              onClick={copyResultsJson}
              disabled={results.length === 0}
              style={{
                ...secondaryButton,
                opacity: results.length === 0 ? 0.6 : 1
              }}
            >
              JSON Kopyala
            </button>
          </div>
        </div>

        {sortedResults.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '13px'
            }}>
              <thead>
                <tr style={{
                  borderBottom: '1px solid #1f2937',
                  color: '#9ca3af',
                  textAlign: 'left'
                }}>
                  <th style={th}>Hisse</th>
                  <th style={th}>Kalite</th>
                  <th style={th}>Bias</th>
                  <th style={th}>Yön</th>
                  <th style={th}>Action</th>
                  <th style={th}>MAPE Skill</th>
                  <th style={th}>MAPE</th>
                  <th style={th}>30G q50</th>
                  <th style={th}>Down / Flat / Up</th>
                  <th style={th}>v12-alpha Davranış</th>
                  <th style={th}>Risk Etiketleri</th>
                </tr>
              </thead>

              <tbody>
                {sortedResults.map(row => {
                  const quality = getQualityBadge(row)
                  const biasColor = getBiasColor(row.tradeBias)

                  return (
                    <tr
                      key={row.stockID}
                      style={{
                        borderBottom: '1px solid #1f2937',
                        color: '#d1d5db'
                      }}
                    >
                      <td style={td}>
                        <div style={{ fontWeight: 'bold', color: '#f9fafb' }}>{row.symbol}</div>
                        <div style={{ color: '#6b7280', fontSize: '11px' }}>
                          ID: {row.stockID}
                        </div>
                      </td>

                      <td style={td}>
                        <Badge color={quality.color} bg={quality.bg}>
                          {quality.label}
                        </Badge>
                      </td>

                      <td style={td}>
                        <div style={{ color: biasColor, fontWeight: 'bold' }}>
                          {getBiasLabel(row.tradeBias)}
                        </div>
                        <div style={{ color: '#6b7280', fontSize: '11px', marginTop: 3 }}>
                          {row.signalTopDirection} · conf {formatSmartPct(row.signalConfidence)}
                        </div>
                      </td>

                      <td style={td}>
                        <strong style={{
                          color: safeNumber(row.directionScore) >= 50 ? GREEN : RED
                        }}>
                          {pct(row.directionScore)}
                        </strong>
                        <div style={{ color: '#6b7280', fontSize: '11px', marginTop: 3 }}>
                          raw {pct(row.rawDirectionScore)}
                        </div>
                      </td>

                      <td style={td}>
                        <strong style={{
                          color: safeNumber(row.actionRate) > 0 ? BLUE : GRAY
                        }}>
                          {pct(row.actionRate)}
                        </strong>
                        <div style={{ color: '#6b7280', fontSize: '11px', marginTop: 3 }}>
                          coverage {pct(row.directionCoverage)}
                        </div>
                      </td>

                      <td style={td}>
                        <strong style={{
                          color: safeNumber(row.mapeSkill) >= 0 ? GREEN : RED
                        }}>
                          {pct(row.mapeSkill)}
                        </strong>
                        <div style={{ color: '#6b7280', fontSize: '11px', marginTop: 3 }}>
                          rmse skill {pct(row.rmseSkill)}
                        </div>
                      </td>

                      <td style={td}>
                        {row.mape == null ? '-' : pct(Number(row.mape) * 100)}
                        <div style={{ color: '#6b7280', fontSize: '11px', marginTop: 3 }}>
                          rmse {row.rmse == null ? '-' : money(row.rmse, row.symbol)}
                        </div>
                      </td>

                      <td style={td}>
                        <strong style={{
                          color: safeNumber(row.q50_30d) >= 0 ? GREEN : RED
                        }}>
                          {row.q50_30d == null ? '-' : pct(Number(row.q50_30d) * 100)}
                        </strong>
                        <div style={{ color: '#6b7280', fontSize: '11px', marginTop: 3 }}>
                          {row.modelVersion}
                        </div>
                      </td>

                      <td style={td}>
                        <div style={{
                          display: 'flex',
                          gap: '5px',
                          alignItems: 'center',
                          minWidth: 145
                        }}>
                          <MiniProb color={RED} value={row.probDown} />
                          <MiniProb color={GRAY} value={row.probFlat} />
                          <MiniProb color={GREEN} value={row.probUp} />
                        </div>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          color: '#6b7280',
                          fontSize: '10px',
                          marginTop: 4
                        }}>
                          <span>D</span>
                          <span>F</span>
                          <span>U</span>
                        </div>
                      </td>
                      <td style={td}>
                        <BehaviorCell row={row} />
                      </td>
                      <td style={td}>
                        {row.error ? (
                          <span style={{ color: RED }}>{row.error}</span>
                        ) : row.riskTags?.length > 0 ? (
                          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                            {row.riskTags.map(tag => (
                              <Badge
                                key={tag}
                                color={
                                  tag === 'LOW_EDGE' || tag === 'BEHAVIOR_STRONG_MODEL_WEAK'
                                    ? YELLOW
                                    : tag === 'V12_DIVERGENCE'
                                      ? PURPLE
                                      : RED
                                }
                                bg={
                                  tag === 'LOW_EDGE' || tag === 'BEHAVIOR_STRONG_MODEL_WEAK'
                                    ? '#f59e0b18'
                                    : tag === 'V12_DIVERGENCE'
                                      ? '#8b5cf618'
                                      : '#ef444418'
                                }
                              >
                                {getRiskLabel(tag)}
                              </Badge>
                                
                            ))}
                          </div>
                        ) : (
                          <Badge color={GREEN} bg="#10b98118">Temiz</Badge>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyResults />
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
        color: '#6b7280',
        fontSize: '13px',
        marginBottom: '8px'
      }}>
        <span style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: PURPLE,
          boxShadow: `0 0 18px ${PURPLE}`
        }} />
        Pusula AI · Model Laboratuvarı
      </div>

      <h2 style={{
        margin: 0,
        letterSpacing: '-0.8px',
        fontSize: '31px'
      }}>
        🧪 Model Laboratuvarı
      </h2>

      <p style={{
        color: '#9ca3af',
        marginTop: '9px',
        maxWidth: '860px',
        lineHeight: 1.6
      }}>
        Model sürümlerinin davranışını toplu test etmek, flat kaçışlarını yakalamak ve v12 yön motoru için problemli hisseleri işaretlemek amacıyla hazırlanmış deney paneli.
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

function Badge({ children, color, bg }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      color,
      background: bg,
      border: `1px solid ${color}44`,
      borderRadius: '999px',
      padding: '5px 8px',
      fontSize: '11px',
      fontWeight: 'bold',
      whiteSpace: 'nowrap'
    }}>
      {children}
    </span>
  )
}

function BehaviorCell({ row }) {
  if (row.behaviorError) {
    return (
      <div style={{ color: YELLOW, fontSize: '12px', maxWidth: 220, whiteSpace: 'normal' }}>
        Behavior okunamadı: {row.behaviorError}
      </div>
    )
  }

  const color = getBehaviorColor(row.behaviorDirectionBias, row.behaviorActionable)

  return (
    <div style={{ minWidth: 185 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '7px',
        marginBottom: '6px'
      }}>
        <span style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 12px ${color}`
        }} />

        <strong style={{ color }}>
          {getBehaviorLabel(row.behaviorDirectionBias)}
        </strong>
      </div>

      <div style={{
        color: '#9ca3af',
        fontSize: '11px',
        lineHeight: 1.45
      }}>
        Güven: {pct(row.behaviorConfidence)} · Flat Risk: {pct(row.behaviorFlatRisk)}
      </div>

      <div style={{
        color: '#6b7280',
        fontSize: '11px',
        lineHeight: 1.45,
        marginTop: 3
      }}>
        Mom {num(row.behaviorMomentumScore, 1)} · Break {num(row.behaviorBreakoutScore, 1)}
      </div>

      <div style={{
        color: '#6b7280',
        fontSize: '11px',
        lineHeight: 1.45,
        marginTop: 3
      }}>
        {getRegimeLabel(row.behaviorTrendState)} / {getRegimeLabel(row.behaviorVolatilityState)}
      </div>

      {row.behaviorActionable && (
        <div style={{
          color: '#c4b5fd',
          fontSize: '11px',
          marginTop: 5,
          fontWeight: 'bold'
        }}>
          Deneysel aksiyon sinyali
        </div>
      )}
    </div>
  )
}

function MiniProb({ color, value }) {
  const safe = Math.max(0, Math.min(100, safeNumber(value) <= 1 ? safeNumber(value) * 100 : safeNumber(value)))

  return (
    <div style={{
      flex: 1,
      height: 10,
      background: '#111827',
      borderRadius: '999px',
      overflow: 'hidden',
      border: '1px solid #1f2937'
    }}>
      <div style={{
        width: `${safe}%`,
        height: '100%',
        background: color,
        borderRadius: '999px'
      }} />
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
        <h3 style={{ margin: 0, color: '#e5e7eb' }}>Hisse listesi yükleniyor</h3>
        <p style={{ marginTop: 8 }}>Model Laboratuvarı analiz evrenini hazırlıyor...</p>
      </div>
    </div>
  )
}

function EmptyResults() {
  return (
    <div style={{
      minHeight: 260,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#9ca3af',
      textAlign: 'center'
    }}>
      <div>
        <div style={{ fontSize: 44, marginBottom: 12 }}>🧪</div>
        <h3 style={{ margin: 0, color: '#e5e7eb' }}>Henüz batch sonucu yok</h3>
        <p style={{ marginTop: 8, maxWidth: 520, lineHeight: 1.55 }}>
          Problem set veya istediğin hisseleri seçip batch analizi başlat. Sonuçlar burada directionScore, actionRate ve naive karşılaştırmasıyla listelenecek.
        </p>
      </div>
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

const selectStyle = {
  padding: '10px 12px',
  background: '#0b1220',
  border: '1px solid #1f2937',
  borderRadius: '12px',
  color: '#d1d5db',
  fontSize: '12px',
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
  padding: '11px 14px',
  color: '#d1d5db',
  border: '1px solid #1f2937',
  borderRadius: '13px',
  fontWeight: 'bold',
  fontSize: '13px',
  background: '#0b1220',
  cursor: 'pointer'
}

const th = {
  padding: '10px 12px',
  fontWeight: 'normal',
  whiteSpace: 'nowrap'
}

const td = {
  padding: '12px',
  whiteSpace: 'nowrap',
  verticalAlign: 'top'
}