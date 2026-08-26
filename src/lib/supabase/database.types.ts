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
      notifications: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          type: string;
          related_booking_id: string | null;
          read: boolean;
          created_at: string;
        };
        Insert: never;
        Update: {
          read?: boolean;
        };
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
    Views: Record<string, never>;
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
      confirm_booking: {
        Args: { p_booking_id: string };
        Returns: undefined;
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
