import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { mensajeError } from '../lib/errores'

export function Login() {
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ayuda, setAyuda] = useState(false)

  async function entrar(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || !clave) {
      setError('Escribí tu email y tu contraseña.')
      return
    }
    setEnviando(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: clave })
    setEnviando(false)
    if (error) setError(mensajeError(error))
    // Si sale bien, SesionProvider recibe el cambio de sesión y muestra la app.
  }

  return (
    <main className="centro">
      <form className="caja-login" onSubmit={entrar} noValidate>
        <div className="marca">
          <img className="logo" src="/pwa-192x192.png" alt="" />
          <div>
            <h1>La Cantina</h1>
            <p className="muted small">Menú, costos, compras y cuentas</p>
          </div>
        </div>

        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" className="inp" type="email" inputMode="email" autoComplete="username"
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="clave">Contraseña</label>
          <input id="clave" className="inp" type="password" autoComplete="current-password"
            value={clave} onChange={(e) => setClave(e.target.value)} />
        </div>

        {error && <p className="error" role="alert">{error}</p>}

        <button className="btn full" type="submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>

        <button type="button" className="btn ghost sm" onClick={() => setAyuda((v) => !v)} aria-expanded={ayuda}>
          ¿No podés entrar?
        </button>
        {ayuda && (
          <p className="hint">
            Los usuarios los crea el administrador. Si olvidaste la contraseña o todavía no tenés usuario,
            pedile que te la cambie o que te dé de alta.
          </p>
        )}
      </form>
    </main>
  )
}
