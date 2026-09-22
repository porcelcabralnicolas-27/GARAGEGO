// Tipos mantenidos a mano, alineados con supabase/migrations/0001_init.sql.
// Reemplazar cuando se disponga de acceso al Supabase CLI:
// npx supabase gen types typescript --project-id rkrbjcchttidfppttrdq > src/lib/supabase/database.types.ts
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          first_name: string;
          last_name: string;
          phone: string | null;
          avatar_url: string | null;
          active_role: 'client' | 'owner';
          is_owner_enabled: boolean;
          /** Habilita el backoffice. Solo lectura desde el cliente: la migración 0033 tiene un
           *  trigger que ignora cualquier intento de cambiarla vía PostgREST. */
          is_admin: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          first_name?: string;
          last_name?: string;
          phone?: string | null;
          avatar_url?: string | null;
          active_role?: 'client' | 'owner';
          is_owner_enabled?: boolean;
        };
        Update: {
          first_name?: string;
          last_name?: string;
          phone?: string | null;
          avatar_url?: string | null;
          active_role?: 'client' | 'owner';
          is_owner_enabled?: boolean;
        };
        Relationships: [];
      };
      wallets: {
        Row: {
          id: string;
          user_id: string;
          balance: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          balance?: number;
        };
        Update: {
          balance?: number;
        };
        Relationships: [];
      };
      wallet_transactions: {
        Row: {
          id: string;
          wallet_id: string;
          // Constraint vigente desde la 0024 (que devolvió 'earning', quitado por error en la 0015).
          type: 'topup' | 'booking_payment' | 'refund' | 'adjustment' | 'overtime_charge' | 'earning';
          amount: number;
          related_booking_id: string | null;
          status: 'pending' | 'completed' | 'failed';
          payment_gateway_ref: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          wallet_id: string;
          type: 'topup' | 'booking_payment' | 'refund' | 'adjustment' | 'overtime_charge' | 'earning';
          amount: number;
          related_booking_id?: string | null;
          status?: 'pending' | 'completed' | 'failed';
          payment_gateway_ref?: string | null;
        };
        Update: {
          status?: 'pending' | 'completed' | 'failed';
        };
        Relationships: [];
      };
      parking_lots: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          description: string | null;
          address: string;
          latitude: number;
          longitude: number;
          price_per_hour: number;
          rating_avg: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          // Moderación (migración 0034). El trigger `parking_lots_protect_moderation` (0037)
          // impide cambiar todo esto desde el cliente salvo reenviar a revisión.
          approval_status: 'pending' | 'approved' | 'rejected' | 'changes_requested';
          rejection_reason: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          moderation_state: 'live' | 'paused_by_admin' | 'suspended';
          pause_reason: string | null;
          suspended_until: string | null;
          /** Borrado lógico (0053). Solo lo pone la RPC `delete_parking_lot`. */
          archived_at: string | null;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          description?: string | null;
          address: string;
          latitude: number;
          longitude: number;
          price_per_hour: number;
          is_active?: boolean;
        };
        Update: {
          name?: string;
          description?: string | null;
          address?: string;
          latitude?: number;
          longitude?: number;
          price_per_hour?: number;
          is_active?: boolean;
          // Solo la transición changes_requested → pending pasa el trigger (0037/0038).
          approval_status?: 'pending';
        };
        Relationships: [];
      };
      parking_images: {
        Row: {
          id: string;
          parking_lot_id: string;
          storage_path: string;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          parking_lot_id: string;
          storage_path: string;
          position?: number;
        };
        Update: {
          position?: number;
        };
        Relationships: [];
      };
      parking_availability_recurring: {
        Row: {
          id: string;
          parking_lot_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
        };
        Insert: {
          id?: string;
          parking_lot_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
        };
        Update: {
          day_of_week?: number;
          start_time?: string;
          end_time?: string;
        };
        Relationships: [];
      };
      parking_availability_exceptions: {
        Row: {
          id: string;
          parking_lot_id: string;
          date: string;
          start_time: string | null;
          end_time: string | null;
          is_available: boolean;
        };
        Insert: {
          id?: string;
          parking_lot_id: string;
          date: string;
          start_time?: string | null;
          end_time?: string | null;
          is_available?: boolean;
        };
        Update: {
          date?: string;
          start_time?: string | null;
          end_time?: string | null;
          is_available?: boolean;
        };
        Relationships: [];
      };
      bookings: {
        Row: {
          id: string;
          user_id: string;
          parking_lot_id: string;
          vehicle_id: string | null;
          date: string;
          start_time: string;
          end_time: string;
          status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
          total_price: number;
          actual_start_at: string | null;
          actual_end_at: string | null;
          overtime_minutes: number;
          overtime_charge: number;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      ratings: {
        Row: {
          id: string;
          booking_id: string;
          user_id: string;
          parking_lot_id: string;
          score: number;
          comment: string | null;
          created_at: string;
          // Moderación (migración 0044). Solo se cambian por la RPC admin_set_rating_hidden.
          is_hidden: boolean;
          hidden_reason: string | null;
          hidden_at: string | null;
          hidden_by: string | null;
        };
        Insert: {
          id?: string;
          booking_id: string;
          user_id: string;
          parking_lot_id: string;
          score: number;
          comment?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          booking_id: string;
          sender_id: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          sender_id: string;
          content: string;
        };
        Update: never;
        Relationships: [];
      };
      hidden_bookings: {
        Row: {
          booking_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          booking_id: string;
          user_id: string;
        };
        Update: never;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          type: string;
          audience: 'client' | 'owner' | null;
          related_booking_id: string | null;
          /** Migración 0041: apunta al ticket de soporte (notificaciones support_*). */
          related_ticket_id: string | null;
          read: boolean;
          created_at: string;
        };
        Insert: never;
        Update: {
          read?: boolean;
        };
        Relationships: [];
      };
      support_tickets: {
        Row: {
          id: string;
          code: string;
          reporter_id: string;
          reporter_role: 'client' | 'owner';
          subject: string;
          category: 'access' | 'payment' | 'listing' | 'behavior' | 'other';
          status: 'open' | 'resolved';
          related_booking_id: string | null;
          related_parking_lot_id: string | null;
          created_at: string;
          updated_at: string;
          last_message_at: string;
        };
        Insert: {
          id?: string;
          reporter_id: string;
          reporter_role: 'client' | 'owner';
          subject: string;
          category: 'access' | 'payment' | 'listing' | 'behavior' | 'other';
          related_booking_id?: string | null;
          related_parking_lot_id?: string | null;
        };
        // El usuario no actualiza tickets desde el cliente (solo el admin, vía policy).
        Update: never;
        Relationships: [];
      };
      support_ticket_messages: {
        Row: {
          id: string;
          ticket_id: string;
          author_id: string;
          author_role: 'user' | 'admin';
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          ticket_id: string;
          author_id: string;
          author_role: 'user' | 'admin';
          body: string;
        };
        Update: never;
        Relationships: [];
      };
      vehicles: {
        Row: {
          id: string;
          user_id: string;
          plate: string;
          brand: string | null;
          model: string | null;
          color: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          plate: string;
          brand?: string | null;
          model?: string | null;
          color?: string | null;
        };
        Update: {
          plate?: string;
          brand?: string | null;
          model?: string | null;
          color?: string | null;
        };
        Relationships: [];
      };
      vehicle_images: {
        Row: {
          id: string;
          vehicle_id: string;
          storage_path: string;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          vehicle_id: string;
          storage_path: string;
          position?: number;
        };
        Update: {
          position?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      /** Datos públicos de un perfil (0050). Para leer a otras personas: `profiles` completo
       *  solo lo ve su dueño y los admins (0051). */
      public_profiles: {
        Row: {
          id: string;
          first_name: string;
          last_name: string;
          avatar_url: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      ensure_profile: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      topup_wallet: {
        Args: { p_amount: number };
        Returns: undefined;
      };
      create_booking: {
        Args: {
          p_parking_lot_id: string;
          p_date: string;
          p_start_time: string;
          p_end_time: string;
          p_vehicle_id: string;
        };
        Returns: string;
      };
      start_booking: {
        Args: { p_booking_id: string };
        Returns: undefined;
      };
      get_booked_intervals: {
        Args: { p_parking_lot_id: string; p_from_date?: string };
        Returns: { date: string; start_time: string; end_time: string }[];
      };
      delete_parking_lot: {
        Args: { p_parking_lot_id: string };
        Returns: 'deleted' | 'archived';
      };
      last_message_per_booking: {
        Args: { p_booking_ids: string[] };
        Returns: { booking_id: string; content: string; created_at: string }[];
      };
      create_support_ticket: {
        Args: {
          p_reporter_role: 'client' | 'owner';
          p_subject: string;
          p_category: 'access' | 'payment' | 'listing' | 'behavior' | 'other';
          p_body: string;
          p_related_booking_id: string | null;
          p_related_parking_lot_id: string | null;
        };
        Returns: {
          id: string;
          code: string;
          reporter_id: string;
          reporter_role: 'client' | 'owner';
          subject: string;
          category: 'access' | 'payment' | 'listing' | 'behavior' | 'other';
          status: 'open' | 'resolved';
          related_booking_id: string | null;
          related_parking_lot_id: string | null;
          created_at: string;
          updated_at: string;
          last_message_at: string;
        };
      };
      complete_booking: {
        Args: { p_booking_id: string };
        Returns: { overtime_minutes: number; overtime_charge: number }[];
      };
      cancel_booking: {
        Args: { p_booking_id: string };
        Returns: undefined;
      };
      search_parking_lots: {
        Args: {
          p_lat: number;
          p_lng: number;
          p_radius_km?: number;
          p_max_price?: number | null;
          p_min_rating?: number | null;
        };
        Returns: {
          id: string;
          owner_id: string;
          name: string;
          description: string | null;
          address: string;
          latitude: number;
          longitude: number;
          price_per_hour: number;
          rating_avg: number;
          is_active: boolean;
          created_at: string;
          distance_km: number;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
