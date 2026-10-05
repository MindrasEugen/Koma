import { statusInfo } from '../../lib/labels'
import styles from './StatusBadge.module.css'

// kind: 'publication' | 'watchlist' | 'claim' | 'authorship'
export function StatusBadge({ kind, value }) {
  const { label, tone } = statusInfo(kind, value)
  return <span className={`${styles.badge} ${styles[tone]}`}>{label}</span>
}
