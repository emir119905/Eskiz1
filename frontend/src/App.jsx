import { useLocation, NavLink } from 'react-router-dom'
import {
  Compass, LineChart, Briefcase, Eye, Radar, FlaskConical, Database, LogOut,
  PanelLeftClose, PanelLeftOpen, Wrench, ChevronDown, ChevronUp, Users
} from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Portfolio from './pages/Portfolio'
import Admin from './pages/Admin'
import Login from './pages/Login'
import { AnalysisProvider } from './context/AnalysisContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import PersistentAnalysisDock from './components/PersistentAnalysisDock'
import ModelLab from './pages/ModelLab'
import Watchlist from './pages/Watchlist'
import MarketScreener from './pages/MarketScreener'
import UserManagement from './pages/UserManagement'
import { theme } from './theme'
import { SidebarLayoutContext } from './context/SidebarLayoutContext'
import { useEffect, useRef, useState } from 'react'

const APP_VERSION = 'v11.3'
const ENGINE_LABEL = 'Multi-Horizon Engine'

const SIDEBAR_WIDTH = 260
const SIDEBAR_WIDTH_COLLAPSED = 76
const SIDEBAR_HOVER_DELAY_MS = 200

// sidebar varsayılan olarak daraltılmış (ikon rayı) gelir; "pinned" kullanıcının kalıcı
// olarak açık tutma tercihidir. Pinned değilken hover ile geçici, layout'u itmeyen bir
// overlay olarak genişler — bkz. Sidebar bileşeni.
const SIDEBAR_PINNED_KEY = 'pusula_ai_sidebar_pinned_v1'

function loadSidebarPinned() {
  try {
    return localStorage.getItem(SIDEBAR_PINNED_KEY) === '1'
  } catch {
    return false
  }
}

function saveSidebarPinned(pinned) {
  try {
    localStorage.setItem(SIDEBAR_PINNED_KEY, pinned ? '1' : '0')
  } catch {
    // localStorage kullanılamazsa tercih sekme kapanana kadar bellekte kalır.
  }
}

// geliştirici araçları (Model Lab, Veri Yönetimi) normal kullanıcı akışından ayrık tutulur;
// varsayılan olarak kapalı gelir, isteyen "Geliştirici Modu"nu açıp erişir.
const DEV_MODE_KEY = 'pusula_ai_dev_mode_v1'

function loadDevMode() {
  try {
    return localStorage.getItem(DEV_MODE_KEY) === '1'
  } catch {
    return false
  }
}

function saveDevMode(open) {
  try {
    localStorage.setItem(DEV_MODE_KEY, open ? '1' : '0')
  } catch {
    // localStorage kullanılamazsa tercih sekme kapanana kadar bellekte kalır.
  }
}

const mainNavItems = [
  { to: '/', label: 'Dashboard', Icon: LineChart, description: 'Canlı analiz radarı' },
  { to: '/portfolio', label: 'Portföy', Icon: Briefcase, description: 'Sanal portföy ve işlemler' },
  { to: '/watchlist', label: 'İzleme Listesi', Icon: Eye, description: 'Favori varlık takibi' },
  { to: '/tarama', label: 'Piyasa Taraması', Icon: Radar, description: 'BIST geneli fırsat taraması' }
]

const devNavItems = [
  { to: '/lab', label: 'Model Lab', Icon: FlaskConical, description: 'Toplu model testi ve QA' },
  { to: '/admin', label: 'Veri Yönetimi', Icon: Database, description: 'Veri durumu ve senkronizasyon' }
]

// Admin-only: Developer rolü bu araca erişemez, sadece Admin (bkz. UsersController rol hiyerarşisi).
const adminNavItems = [
  { to: '/kullanicilar', label: 'Kullanıcı Yönetimi', Icon: Users, description: 'Rol ve üyelik yönetimi' }
]

function SidebarItem({ to, label, Icon, description, collapsed }) {
  return (
    <NavLink
      to={to}
      title={collapsed ? `${label} — ${description}` : undefined}
      style={({ isActive }) => ({
        color: isActive ? theme.text : theme.textMuted,
        textDecoration: 'none',
        fontWeight: isActive ? 600 : 400,
        padding: collapsed ? '10px' : '10px 12px',
        borderRadius: '10px',
        background: isActive ? theme.primaryMuted : 'transparent',
        borderLeft: isActive ? `2px solid ${theme.primary}` : '2px solid transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: '12px',
        transition: 'background 0.15s ease, color 0.15s ease',
        marginBottom: '4px'
      })}
    >
      {({ isActive }) => (
        <>
          <Icon size={17} strokeWidth={1.75} color={isActive ? theme.primaryStrong : theme.textFaint} style={{ flexShrink: 0 }} />
          {!collapsed && (
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
          )}
        </>
      )}
    </NavLink>
  )
}

