import { Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Portfolio from './pages/Portfolio'
import Admin from './pages/Admin'
import { AnalysisProvider } from './context/AnalysisContext'
import PersistentAnalysisDock from './components/PersistentAnalysisDock'

function SidebarItem({ to, label, sub }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        color: isActive ? '#ffffff' : '#9ca3af',
        textDecoration: 'none',
        fontWeight: isActive ? 'bold' : 'normal',
        padding: '12px 14px',
        borderRadius: '12px',
        background: isActive
          ? 'linear-gradient(135deg, rgba(59,130,246,0.22), rgba(139,92,246,0.12))'
          : 'transparent',
        border: isActive ? '1px solid rgba(59,130,246,0.35)' : '1px solid transparent',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        transition: 'all 0.2s',
        marginBottom: '6px'
      })}
    >
      <span>{label}</span>
      {sub && <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: 'normal' }}>{sub}</span>}
    </NavLink>
  )
}

function Layout() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background:
        'radial-gradient(circle at top left, rgba(59,130,246,0.12), transparent 34%), #080b12',
      color: '#ffffff'
    }}>
      <aside style={{
        width: '260px',
        background: 'linear-gradient(180deg, #0d111c 0%, #090d16 100%)',
        borderRight: '1px solid #1f2937',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0,
        bottom: 0,
        left: 0,
        zIndex: 100,
        padding: '24px 16px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '30px',
          padding: '8px 10px'
        }}>
          <div style={{
            width: 42,
            height: 42,
            borderRadius: '14px',
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 12px 26px rgba(59,130,246,0.26)',
            fontSize: '23px'
          }}>
            🧭
          </div>

          <div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', letterSpacing: '0.3px' }}>
              Pusula AI
            </div>
            <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
              Multi-Horizon Analytics
            </div>
          </div>
        </div>

        <nav style={{ flex: 1 }}>
          <SidebarItem to="/" label="📈 Analiz Paneli" sub="Tahmin, risk ve baseline" />
          <SidebarItem to="/portfolio" label="💼 Portföy Simülasyonu" sub="Pozisyon ve işlem alanı" />
          <SidebarItem to="/admin" label="🗄️ Veri Yönetimi" sub="Sync ve veri sağlığı" />
        </nav>

        <div style={{
          padding: '14px 12px',
          borderTop: '1px solid #1f2937',
          color: '#6b7280',
          fontSize: '12px',
          lineHeight: 1.55
        }}>
          <div style={{ color: '#9ca3af', fontWeight: 'bold' }}>Engine v11.3</div>
          <div>Tahmin değil, ölçülebilir senaryo.</div>
          <div style={{ marginTop: '8px', color: '#4b5563', fontSize: '11px' }}>
            Eğitim amaçlıdır; yatırım tavsiyesi değildir.
          </div>
        </div>
      </aside>

      <main style={{
        flex: 1,
        marginLeft: '260px',
        padding: '38px 48px 118px',
        minWidth: 0
      }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </main>

      <PersistentAnalysisDock />
    </div>
  )
}

export default function App() {
  return (
    <AnalysisProvider>
      <Layout />
    </AnalysisProvider>
  )
}