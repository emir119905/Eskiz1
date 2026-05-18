import { Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Portfolio from './pages/Portfolio'
import Admin from './pages/Admin'

// Navbar linki — aktif sayfayı vurgular
function NavItem({ to, label }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        color: isActive ? '#3b82f6' : '#aaaaaa',
        textDecoration: 'none',
        fontWeight: isActive ? 'bold' : 'normal',
        padding: '8px 16px',
        borderRadius: '6px',
        background: isActive ? 'rgba(59,130,246,0.1)' : 'transparent',
        transition: 'all 0.2s'
      })}
    >
      {label}
    </NavLink>
  )
}

export default function App() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* ÜST NAVİGASYON ÇUBUĞU */}
      <nav style={{
        background: '#1a1a1a',
        borderBottom: '1px solid #2a2a2a',
        padding: '12px 32px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        {/* Logo */}
        <span style={{ fontSize: '20px', fontWeight: 'bold', marginRight: '24px' }}>
          🚀 Eskiz-1
        </span>

        {/* Sayfalar */}
        <NavItem to="/"          label="📈 Dashboard" />
        <NavItem to="/portfolio" label="💼 Portföy"   />
        <NavItem to="/admin"     label="🛠️ Admin"     />
      </nav>

      {/* SAYFA İÇERİĞİ */}
      <main style={{ flex: 1, padding: '24px 32px' }}>
        <Routes>
          <Route path="/"          element={<Dashboard />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/admin"     element={<Admin />}     />
        </Routes>
      </main>

    </div>
  )
}