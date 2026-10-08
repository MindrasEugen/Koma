import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/useAuth'

// Stesse regole impostate in Supabase Auth (con gli stessi insiemi ASCII di
// GoTrue): il server resta l'unico controllo vero, questo evita solo di
// scoprire i requisiti dopo l'invio.
const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const DIGITS = '0123456789'
const SYMBOLS = '!@#$%^&*()_+-=[]{};\'\\:"|<>?,./`~'

function passwordProblems(password) {
  const hasAny = (set) => [...password].some((c) => set.includes(c))
  const missing = []
  if (password.length < 8) missing.push('almeno 8 caratteri')
  if (!hasAny(LOWER)) missing.push('una minuscola')
  if (!hasAny(UPPER)) missing.push('una maiuscola')
  if (!hasAny(DIGITS)) missing.push('un numero')
  if (!hasAny(SYMBOLS)) missing.push('un simbolo')
  return missing.length ? `La password deve contenere: ${missing.join(', ')}.` : null
}

// display_name passato nei metadata di signUp: il
// trigger on_auth_user_created lo copia in aaa2.profiles.display_name
// (coalesce con l'email se mancante — vedi resoconto).
export function RegisterPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    const problem = passwordProblems(password)
    if (problem) {
      setError(problem)
      return
    }
    setIsSubmitting(true)
    const { data, error } = await signUp(email, password, displayName)
    setIsSubmitting(false)
    if (error) {
      setError(
        error.code === 'weak_password'
          ? 'La password non rispetta i requisiti di sicurezza.'
          : error.message,
      )
      return
    }
    if (!data.session) {
      setInfo(
        "Registrazione ricevuta. Se la conferma email è richiesta, controlla la posta prima di accedere.",
      )
      return
    }
    navigate('/')
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <h1>Registrati</h1>
      <div className="field">
        <label>
          Nome visualizzato{' '}
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </label>
      </div>
      <div className="field">
        <label>
          Email{' '}
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
      </div>
      <div className="field">
        <label>
          Password{' '}
          <span className="hint">Almeno 8 caratteri, con una minuscola, una maiuscola, un numero e un simbolo.</span>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>
      </div>
      {error && (
        <p className="form-error" role="alert">
          Errore: {error}
        </p>
      )}
      {info && (
        <p className="form-info" role="status">
          {info}
        </p>
      )}
      <button type="submit" className="button-primary" disabled={isSubmitting}>
        Registrati
      </button>
      <p>
        Hai già un account? <Link to="/login">Accedi</Link>
      </p>
    </form>
  )
}
