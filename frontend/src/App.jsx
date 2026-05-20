import { Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Portfolio from './pages/Portfolio'
import Admin from './pages/Admin'

// Yeni Dikey Navbar Linki
function SidebarItem({ to, label }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        color: isActive ? '#3b82f6' : '#aaaaaa',
        textDecoration: 'none',
        fontWeight: isActive ? 'bold' : 'normal',
        padding: '12px 20px',
        borderRadius: '8px',
        background: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        transition: 'all 0.2s',
        marginBottom: '4px'
      })}
    >
      {label}
    </NavLink>
  )
}

export default function App() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', backgroundColor: '#0f0f0f', color: '#ffffff' }}>
      
      {/* SOL PROFSYONEL SİDEBAR MENÜ */}
      <aside style={{
        width: '260px',
        background: '#1a1a1a',
        borderRight: '1px solid #2a2a2a',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0,
        bottom: 0,
        left: 0,
        zIndex: 100,
        padding: '24px 16px'
      }}>
        {/* Logo Bölümü */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '10px', 
          marginBottom: '32px', 
          paddingLeft: '12px' 
        }}>
          <span style={{ fontSize: '24px' }}>🚀</span>
          <span style={{ fontSize: '20px', fontWeight: 'bold', letterSpacing: '0.5px' }}>
            Eskiz-1
          </span>
        </div>

        {/* Menü Linkleri */}
        <nav style={{ flex: 1 }}>
          <SidebarItem to="/"          label="📈 Dashboard" />
          <SidebarItem to="/portfolio" label="💼 Portföyüm" />
          <SidebarItem to="/admin"     label="🛠️ Admin Paneli" />
        </nav>

        {/* Alt Bilgi / Sürüm */}
        <div style={{ 
          padding: '12px', 
          borderTop: '1px solid #2a2a2a', 
          color: '#555', 
          fontSize: '12px',
          textAlign: 'center'
        }}>
          Quant Engine v7.0
        </div>
      </aside>

      {/* SAĞ ANA İÇERİK ALANI (Sidebar genişliği kadar soldan margin verildi) */}
      <main style={{ flex: 1, marginLeft: '260px', padding: '40px 48px', minWidth: 0 }}>
        <Routes>
          <Route path="/"          element={<Dashboard />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/admin"     element={<Admin />}     />
        </Routes>
      </main>

    </div>
  )
}