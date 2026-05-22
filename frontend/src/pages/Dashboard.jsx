import { useMemo, useState } from 'react'
import { searchStocks } from '../api/client'
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

const BLUE = '#3b82f6'
const GREEN = '#10b981'
const YELLOW = '#f59e0b'
const RED = '#ef4444'
const PURPLE = '#8b5cf6'
const GRAY = '#6b7280'

function safeNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function CustomTooltip({ active, payload, label, asset, mode }) {
  if (!active || !payload?.length) return null

  return (
    <div style={{
      background: '#111827',
      border: '1px solid #1f2937',
      borderRadius: '14px',
      padding: '11px 14px',
      fontSize: '13px',
      boxShadow: '0 18px 38px rgba(0,0,0,0.35)'
    }}>
      <p style={{
        color: '#9ca3af',
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

  const pm = prediction?.practicalHorizonMetrics
  const pn = prediction?.practicalNaiveMetrics
  const skill = prediction?.practicalSkillVsNaive
  const signal = prediction?.signalQuality

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
        name: 'Naive',
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
    error: 'Model vs Naive Hata Grafiği',
    distribution: 'Down / Flat / Up Dağılımı'
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
              label="MAPE Skill"
              value={pct(skill?.mapeSkillPct)}
              sub={skill?.beatsNaiveByMape ? 'Model fiyat hatasında baseline’ı geçti' : 'Naive baseline daha iyi'}
              color={(skill?.mapeSkillPct || 0) >= 0 ? GREEN : RED}
              icon="⚔️"
            />

            <MetricCard
              label="Pratik Yön Skoru"
              value={pct(pm?.directionScore)}
              sub={`Coverage: ${pct(pm?.directionCoverage)}`}
              color={(pm?.directionScore || 0) >= 50 ? GREEN : YELLOW}
              icon="🧭"
            />

            <MetricCard
              label="Action Rate"
              value={pct(pm?.predictedActionRate)}
              sub="Modelin up/down aksiyon oranı"
              color={(pm?.predictedActionRate || 0) > 0 ? BLUE : GRAY}
              icon="⚡"
            />

            <MetricCard
              label="3-Sınıf Başarı"
              value={pct(pm?.threeClassAccuracy)}
              sub="Down / Flat / Up sınıflaması"
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
        Pusula AI · Çok Ufuklu Finansal Analiz
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
            color: '#9ca3af',
            marginTop: '9px',
            maxWidth: '780px',
            lineHeight: 1.6
          }}>
            Gerçek tarihli T+5 backtest, naive baseline ve 30 günlük model senaryolarını birlikte okuyun.
            Sistem güçlü sinyal görmediğinde işlem yerine beklemeyi önerir.
          </p>
        </div>

        <div style={{
          border: '1px solid #1f2937',
          borderRadius: '16px',
          padding: '12px 14px',
          background: 'linear-gradient(180deg, #111827, #0b1220)',
          minWidth: 210
        }}>
          <div style={{ color: '#6b7280', fontSize: '11px', marginBottom: 4 }}>
            Aktif Motor
          </div>
          <div style={{ color: '#e5e7eb', fontWeight: 'bold' }}>
            Multi-Horizon Engine v11.3
          </div>
          <div style={{ color: '#6b7280', fontSize: '11px', marginTop: 4 }}>
            Tahmin değil, ölçülebilir senaryo.
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
                  onMouseEnter={e => { e.currentTarget.style.background = '#1f2937' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <div>
                    <div style={{ fontWeight: 'bold', color: '#60a5fa' }}>
                      {s.symbol}
                    </div>
                    <div style={{ color: '#9ca3af', fontSize: '12px' }}>
                      {s.companyName}
                    </div>
                  </div>

                  <span style={{
                    color: '#6b7280',
                    fontSize: '12px',
                    border: '1px solid #1f2937',
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
              ? '#374151'
              : 'linear-gradient(135deg, #2563eb, #7c3aed)',
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
            <span style={{ color: '#9ca3af', fontSize: '13px' }}>
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
          color: '#6b7280',
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
  const label = getBiasLabel(signal?.tradeBias)

  const actionRate = safeNumber(pm?.predictedActionRate)
  const mapeSkill = safeNumber(skill?.mapeSkillPct)

  const behavior = actionRate === 0
    ? 'Model bu örnekte çoğunlukla flat sınıfına kaçıyor.'
    : actionRate >= 80
      ? 'Model agresif biçimde aksiyon üretiyor; tek yöne yüklenme riski var.'
      : 'Model sınırlı ve seçici seviyede aksiyon üretiyor.'

  const baselineText = mapeSkill >= 0
    ? `Model fiyat hatasında naive baseline’dan ${pct(mapeSkill)} daha iyi.`
    : `Naive baseline fiyat hatasında modelden ${pct(Math.abs(mapeSkill))} daha iyi.`

  const confidence = safeNumber(signal?.directionConfidence)
  const edge = safeNumber(signal?.directionEdge)

  return (
    <div style={{
      background: `radial-gradient(circle at top left, ${color}30, transparent 32%), linear-gradient(135deg, rgba(17,24,39,0.98), rgba(8,11,18,0.98))`,
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
        gridTemplateColumns: '1.25fr 1fr 1fr',
        gap: '18px',
        alignItems: 'center',
        position: 'relative'
      }}>
        <div>
          <div style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '7px' }}>
            {selectedStock?.symbol || 'Seçili Varlık'} · Sinyal Özeti
          </div>

          <div style={{
            fontSize: '27px',
            fontWeight: 'bold',
            color,
            letterSpacing: '-0.6px',
            marginBottom: '8px'
          }}>
            {label}
          </div>

          <div style={{ color: '#d1d5db', fontSize: '13px', lineHeight: 1.55 }}>
            {baselineText}
          </div>
        </div>

        <div style={{ color: '#d1d5db', fontSize: '13px', lineHeight: 1.6 }}>
          <div style={{ color: '#9ca3af', fontSize: '12px', marginBottom: 5 }}>
            Model Davranışı
          </div>
          {behavior}
        </div>

        <div>
          <div style={{ color: '#9ca3af', fontSize: '12px', marginBottom: 8 }}>
            Sinyal Sağlığı
          </div>

          <HealthRow label="Confidence" value={confidence * 100} color={color} />
          <HealthRow label="Edge" value={edge * 100} color={edge >= 0.1 ? GREEN : YELLOW} />
        </div>
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
          <div style={{ color: '#6b7280', fontSize: '12px', marginBottom: 4 }}>
            Ölçüm Sistemi
          </div>
          <h3 style={{ margin: 0, letterSpacing: '-0.4px' }}>
            Model vs Naive Baseline
          </h3>
        </div>

        <Badge color={modelWinsMape ? GREEN : RED}>
          {modelWinsMape ? 'Model MAPE’de önde' : 'Naive MAPE’de önde'}
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
        color: '#9ca3af',
        fontSize: '13px',
        lineHeight: 1.55,
        borderTop: '1px solid #1f2937',
        paddingTop: '13px'
      }}>
        Naive baseline, “5 gün sonra fiyat bugünkü seviyeye yakın kalır” varsayımıdır.
        Modelin gerçek katkısı bu baseline karşılaştırmasıyla okunur.
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
      <div style={{ color: '#6b7280', fontSize: '12px', marginBottom: 4 }}>
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
        label="Action Rate"
        value={actionRate}
        color={actionRate > 0 ? BLUE : GRAY}
      />

      <ScoreGauge
        label="Confidence"
        value={confidence}
        color={confidence >= 55 ? GREEN : YELLOW}
      />

      <ScoreGauge
        label="Edge"
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
          <div style={{ color: '#6b7280', fontSize: '12px', marginBottom: 4 }}>
            Grafik Alanı
          </div>

          <h3 style={{
            margin: 0,
            marginBottom: '5px',
            letterSpacing: '-0.4px'
          }}>
            {selectedStock?.symbol} — {chartTitle}
          </h3>

          <p style={{ color: '#6b7280', fontSize: '12px', margin: 0 }}>
            Backend’den gelen gerçek tarihli chartData kontratı kullanılır. Frontend tarih uydurmaz.
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
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />

            <XAxis
              dataKey="label"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              interval="preserveStartEnd"
            />

            <YAxis
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickFormatter={v => `${Number(v).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}${axisSuffix}`}
              width={78}
            />

            {(chartView === 'returns' || chartView === 'error' || scaleMode === 'percent') && (
              <ReferenceLine y={0} stroke="#374151" strokeDasharray="4 4" />
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
              color: '#9ca3af',
              fontSize: '13px',
              paddingTop: '10px'
            }} />

            {chartView === 'scenario' && scaleMode === 'price' && (
              <>
                <Area
                  dataKey="upper"
                  name="Üst Bant (q90)"
                  fill="#3b82f614"
                  stroke="#3b82f644"
                  strokeWidth={1}
                  dot={false}
                  activeDot={false}
                />
                <Area
                  dataKey="lower"
                  name="Alt Bant (q10)"
                  fill="#080b12"
                  stroke="#3b82f644"
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
                  name="Naive Baseline"
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
                  name="Naive Hata %"
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
          <div style={{ color: '#6b7280', fontSize: '12px', marginBottom: 4 }}>
            Sınıf Dağılımı
          </div>
          <h3 style={{ margin: 0, letterSpacing: '-0.4px' }}>
            Gerçek / Model / Naive Karşılaştırması
          </h3>
        </div>

        <div style={{ color: '#6b7280', fontSize: '12px', maxWidth: 420, lineHeight: 1.5 }}>
          Modelin flat’e kaçıp kaçmadığını veya tek yöne aşırı yüklenip yüklenmediğini burada okuyabilirsiniz.
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
      background: '#0b1220',
      border: '1px solid #1f2937',
      borderRadius: '16px',
      padding: '14px'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '10px'
      }}>
        <strong>{row.name}</strong>
        <span style={{ color: '#6b7280', fontSize: '12px' }}>Down / Flat / Up</span>
      </div>

      <div style={{
        height: 12,
        borderRadius: '999px',
        overflow: 'hidden',
        display: 'flex',
        background: '#111827',
        marginBottom: '10px'
      }}>
        <div style={{ width: `${row.down}%`, background: RED }} />
        <div style={{ width: `${row.flat}%`, background: GRAY }} />
        <div style={{ width: `${row.up}%`, background: GREEN }} />
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        color: '#9ca3af',
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
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />

          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fill: '#6b7280' }}
            tickFormatter={v => `${v}%`}
          />

          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: '#d1d5db', fontSize: 13 }}
            width={70}
          />

          <Tooltip
            formatter={(value, name) => [`${Number(value).toFixed(2)}%`, name]}
            contentStyle={{
              background: '#111827',
              border: '1px solid #1f2937',
              borderRadius: '12px',
              color: '#fff'
            }}
          />

          <Legend />

          <Bar dataKey="down" name="Down" stackId="a" fill={RED} />
          <Bar dataKey="flat" name="Flat" stackId="a" fill={GRAY} />
          <Bar dataKey="up" name="Up" stackId="a" fill={GREEN} />
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
          border: '1px solid #1f2937',
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
          color: '#d1d5db',
          fontSize: '13px'
        }}>
          <Detail label="Model Versiyonu" value={prediction.modelVersion} />
          <Detail label="Aktif Feature" value={prediction.activeFeatures} />
          <Detail label="Signal Confidence" value={num(signal?.directionConfidence, 4)} />
          <Detail label="Signal Edge" value={num(signal?.directionEdge, 4)} />
          <Detail label="Return Correlation" value={num(pm?.returnCorrelation, 4)} />
          <Detail
            label="Mean Predicted Return"
            value={pm?.meanPredictedReturn == null ? '-' : pct(pm.meanPredictedReturn * 100, 2)}
          />
          <Detail
            label="Mean Real Return"
            value={pm?.meanRealReturn == null ? '-' : pct(pm.meanRealReturn * 100, 2)}
          />
          <Detail
            label="Direction Threshold"
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
        color: '#9ca3af'
      }}>
        <div>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🧭</div>
          <h3 style={{ color: '#e5e7eb', marginBottom: 8 }}>
            {selectedStock ? `${selectedStock.symbol} analize hazır` : 'Bir varlık seçerek başlayın'}
          </h3>
          <p style={{ maxWidth: 520, lineHeight: 1.6, margin: 0 }}>
            {loading
              ? 'Analiz hazırlanıyor. Sonuçlar tamamlandığında burada görünecek.'
              : 'Pusula AI, model çıktısını naive baseline ile karşılaştırır ve düşük güvenli sonuçlarda işlem sinyali üretmez.'}
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
      background: 'linear-gradient(180deg, #111827 0%, #0f172a 100%)',
      border: '1px solid #1f2937',
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
      background: 'linear-gradient(180deg, #111827 0%, #0b1220 100%)',
      border: '1px solid #1f2937',
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

      <div style={{ color: '#6b7280', fontSize: '12px', marginBottom: '8px' }}>
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
        color: '#9ca3af',
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
      background: '#0b1220',
      border: '1px solid #1f2937',
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
          <div style={{ color: '#6b7280', fontSize: '11px', marginBottom: 4 }}>Model</div>
          <div style={{ color: '#e5e7eb', fontWeight: 'bold' }}>{formatter(model)}</div>
        </div>

        <div>
          <div style={{ color: '#6b7280', fontSize: '11px', marginBottom: 4 }}>Naive</div>
          <div style={{ color: '#e5e7eb', fontWeight: 'bold' }}>{formatter(naive)}</div>
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
        color: '#9ca3af',
        marginBottom: 4
      }}>
        <span>{label}</span>
        <strong style={{ color }}>{pct(safe)}</strong>
      </div>

      <div style={{
        height: 7,
        borderRadius: '999px',
        background: '#1f2937',
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
        color: '#9ca3af',
        fontSize: '12px',
        marginBottom: 5
      }}>
        <span>{label}</span>
        <strong style={{ color }}>{pct(safe)}</strong>
      </div>

      <div style={{
        height: 9,
        background: '#0b1220',
        border: '1px solid #1f2937',
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
            padding: '7px 10px',
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

function Detail({ label, value }) {
  return (
    <div style={{
      background: '#0b1220',
      border: '1px solid #1f2937',
      borderRadius: '13px',
      padding: '12px'
    }}>
      <div style={{ color: '#6b7280', fontSize: '11px', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ color: '#e5e7eb', fontWeight: 'bold' }}>
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
  background: '#0b1220',
  border: '1px solid #1f2937',
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
  boxShadow: '0 14px 28px rgba(37,99,235,0.24)'
}

const searchBoxStyle = {
  position: 'absolute',
  top: 'calc(100% + 8px)',
  left: 0,
  right: 0,
  background: '#111827',
  border: '1px solid #1f2937',
  borderRadius: '14px',
  zIndex: 20,
  maxHeight: '260px',
  overflowY: 'auto',
  boxShadow: '0 24px 44px rgba(0,0,0,0.42)'
}

const searchItemStyle = {
  padding: '13px 16px',
  cursor: 'pointer',
  borderBottom: '1px solid #1f2937',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center'
}