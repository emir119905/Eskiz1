import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Portfolio from './pages/Portfolio'
import Admin from './pages/Admin'
import { AnalysisProvider } from './context/AnalysisContext'
import PersistentAnalysisDock from './components/PersistentAnalysisDock'
import ModelLab from './pages/ModelLab'
import Reports from './pages/Reports'
import Watchlist from './pages/Watchlist'

const BLUE = '#3b82f6'
const GREEN = '#10b981'
const YELLOW = '#f59e0b'
const RED = '#ef4444'
const PURPLE = '#8b5cf6'
const GRAY = '#6b7280'

const APP_VERSION = 'v11.3'
const ENGINE_LABEL = 'Multi-Horizon Engine'
const NEXT_ENGINE = 'v12 Directional Engine'

const navItems = [
  {
    to: '/',
    label: 'Dashboard',
    icon: '📈',
    description: 'Canlı analiz radarı'
  },
  {
    to: '/portfolio',
    label: 'Portföy',
    icon: '💼',
    description: 'Sanal portföy ve işlemler'
  },
  {
    to: '/watchlist',
    label: 'İzleme Listesi',
    icon: '👁️',
    description: 'Favori varlık takibi'
  },
  {
    to: '/lab',
    label: 'Model Lab',
    icon: '🧪',
    description: 'Batch test ve metrikler'
  },
  {
    to: '/reports',
    label: 'Raporlar',
    icon: '📄',
    description: 'Proje brifingi'
  },
  {
    to: '/admin',
    label: 'Veri Yönetimi',
    icon: '🗄️',
    description: 'Veri durumu ve senkronizasyon'
  }
]

function SidebarItem({ to, label, icon, description }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        color: isActive ? '#ffffff' : '#a1a1aa',
        textDecoration: 'none',
        fontWeight: isActive ? 'bold' : 'normal',
        padding: '12px 13px',
        borderRadius: '14px',
        background: isActive
          ? 'linear-gradient(135deg, rgba(37,99,235,0.95), rgba(124,58,237,0.88))'
          : 'transparent',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        transition: 'all 0.2s ease',
        marginBottom: '6px',
        border: isActive ? '1px solid rgba(147,197,253,0.32)' : '1px solid transparent',
        boxShadow: isActive ? '0 16px 30px rgba(37,99,235,0.18)' : 'none'
      })}
    >
      <span style={{
        width: 31,
        height: 31,
        borderRadius: '10px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(255,255,255,0.08)',
        fontSize: '16px',
        flexShrink: 0
      }}>
        {icon}
      </span>

      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ fontSize: '14px', lineHeight: 1.2 }}>
          {label}
        </span>
        <span style={{
          fontSize: '11px',
          opacity: 0.65,
          marginTop: '3px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          {description}
        </span>
      </span>
    </NavLink>
  )
}

function Sidebar() {
  return (
    <aside style={{
      width: '280px',
      background: 'linear-gradient(180deg, #0b1220 0%, #080b12 100%)',
      borderRight: '1px solid #1f2937',
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      top: 0,
      bottom: 0,
      left: 0,
      zIndex: 100,
      padding: '22px 16px'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '26px',
        padding: '10px 10px 16px',
        borderBottom: '1px solid #1f2937'
      }}>
        <div style={{
          width: 42,
          height: 42,
          borderRadius: '15px',
          background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 18px 35px rgba(37,99,235,0.25)',
          fontSize: '22px'
        }}>
          🧭
        </div>

        <div>
          <div style={{
            fontSize: '20px',
            fontWeight: 'bold',
            letterSpacing: '-0.4px',
            color: '#f9fafb'
          }}>
            Pusula AI
          </div>
          <div style={{ color: '#6b7280', fontSize: '12px', marginTop: 2 }}>
            Finansal karar destek paneli
          </div>
        </div>
      </div>

      <nav style={{ flex: 1 }}>
        {navItems.map(item => (
          <SidebarItem
            key={item.to}
            to={item.to}
            label={item.label}
            icon={item.icon}
            description={item.description}
          />
        ))}
      </nav>

      <div style={{
        padding: '14px',
        border: '1px solid #1f2937',
        borderRadius: '18px',
        background: 'linear-gradient(180deg, #111827 0%, #0b1220 100%)',
        marginBottom: '12px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '9px',
          color: '#d1d5db',
          fontSize: '13px',
          fontWeight: 'bold'
        }}>
          <span style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: GREEN,
            boxShadow: `0 0 16px ${GREEN}`
          }} />
          Sistem Aktif
        </div>

        <div style={{ color: '#6b7280', fontSize: '12px', lineHeight: 1.5 }}>
          {ENGINE_LABEL} · {APP_VERSION}
        </div>

        <div style={{
          marginTop: '10px',
          color: '#93c5fd',
          fontSize: '11px',
          borderTop: '1px solid #1f2937',
          paddingTop: '10px'
        }}>
          Sonraki hedef: {NEXT_ENGINE}
        </div>
      </div>

      <div style={{
        color: '#4b5563',
        fontSize: '11px',
        textAlign: 'center',
        lineHeight: 1.5
      }}>
        Akademik proje · Yapay zeka destekli analiz
      </div>
    </aside>
  )
}

