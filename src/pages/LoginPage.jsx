import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/useAuth'

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    const { error } = await signIn(email, password)
    setIsSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate('/')
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <h1>Accedi</h1>
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
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
      </div>
      {error && (
        <p className="form-error" role="alert">
          Errore: {error}
        </p>
      )}
      <button type="submit" className="button-primary" disabled={isSubmitting}>
        Accedi
      </button>
      <p>
        Non hai un account? <Link to="/registrati">Registrati</Link>
      </p>
    </form>
  )
}
