import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/authContext'

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
    setIsSubmitting(true)
    const { data, error } = await signUp(email, password, displayName)
    setIsSubmitting(false)
    if (error) {
      setError(error.message)
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
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
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
