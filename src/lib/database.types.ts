/**
 * PLACEHOLDER — hand-written for Phase 0 (the `profiles` table only).
 *
 * Replace the whole file with the generated version as soon as a Supabase project is linked:
 *
 *   npx supabase gen types typescript --linked > src/lib/database.types.ts
 *
 * and regenerate it after every migration (see CLAUDE.md → Conventions → Migrations).
 */

export type UserRole = 'admin' | 'viewer'

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string
          role: UserRole
          employee_id: string | null
          created_at: string
        }
        Insert: {
          id: string
          full_name: string
          role: UserRole
          employee_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          role?: UserRole
          employee_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<never, never>
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean }
      is_viewer_or_admin: { Args: Record<string, never>; Returns: boolean }
    }
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
