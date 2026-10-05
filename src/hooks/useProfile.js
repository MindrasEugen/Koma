import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../lib/authContext'
import { supabase } from '../lib/supabaseClient'

// Legge aaa2."AAA3_profiles", non i metadata di auth: display_name canonico vive lì
// (il trigger on_auth_user_created lo popola alla registrazione, vedi
// src/pages/RegisterPage.jsx), i metadata sono solo il valore iniziale.
export function useProfile() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('AAA3_profiles')
        .select('id, display_name')
        .eq('id', user.id)
        .single()
      if (error) {
        throw new Error(`Impossibile caricare il profilo: ${error.message}`)
      }
      return data
    },
    enabled: Boolean(user),
  })
}
