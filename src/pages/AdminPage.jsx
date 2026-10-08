import { Link } from 'react-router-dom'
import { useAuth } from '../lib/useAuth'
import { useIsAdmin } from '../hooks/useAdmin'
import { PendingWorksSection } from '../components/admin/PendingWorksSection'
import { DisputesSection } from '../components/admin/DisputesSection'
import { ManualClaimsSection } from '../components/admin/ManualClaimsSection'
import { HiddenWorksSection } from '../components/admin/HiddenWorksSection'
import { PendingPreviewsSection } from '../components/admin/PendingPreviewsSection'

// Nascondere la pagina è solo comodità: la protezione vera è nel database
// (RLS e controllo is_admin() nelle funzioni admin). Le sezioni, e quindi le
// loro richieste, vengono montate solo per gli admin.
export function AdminPage() {
  const { user } = useAuth()
  const { data: isAdmin, isPending } = useIsAdmin()

  if (!user) {
    return (
      <p>
        <Link to="/login">Accedi</Link> per accedere all'area amministrativa.
      </p>
    )
  }

  if (isPending) {
    return <p>Caricamento...</p>
  }

  if (isAdmin !== true) {
    return <p>Accesso riservato agli amministratori.</p>
  }

  return (
    <>
      <h1>Amministrazione</h1>
      <PendingWorksSection />
      <PendingPreviewsSection />
      <DisputesSection />
      <ManualClaimsSection />
      <HiddenWorksSection />
    </>
  )
}
