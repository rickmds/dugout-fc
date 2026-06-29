export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          body: string
          created_at: string | null
          created_by: string | null
          id: string
          pinned: boolean | null
          team_id: string
          title: string
        }
        Insert: {
          body: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          pinned?: boolean | null
          team_id: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          pinned?: boolean | null
          team_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          created_at: string | null
          id: string
          logo_url: string | null
          name: string
          primary_color: string | null
          secondary_color: string | null
          slug: string
          tagline: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          primary_color?: string | null
          secondary_color?: string | null
          slug: string
          tagline?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          secondary_color?: string | null
          slug?: string
          tagline?: string | null
        }
        Relationships: []
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          id: string
          profile_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          profile_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string | null
          id: string
          team_id: string | null
          title: string | null
          type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          team_id?: string | null
          title?: string | null
          type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          team_id?: string | null
          title?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      event_rsvps: {
        Row: {
          created_at: string | null
          event_id: string
          id: string
          note: string | null
          player_id: string
          responded_by: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          event_id: string
          id?: string
          note?: string | null
          player_id: string
          responded_by?: string | null
          status: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          event_id?: string
          id?: string
          note?: string | null
          player_id?: string
          responded_by?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_rsvps_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_rsvps_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          address: string | null
          ai_suggested_lock_at: string | null
          arrival_buffer_minutes: number | null
          arrive_early_minutes: number | null
          coach_notes: string | null
          created_at: string | null
          created_by: string | null
          duration_minutes: number | null
          event_date: string
          event_time: string | null
          field_notes: string | null
          field_type: string | null
          id: string
          lat: number | null
          lng: number | null
          location: string | null
          notes: string | null
          recurrence_id: string | null
          require_rsvp: boolean
          rsvp_lock_at: string | null
          team_id: string
          title: string
          home_away: string | null
          surface: string | null
          type: string | null
          uniform: string | null
        }
        Insert: {
          address?: string | null
          ai_suggested_lock_at?: string | null
          arrival_buffer_minutes?: number | null
          arrive_early_minutes?: number | null
          coach_notes?: string | null
          created_at?: string | null
          created_by?: string | null
          duration_minutes?: number | null
          event_date: string
          event_time?: string | null
          field_notes?: string | null
          field_type?: string | null
          home_away?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          location?: string | null
          notes?: string | null
          recurrence_id?: string | null
          require_rsvp?: boolean
          rsvp_lock_at?: string | null
          surface?: string | null
          team_id: string
          title: string
          type?: string | null
          uniform?: string | null
        }
        Update: {
          address?: string | null
          ai_suggested_lock_at?: string | null
          arrival_buffer_minutes?: number | null
          arrive_early_minutes?: number | null
          coach_notes?: string | null
          created_at?: string | null
          created_by?: string | null
          duration_minutes?: number | null
          event_date?: string
          event_time?: string | null
          field_notes?: string | null
          field_type?: string | null
          home_away?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          location?: string | null
          notes?: string | null
          recurrence_id?: string | null
          require_rsvp?: boolean
          rsvp_lock_at?: string | null
          surface?: string | null
          team_id?: string
          title?: string
          type?: string | null
          uniform?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      game_sessions: {
        Row: {
          created_at: string | null
          created_by: string | null
          event_id: string
          half_length_seconds: number
          half1_ended_at: string | null
          half1_started_at: string | null
          half2_ended_at: string | null
          half2_started_at: string | null
          id: string
          status: string | null
          team_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          event_id: string
          half_length_seconds: number
          half1_ended_at?: string | null
          half1_started_at?: string | null
          half2_ended_at?: string | null
          half2_started_at?: string | null
          id?: string
          status?: string | null
          team_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          event_id?: string
          half_length_seconds?: number
          half1_ended_at?: string | null
          half1_started_at?: string | null
          half2_ended_at?: string | null
          half2_started_at?: string | null
          id?: string
          status?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_sessions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_sessions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          guardian_name: string | null
          id: string
          phone: string | null
          player_id: string | null
          relationship: string | null
          role: string
          team_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          guardian_name?: string | null
          id?: string
          phone?: string | null
          player_id?: string | null
          relationship?: string | null
          role?: string
          team_id: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          guardian_name?: string | null
          id?: string
          phone?: string | null
          player_id?: string | null
          relationship?: string | null
          role?: string
          team_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      lineup_positions: {
        Row: {
          id: string
          lineup_id: string
          player_id: string
          position_label: string | null
          x: number
          y: number
        }
        Insert: {
          id?: string
          lineup_id: string
          player_id: string
          position_label?: string | null
          x: number
          y: number
        }
        Update: {
          id?: string
          lineup_id?: string
          player_id?: string
          position_label?: string | null
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "lineup_positions_lineup_id_fkey"
            columns: ["lineup_id"]
            isOneToOne: false
            referencedRelation: "lineups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_positions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      lineups: {
        Row: {
          created_at: string | null
          created_by: string | null
          event_id: string
          formation: string
          id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          event_id: string
          formation: string
          id?: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          event_id?: string
          formation?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lineups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineups_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string | null
          edited: boolean | null
          id: string
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string | null
          edited?: boolean | null
          id?: string
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string | null
          edited?: boolean | null
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string | null
          data: Json | null
          id: string
          profile_id: string
          read: boolean | null
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          profile_id: string
          read?: boolean | null
          title: string
          type: string
        }
        Update: {
          body?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          profile_id?: string
          read?: boolean | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_development_notes: {
        Row: {
          coach_id: string
          created_at: string | null
          id: string
          notes: string
          player_id: string
          session_date: string
          team_id: string
        }
        Insert: {
          coach_id: string
          created_at?: string | null
          id?: string
          notes: string
          player_id: string
          session_date: string
          team_id: string
        }
        Update: {
          coach_id?: string
          created_at?: string | null
          id?: string
          notes?: string
          player_id?: string
          session_date?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_development_notes_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_development_notes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_development_notes_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      player_match_periods: {
        Row: {
          event_id: string
          game_session_id: string
          half: number
          id: string
          off_at: string | null
          on_at: string
          player_id: string
          team_id: string
        }
        Insert: {
          event_id: string
          game_session_id: string
          half: number
          id?: string
          off_at?: string | null
          on_at: string
          player_id: string
          team_id: string
        }
        Update: {
          event_id?: string
          game_session_id?: string
          half?: number
          id?: string
          off_at?: string | null
          on_at?: string
          player_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_match_periods_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_match_periods_game_session_id_fkey"
            columns: ["game_session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_match_periods_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_match_periods_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          created_at: string | null
          date_of_birth: string | null
          full_name: string
          id: string
          is_private: boolean
          jersey_number: number | null
          notes: string | null
          photo_url: string | null
          position: string | null
          preferred_foot: string | null
          profile_id: string | null
          secondary_position: string | null
          team_id: string
        }
        Insert: {
          created_at?: string | null
          date_of_birth?: string | null
          full_name: string
          id?: string
          is_private?: boolean
          jersey_number?: number | null
          notes?: string | null
          photo_url?: string | null
          position?: string | null
          preferred_foot?: string | null
          profile_id?: string | null
          secondary_position?: string | null
          team_id: string
        }
        Update: {
          created_at?: string | null
          date_of_birth?: string | null
          full_name?: string
          id?: string
          is_private?: boolean
          jersey_number?: number | null
          notes?: string | null
          photo_url?: string | null
          position?: string | null
          preferred_foot?: string | null
          profile_id?: string | null
          secondary_position?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          club_id: string | null
          created_at: string | null
          full_name: string | null
          id: string
          notification_prefs: Json
          preferred_language: string | null
          role: string | null
        }
        Insert: {
          avatar_url?: string | null
          club_id?: string | null
          created_at?: string | null
          full_name?: string | null
          id: string
          notification_prefs?: Json
          preferred_language?: string | null
          role?: string | null
        }
        Update: {
          avatar_url?: string | null
          club_id?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          notification_prefs?: Json
          preferred_language?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string | null
          id: string
          platform: string | null
          profile_id: string
          token: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          platform?: string | null
          profile_id: string
          token: string
        }
        Update: {
          created_at?: string | null
          id?: string
          platform?: string | null
          profile_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sub_plans: {
        Row: {
          created_at: string | null
          id: string
          lineup_id: string
          plan_json: Json
        }
        Insert: {
          created_at?: string | null
          id?: string
          lineup_id: string
          plan_json: Json
        }
        Update: {
          created_at?: string | null
          id?: string
          lineup_id?: string
          plan_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "sub_plans_lineup_id_fkey"
            columns: ["lineup_id"]
            isOneToOne: false
            referencedRelation: "lineups"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          club_id: string
          created_at: string | null
          id: string
          plan: string | null
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
        }
        Insert: {
          club_id: string
          created_at?: string | null
          id?: string
          plan?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
        }
        Update: {
          club_id?: string
          created_at?: string | null
          id?: string
          plan?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string | null
          id: string
          profile_id: string
          role: string | null
          team_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          profile_id: string
          role?: string | null
          team_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          profile_id?: string
          role?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          age_group: string | null
          club_id: string
          created_at: string | null
          id: string
          name: string
          season: string | null
        }
        Insert: {
          age_group?: string | null
          club_id: string
          created_at?: string | null
          id?: string
          name: string
          season?: string | null
        }
        Update: {
          age_group?: string | null
          club_id?: string
          created_at?: string | null
          id?: string
          name?: string
          season?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: { Args: { p_token: string }; Returns: Json }
      current_user_club_id: { Args: never; Returns: string }
      current_user_role: { Args: never; Returns: string }
      delete_account: { Args: never; Returns: undefined }
      is_conversation_participant: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      find_direct_conversation: {
        Args: { p_other_profile_id: string }
        Returns: string | null
      }
      is_team_coach: { Args: { p_team_id: string }; Returns: boolean }
      is_team_member: { Args: { p_team_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