function TopStatusBar() {
  const location = useLocation()

  const pageName = {
    '/': 'Dashboard',
    '/portfolio': 'Portföy',
    '/watchlist': 'İzleme Listesi',
    '/lab': 'Model Laboratuvarı',
    '/reports': 'Raporlar',
    '/admin': 'Veri Yönetimi'
  }[location.pathname] || 'Pusula AI'

  return (
    <div style={{
      position: 'sticky',
      top: 0,
      zIndex: 60,
      background: 'rgba(8, 11, 18, 0.82)',
      backdropFilter: 'blur(14px)',
      borderBottom: '1px solid #1f2937',
      margin: '-40px -48px 28px',
      padding: '14px 48px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '16px'
    }}>
      <div>
        <div style={{ color: '#6b7280', fontSize: '11px', marginBottom: 3 }}>
          Aktif Sayfa
        </div>
        <div style={{ color: '#f9fafb', fontWeight: 'bold', fontSize: '15px' }}>
          {pageName}
        </div>
      </div>

      <div style={{
        display: 'flex',
        gap: '10px',
        flexWrap: 'wrap',
        justifyContent: 'flex-end'
      }}>
        <StatusPill color={GREEN} label="Frontend" value="Online" />
        <StatusPill color={GREEN} label=".NET API" value="5221" />
        <StatusPill color={BLUE} label="AI API" value="8000" />
        <StatusPill color={YELLOW} label="Kapsam" value="Akademik" />
      </div>
    </div>
  )
}

function StatusPill({ color, label, value }) {
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

function Footer() {
  return (
    <footer style={{
      marginTop: '36px',
      paddingTop: '18px',
      borderTop: '1px solid #1f2937',
      color: '#6b7280',
      fontSize: '12px',
      display: 'flex',
      justifyContent: 'space-between',
      gap: '14px',
      flexWrap: 'wrap',
      lineHeight: 1.6
    }}>
      <div>
        <strong style={{ color: '#9ca3af' }}>Pusula AI</strong> · Finansal karar destek ve model deney platformu.
      </div>

      <div>
        Bu sistem yatırım tavsiyesi değildir. Çıktılar akademik ve deneysel amaçlıdır.
      </div>
    </footer>
  )
}

const keepAlivePages = [
  { path: '/', Component: Dashboard },
  { path: '/portfolio', Component: Portfolio },
  { path: '/watchlist', Component: Watchlist },
  { path: '/lab', Component: ModelLab },
  { path: '/reports', Component: Reports },
  { path: '/admin', Component: Admin }
]

function getKnownPath(pathname) {
  return keepAlivePages.some(page => page.path === pathname)
    ? pathname
    : '/'
}

function KeepAlivePages() {
  const location = useLocation()
  const activePath = getKnownPath(location.pathname)
  const [mountedPaths, setMountedPaths] = useState(() => new Set([activePath]))

  useEffect(() => {
    setMountedPaths(prev => {
      if (prev.has(activePath)) return prev

      const next = new Set(prev)
      next.add(activePath)
      return next
    })
  }, [activePath])

  return (
    <>
      {keepAlivePages.map(({ path, Component }) => {
        if (!mountedPaths.has(path)) return null

        const active = activePath === path

        return (
          <section
            key={path}
            aria-hidden={!active}
            style={{
              display: active ? 'block' : 'none'
            }}
          >
            <Component />
          </section>
        )
      })}
    </>
  )
}

function AppShell() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background:
        'radial-gradient(circle at top left, rgba(37,99,235,0.08), transparent 34%), #080b12',
      color: '#ffffff'
    }}>
      <Sidebar />

      <main style={{
        flex: 1,
        marginLeft: '280px',
        padding: '40px 48px 34px',
        minWidth: 0
      }}>
        <TopStatusBar />

        <KeepAlivePages />

        <Footer />
      </main>

      <PersistentAnalysisDock />
    </div>
  )
}

export default function App() {
  return (
    <AnalysisProvider>
      <AppShell />
    </AnalysisProvider>
  )
}