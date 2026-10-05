import styles from './States.module.css'

// Stato vuoto: una vignetta tratteggiata, con un invito all'azione opzionale.
export function EmptyState({ title, children, action }) {
  return (
    <div className={styles.empty}>
      <p className={styles.title}>{title}</p>
      {children && <p className={styles.text}>{children}</p>}
      {action}
    </div>
  )
}

// Errore: messaggio leggibile e, se possibile, "Riprova".
export function ErrorState({ message, onRetry }) {
  return (
    <div className={styles.error} role="alert">
      <p className={styles.title}>Qualcosa è andato storto</p>
      <p className={styles.text}>{message}</p>
      {onRetry && (
        <button type="button" onClick={() => onRetry()}>
          Riprova
        </button>
      )}
    </div>
  )
}

// Caricamento: vignette vuote nella forma del contenuto in arrivo.
export function LoadingGrid({ count = 6, label = 'Caricamento' }) {
  return (
    <div className={styles.loadingGrid} role="status" aria-live="polite">
      <span className="visually-hidden">{label}...</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.skeleton} aria-hidden="true" />
      ))}
    </div>
  )
}

export function LoadingText({ label = 'Caricamento' }) {
  return (
    <p className={styles.loadingText} role="status" aria-live="polite">
      {label}...
    </p>
  )
}
