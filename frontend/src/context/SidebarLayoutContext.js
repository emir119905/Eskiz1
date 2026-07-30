import { createContext } from 'react'

// sidebar dışındaki sabit konumlu bileşenlerin (ör. PersistentAnalysisDock) genişliğe göre kaymasını sağlar.
export const SidebarLayoutContext = createContext({
  collapsed: true,
  width: 76
})
