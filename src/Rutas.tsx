import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout, RequierePestana, RequiereAccion } from './pantallas/Layout'
import { Hoy } from './pantallas/Hoy'
import { Caja } from './pantallas/caja/Caja'
import { Cuentas } from './pantallas/cuentas/Cuentas'
import { FichaAlumno } from './pantallas/cuentas/FichaAlumno'
import { Compras } from './pantallas/Compras'
import { Menu } from './pantallas/menu/Menu'
import { Insumos } from './pantallas/insumos/Insumos'
import { Recetas } from './pantallas/recetas/Recetas'
import { Ajustes } from './pantallas/Ajustes'

/** Pantallas de la app con sesión y cantina elegida. */
export function Rutas() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/hoy" element={<Hoy />} />
        <Route path="/menu" element={<Menu />} />
        <Route path="/recetas" element={<Recetas />} />
        <Route path="/insumos" element={<Insumos />} />
        <Route path="/compras" element={<Compras />} />
        <Route path="/cuentas" element={<Cuentas />} />
        <Route path="/cuentas/:id" element={<FichaAlumno />} />
        <Route path="/caja" element={<RequierePestana pestana="caja"><Caja /></RequierePestana>} />
        <Route path="/ajustes" element={<RequiereAccion accion="ver_ajustes"><Ajustes /></RequiereAccion>} />
        <Route path="*" element={<Navigate to="/hoy" replace />} />
      </Route>
    </Routes>
  )
}
