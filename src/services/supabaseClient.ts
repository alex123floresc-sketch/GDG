import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Si aún no se configuró Supabase (ver .env.example), el cliente queda en
// null: la app sigue funcionando 100% offline sobre Dexie y syncService
// simplemente omite la sincronización remota en vez de romper el arranque.
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null
