import { useContext, useState } from 'react'
import {
  pct,
  num,
  getBiasLabel,
  getBiasColor
} from '../utils/formatters'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip
} from 'recharts'
import { useAnalysis } from '../context/AnalysisContext'
import { SidebarLayoutContext } from '../context/SidebarLayoutContext'


export default function PersistentAnalysisDock() {
  const { selectedStock, prediction, loading, lastUpdatedAt, runPrediction, clearAnalysis } = useAnalysis()
  const { width: sidebarWidth } = useContext(SidebarLayoutContext)
  const [expanded, setExpanded] = useState(false)

  const pm = prediction?.practicalHorizonMetrics
  const skill = prediction?.practicalSkillVsNaive
  const signal = prediction?.signalQuality

  const backtest = prediction?.chartData?.backtest || []
  const forecast = prediction?.chartData?.forecast || []

  const miniData = [
    ...backtest.slice(-25).map(x => ({
      date: x.date,
      real: x.realPrice,
      model: x.modelPrediction,
      mean: null
    })),
    ...forecast.slice(0, 12).map(x => ({
      date: x.date,
      real: null,
      model: null,
      mean: x.mean
    }))
  ]

  const hasAnalysis = Boolean(prediction)
  const biasColor = getBiasColor(signal?.tradeBias)

  if (!selectedStock) {
    return (
      <div style={{
        position: 'fixed',
        left: sidebarWidth,
        right: 0,
        bottom: 0,
        zIndex: 90,
        background: 'linear-gradient(180deg, rgba(20,19,18,0.96), rgba(12,12,13,0.98))',
        borderTop: '1px solid #2a2825',
        backdropFilter: 'blur(14px)',
        transition: 'left 0.2s ease'
      }}>
        <div style={{
          minHeight: '44px',
          padding: '10px 28px',
          display: 'flex',
          alignItems: 'center',
          color: '#66625a',
          fontSize: '13px'
        }}>
          🧭 Bir varlık seçerek analiz akışını başlatın — Dashboard, Piyasa Taraması veya İzleme Listesi üzerinden seçebilirsiniz.
        </div>
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed',
      left: sidebarWidth,
      right: 0,
      bottom: 0,
      zIndex: 90,
      background: 'linear-gradient(180deg, rgba(20,19,18,0.96), rgba(12,12,13,0.98))',
      borderTop: '1px solid #2a2825',
      boxShadow: '0 -18px 45px rgba(0,0,0,0.35)',
      backdropFilter: 'blur(14px)',
      transition: 'left 0.2s ease'
    }}>
      <div style={{
        minHeight: '64px',
        padding: '10px 28px',
        display: 'flex',
        alignItems: 'center',
        gap: '18px',
        flexWrap: 'wrap'
      }}>
        <div style={{ minWidth: '210px' }}>
          <div style={{ color: '#66625a', fontSize: '11px', marginBottom: '3px' }}>
            Pusula AI Canlı Analiz
          </div>
          <div style={{ fontWeight: 'bold', fontSize: '15px' }}>
            {selectedStock.symbol}
            {loading && <span style={{ color: '#2dd4bf', marginLeft: '8px' }}>· analiz ediliyor</span>}
          </div>
        </div>

        <DockPill
          label="Sinyal"
          value={hasAnalysis ? getBiasLabel(signal?.tradeBias) : '-'}
          color={hasAnalysis ? biasColor : '#66625a'}
        />

        <DockPill
          label="MAPE Skill"
          value={hasAnalysis ? pct(skill?.mapeSkillPct) : '-'}
          color={(skill?.mapeSkillPct || 0) >= 0 ? '#10b981' : '#ef4444'}
        />

        <DockPill
          label="Yön Skoru"
          value={hasAnalysis ? pct(pm?.directionScore) : '-'}
          color={(pm?.directionScore || 0) >= 50 ? '#10b981' : '#f59e0b'}
        />

        <DockPill
          label="Action Rate"
          value={hasAnalysis ? pct(pm?.predictedActionRate) : '-'}
          color={(pm?.predictedActionRate || 0) > 0 ? '#2dd4bf' : '#66625a'}
        />

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          {lastUpdatedAt && (
            <span style={{ color: '#66625a', fontSize: '12px' }}>
              Son analiz: {new Date(lastUpdatedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}

          {selectedStock && (
            <button
              onClick={() => runPrediction()}
              disabled={loading}
              style={smallButton(loading ? '#3a372f' : '#d97706')}
            >
              {loading ? 'Çalışıyor...' : 'Yenile'}
            </button>
          )}

          {hasAnalysis && (
            <button onClick={() => setExpanded(v => !v)} style={smallButton('#141312', '#2a2825')}>
              {expanded ? 'Küçült' : 'Grafiği Aç'}
            </button>
          )}

          {hasAnalysis && (
            <button onClick={clearAnalysis} style={smallButton('#141312', '#2a2825', '#ef4444')}>
              Temizle
            </button>
          )}
        </div>
      </div>

      {expanded && hasAnalysis && (
        <div style={{ height: 210, padding: '0 28px 18px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={miniData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fill: '#66625a', fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#66625a', fontSize: 10 }} width={55} />
              <Tooltip
                contentStyle={{
                  background: '#141312',
                  border: '1px solid #2a2825',
                  borderRadius: '10px',
                  color: '#fff'
                }}
              />
              <Line type="monotone" dataKey="real" name="Gerçek" stroke="#ffffff" strokeWidth={2} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="model" name="Model T+5" stroke="#ef4444" strokeWidth={1.8} dot={false} strokeDasharray="4 4" connectNulls={false} />
              <Line type="monotone" dataKey="mean" name="30G Senaryo" stroke="#2dd4bf" strokeWidth={2} dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function DockPill({ label, value, color }) {
  return (
    <div style={{
      background: '#0f0f10',
      border: '1px solid #2a2825',
      borderRadius: '12px',
      padding: '8px 12px',
      minWidth: '120px'
    }}>
      <div style={{ color: '#66625a', fontSize: '11px', marginBottom: '3px' }}>{label}</div>
      <div style={{ color, fontWeight: 'bold', fontSize: '13px' }}>{value}</div>
    </div>
  )
}

function smallButton(bg, border = 'transparent', color = '#fff') {
  return {
    background: bg,
    border: `1px solid ${border}`,
    color,
    borderRadius: '10px',
    padding: '8px 12px',
    fontSize: '12px',
    fontWeight: 'bold',
    cursor: 'pointer'
  }
}