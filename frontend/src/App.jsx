import { useLocation, NavLink } from 'react-router-dom'
import { Compass, LineChart, Briefcase, Eye, FlaskConical, Database, LogOut } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Portfolio from './pages/Portfolio'
import Admin from './pages/Admin'
import Login from './pages/Login'
import { AnalysisProvider } from './context/AnalysisContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import PersistentAnalysisDock from './components/PersistentAnalysisDock'
import ModelLab from './pages/ModelLab'
import Watchlist from './pages/Watchlist'
import { theme } from './theme'
import { useEffect, useState } from 'react'

const APP_VERSION = 'v11.3'
const ENGINE_LABEL = 'Multi-Horizon Engine'

const mainNavItems = [
  { to: '/', label: 'Dashboard', Icon: LineChart, description: 'Canlı analiz radarı' },
  { to: '/portfolio', label: 'Portföy', Icon: Briefcase, description: 'Sanal portföy ve işlemler' },
  { to: '/watchlist', label: 'İzleme Listesi', Icon: Eye, description: 'Favori varlık takibi' }
]

const devNavItems = [
  { to: '/lab', label: 'Model Lab', Icon: FlaskConical, description: 'Toplu model testi ve QA' },
  { to: '/admin', label: 'Veri Yönetimi', Icon: Database, description: 'Veri durumu ve senkronizasyon' }
]

function SidebarItem({ to, label, Icon, description }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        color: isActive ? theme.text : theme.textMuted,
        textDecoration: 'none',
        fontWeight: isActive ? 600 : 400,
        padding: '10px 12px',
        borderRadius: '10px',
        background: isActive ? theme.primaryMuted : 'transparent',
        borderLeft: isActive ? `2px solid ${theme.primary}` : '2px solid transparent',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        transition: 'background 0.15s ease, color 0.15s ease',
        marginBottom: '4px'
      })}
    >
      {({ isActive }) => (
        <>
          <Icon size={17} strokeWidth={1.75} color={isActive ? theme.primaryStrong : theme.textFaint} style={{ flexShrink: 0 }} />
          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ fontSize: '13.5px', lineHeight: 1.2 }}>{label}</span>
            <span style={{
              fontSize: '11px',
              opacity: 0.6,
              marginTop: '2px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {description}
            </span>
          </span>
        </>
      )}
    </NavLink>
  )
}

function Sidebar() {
  const { user, logout } = useAuth()

  return (
    <aside style={{
      width: '260px',
      background: theme.surface,
      borderRight: `1px solid ${theme.border}`,
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      top: 0,
      bottom: 0,
      left: 0,
      zIndex: 100,
      padding: '20px 14px'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '22px',
        padding: '8px 8px 16px',
        borderBottom: `1px solid ${theme.border}`
      }}>
        <div style={{
          width: 38,
          height: 38,
          borderRadius: '11px',
          background: theme.primary,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <Compass size={19} color="#141312" strokeWidth={2} />
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.2px', color: theme.text }}>
            Pusula AI
          </div>
          <div style={{ color: theme.textFaint, fontSize: '11px', marginTop: 1 }}>
            Finansal karar destek paneli
          </div>
        </div>
      </div>

      <nav style={{ flex: 1 }}>
        {mainNavItems.map(item => (
          <SidebarItem key={item.to} {...item} />
        ))}

        <div style={{
          margin: '14px 8px 10px',
          paddingTop: '12px',
          borderTop: `1px solid ${theme.border}`,
          color: theme.textFaint,
          fontSize: '10.5px',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase'
        }}>
          Geliştirici Araçları
        </div>

        {devNavItems.map(item => (
          <SidebarItem key={item.to} {...item} />
        ))}
      </nav>

      <div style={{ color: theme.textFaint, fontSize: '11px', padding: '4px 8px 12px' }}>
        {ENGINE_LABEL} · {APP_VERSION}
      </div>

      {user && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          padding: '10px 12px',
          border: `1px solid ${theme.border}`,
          borderRadius: '12px',
          background: theme.surfaceSunken
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{
              color: theme.text,
              fontSize: '13px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {user.firstName} {user.lastName}
            </div>
            <div style={{ color: theme.textFaint, fontSize: '11px' }}>{user.email}</div>
          </div>

          <button
            onClick={logout}
            title="Çıkış yap"
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 30,
              height: 30,
              background: 'transparent',
              border: `1px solid ${theme.border}`,
              borderRadius: '8px',
              color: theme.textMuted,
              cursor: 'pointer'
            }}
          >
            <LogOut size={14} strokeWidth={1.75} />
          </button>
        </div>
      )}
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
    '/admin': 'Veri Yönetimi'
  }[location.pathname] || 'Pusula AI'

  return (
    <div style={{
      position: 'sticky',
      top: 0,
      zIndex: 60,
      background: 'rgba(12,12,13,0.9)',
      backdropFilter: 'blur(8px)',
      borderBottom: `1px solid ${theme.border}`,
      margin: '-40px -48px 24px',
      padding: '16px 48px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }}>
      <div style={{ color: theme.text, fontWeight: 600, fontSize: '15px' }}>
        {pageName}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', color: theme.textFaint, fontSize: '12px' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: theme.success }} />
        Sistem Aktif
      </div>
    </div>
  )
}

function Footer() {
  return (
    <footer style={{
      marginTop: '36px',
      paddingTop: '18px',
      borderTop: `1px solid ${theme.border}`,
      color: theme.textFaint,
      fontSize: '12px',
      display: 'flex',
      justifyContent: 'space-between',
      gap: '14px',
      flexWrap: 'wrap',
      lineHeight: 1.6
    }}>
      <div>
        <strong style={{ color: theme.textMuted }}>Pusula AI</strong> · Finansal karar destek ve model deney platformu.
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
      background: theme.bg,
      color: theme.text,
      animation: 'fadeIn 0.25s ease'
    }}>
      <Sidebar />

      <main style={{
        flex: 1,
        marginLeft: '260px',
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

function AuthGate() {
  const { isAuthenticated } = useAuth()

  if (!isAuthenticated) {
    return <div key="login" style={{ animation: 'fadeIn 0.25s ease' }}><Login /></div>
  }

  return (
    <AnalysisProvider>
      <AppShell />
    </AnalysisProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  )
}
