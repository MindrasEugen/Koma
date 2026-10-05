import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Variabili Supabase mancanti: imposta VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY in .env (vedi .env.example).',
  )
}

// Schema di default 'aaa2': il catalogo Koma vive lì, non in 'public'
// (schema condiviso con un altro prodotto sullo stesso progetto Supabase).
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'aaa2' },
})
