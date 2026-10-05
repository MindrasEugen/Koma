import { useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/authContext'
import { useProfile } from '../hooks/useProfile'
import { useIsAdmin } from '../hooks/useAdmin'
import styles from './Header.module.css'

// Su mobile la navigazione è un menu a scomparsa (pulsante con
// aria-expanded); da 48rem in su è sempre visibile in linea.
export function Header() {
  const { user, signOut, isLoading } = useAuth()
  const { data: profile } = useProfile()
  const { data: isAdmin } = useIsAdmin()
  const [isOpen, setIsOpen] = useState(false)
  const location = useLocation()
  const [lastPath, setLastPath] = useState(location.pathname)

  // Il menu si richiude a ogni cambio di pagina.
  if (location.pathname !== lastPath) {
    setLastPath(location.pathname)
    setIsOpen(false)
  }

  const navClass = ({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)

  return (
    <header className={styles.header}>
      <div className={styles.bar}>
        <Link to="/" className={styles.brand} aria-label="Koma, torna al catalogo">
          Koma
        </Link>
        <button
          type="button"
          className={styles.menuButton}
          aria-expanded={isOpen}
          aria-controls="main-nav"
          onClick={() => setIsOpen((open) => !open)}
        >
          {isOpen ? 'Chiudi' : 'Menu'}
        </button>
        <nav id="main-nav" className={`${styles.nav} ${isOpen ? styles.navOpen : ''}`} aria-label="Principale">
          {isLoading ? null : user ? (
            <>
              <NavLink to="/watchlist" className={navClass}>
                Watchlist
              </NavLink>
              <NavLink to="/pubblica" className={navClass}>
                Pubblica
              </NavLink>
              <NavLink to="/le-mie-opere" className={navClass}>
                Le mie opere
              </NavLink>
              <NavLink to="/le-mie-rivendicazioni" className={navClass}>
                Rivendicazioni
              </NavLink>
              {isAdmin === true && (
                <NavLink to="/admin" className={navClass}>
                  Admin
                </NavLink>
              )}
              <span className={styles.user}>
                <span className="visually-hidden">Accesso come </span>
                {profile?.display_name ?? user.email}
              </span>
              <button type="button" className={styles.logout} onClick={() => signOut()}>
                Esci
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" className={navClass}>
                Accedi
              </NavLink>
              <NavLink to="/registrati" className={`button button-primary ${styles.cta}`}>
                Registrati
              </NavLink>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