function Sidebar({ pinned, onTogglePin }) {
  const { user, logout, isDeveloper, isAdmin } = useAuth()
  const [devModeOpen, setDevModeOpen] = useState(loadDevMode)
  const [hovering, setHovering] = useState(false)
  const hoverTimerRef = useRef(null)

  useEffect(() => {
    saveDevMode(devModeOpen)
  }, [devModeOpen])

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    }
  }, [])

  const expanded = pinned || hovering
  const collapsed = !expanded

  function handleMouseEnter() {
    if (pinned) return
    hoverTimerRef.current = setTimeout(() => setHovering(true), SIDEBAR_HOVER_DELAY_MS)
  }

  function handleMouseLeave() {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
    setHovering(false)
  }

  return (
    <aside
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        width: expanded ? `${SIDEBAR_WIDTH}px` : `${SIDEBAR_WIDTH_COLLAPSED}px`,
        background: theme.surface,
        borderRight: `1px solid ${theme.border}`,
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0,
        bottom: 0,
        left: 0,
        zIndex: 100,
        padding: '20px 14px',
        transition: 'width 0.2s ease, box-shadow 0.2s ease',
        overflow: 'hidden',
        boxShadow: (hovering && !pinned) ? '10px 0 30px rgba(0,0,0,0.4)' : 'none'
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: collapsed ? '8px' : '12px',
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

        {!collapsed && (
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.2px', color: theme.text }}>
              Pusula AI
            </div>
            <div style={{ color: theme.textFaint, fontSize: '11px', marginTop: 1 }}>
              Finansal karar destek paneli
            </div>
          </div>
        )}

        <button
          onClick={onTogglePin}
          title={pinned ? 'Sabitlemeyi kaldır (fare ile geçici açılır)' : 'Menüyü sabitle (kalıcı açık kalır)'}
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 26,
            height: 26,
            background: pinned ? theme.primaryMuted : 'transparent',
            border: `1px solid ${pinned ? theme.primary : theme.border}`,
            borderRadius: '8px',
            color: pinned ? theme.primaryStrong : theme.textMuted,
            cursor: 'pointer'
          }}
        >
          {pinned
            ? <PanelLeftClose size={14} strokeWidth={1.75} />
            : <PanelLeftOpen size={14} strokeWidth={1.75} />}
        </button>
      </div>

      <nav style={{ flex: 1 }}>
        {mainNavItems.map(item => (
          <SidebarItem key={item.to} {...item} collapsed={collapsed} />
        ))}

        {!collapsed && isDeveloper && (
          <div style={{
            margin: '14px 4px 4px',
            paddingTop: '12px',
            borderTop: `1px solid ${theme.border}`
          }}>
            <button
              onClick={() => setDevModeOpen(prev => !prev)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px',
                background: 'transparent',
                border: 'none',
                borderRadius: '8px',
                color: theme.textFaint,
                fontSize: '10.5px',
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                cursor: 'pointer'
              }}
            >
              <Wrench size={13} strokeWidth={1.75} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, textAlign: 'left' }}>Geliştirici Modu</span>
              {devModeOpen
                ? <ChevronUp size={13} strokeWidth={1.75} />
                : <ChevronDown size={13} strokeWidth={1.75} />}
            </button>

            {devModeOpen && (
              <div style={{ marginTop: '6px' }}>
                {devNavItems.map(item => (
                  <SidebarItem key={item.to} {...item} collapsed={collapsed} />
                ))}
                {isAdmin && adminNavItems.map(item => (
                  <SidebarItem key={item.to} {...item} collapsed={collapsed} />
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      {!collapsed && (
        <div style={{ color: theme.textFaint, fontSize: '11px', padding: '4px 8px 12px', whiteSpace: 'nowrap' }}>
          {ENGINE_LABEL} · {APP_VERSION}
        </div>
      )}

      {user && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: '8px',
          padding: collapsed ? '10px' : '10px 12px',
          border: `1px solid ${theme.border}`,
          borderRadius: '12px',
          background: theme.surfaceSunken
        }}>
          {!collapsed && (
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
          )}

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
  const { isDeveloper, isAdmin } = useAuth()
  const knownPath = getKnownPath(location.pathname, isDeveloper, isAdmin)

  const pageName = {
    '/': 'Dashboard',
    '/portfolio': 'Portföy',
    '/watchlist': 'İzleme Listesi',
    '/tarama': 'Piyasa Taraması',
    '/lab': 'Model Laboratuvarı',
    '/admin': 'Veri Yönetimi',
    '/kullanicilar': 'Kullanıcı Yönetimi'
  }[knownPath] || 'Pusula AI'

  const PageIcon = [...mainNavItems, ...devNavItems, ...adminNavItems].find(item => item.to === knownPath)?.Icon

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
      <div style={{ color: theme.text, fontWeight: 600, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        {PageIcon && <PageIcon size={17} strokeWidth={1.75} color={theme.textMuted} />}
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
  { path: '/tarama', Component: MarketScreener },
  { path: '/lab', Component: ModelLab },
  { path: '/admin', Component: Admin },
  { path: '/kullanicilar', Component: UserManagement }
]

const DEV_PATHS = new Set(['/lab', '/admin'])
const ADMIN_PATHS = new Set(['/kullanicilar'])

// Geliştirici Araçları sayfaları (Model Lab, Veri Yönetimi) sadece Developer/Admin rolündeki
// hesaplar için mount edilir; Kullanıcı Yönetimi ise sadece Admin için. Diğer durumlarda
// bilinmeyen yol gibi ele alınıp Dashboard'a düşer.
function getKnownPath(pathname, isDeveloper, isAdmin) {
  if (ADMIN_PATHS.has(pathname)) return isAdmin ? pathname : '/'
  if (DEV_PATHS.has(pathname) && !isDeveloper) return '/'

  return keepAlivePages.some(page => page.path === pathname)
    ? pathname
    : '/'
}

function KeepAlivePages() {
  const location = useLocation()
  const { isDeveloper, isAdmin } = useAuth()
  const activePath = getKnownPath(location.pathname, isDeveloper, isAdmin)
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
  const [pinned, setPinned] = useState(loadSidebarPinned)

  useEffect(() => {
    saveSidebarPinned(pinned)
  }, [pinned])

  // main içeriğin marginLeft'i sadece pinned durumuna göre değişir; hover ile geçici
  // genişleme bir overlay'dir ve layout'u itmez (aside zaten position:fixed).
  const layoutWidth = pinned ? SIDEBAR_WIDTH : SIDEBAR_WIDTH_COLLAPSED

  return (
    <SidebarLayoutContext.Provider value={{ collapsed: !pinned, width: layoutWidth }}>
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        background: theme.bg,
        color: theme.text,
        animation: 'fadeIn 0.25s ease'
      }}>
        <Sidebar pinned={pinned} onTogglePin={() => setPinned(prev => !prev)} />

        <main style={{
          flex: 1,
          marginLeft: `${layoutWidth}px`,
          padding: '40px 48px 34px',
          minWidth: 0,
          transition: 'margin-left 0.2s ease'
        }}>
          <TopStatusBar />

          <KeepAlivePages />

          <Footer />
        </main>

        <PersistentAnalysisDock />
      </div>
    </SidebarLayoutContext.Provider>
  )
}

const AUTH_TRANSITION_MS = 200

function AuthGate() {
  const { isAuthenticated } = useAuth()
  const [renderedAuth, setRenderedAuth] = useState(isAuthenticated)
  const [visible, setVisible] = useState(true)

  // login/logout arasındaki geçiş sert bir unmount/mount yerine kısa bir cross-fade
  // olsun diye görünürlük ile gerçek içerik değişimi bir adım geciktirilerek ayrıştırılır.
  useEffect(() => {
    if (isAuthenticated === renderedAuth) return

    setVisible(false)
    const timer = setTimeout(() => {
      setRenderedAuth(isAuthenticated)
      setVisible(true)
    }, AUTH_TRANSITION_MS)

    return () => clearTimeout(timer)
  }, [isAuthenticated, renderedAuth])

  return (
    <div style={{ opacity: visible ? 1 : 0, transition: `opacity ${AUTH_TRANSITION_MS}ms ease` }}>
      {renderedAuth ? (
        <AnalysisProvider>
          <AppShell />
        </AnalysisProvider>
      ) : (
        <Login />
      )}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  )
}
