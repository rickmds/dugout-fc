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
          club_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          is_club_wide: boolean | null
          pinned: boolean | null
          team_id: string | null
          title: string
        }
        Insert: {
          body: string
          club_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_club_wide?: boolean | null
          pinned?: boolean | null
          team_id?: string | null
          title: string
        }
        Update: {
          body?: string
          club_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_club_wide?: boolean | null
          pinned?: boolean | null
          team_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
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
          currency: string
          id: string
          logo_url: string | null
          name: string
          primary_color: string | null
          secondary_color: string | null
          slug: string
          suspended_at: string | null
          tagline: string | null
        }
        Insert: {
          created_at?: string | null
          currency?: string
          id?: string
          logo_url?: string | null
          name: string
          primary_color?: string | null
          secondary_color?: string | null
          slug: string
          suspended_at?: string | null
          tagline?: string | null
        }
        Update: {
          created_at?: string | null
          currency?: string
          id?: string
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          secondary_color?: string | null
          slug?: string
          suspended_at?: string | null
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
      email_logs: {
        Row: {
          body: string
          club_id: string | null
          id: string
          recipient_count: number
          sent_at: string | null
          sent_by: string | null
          subject: string
          team_ids: string[] | null
          team_names: string[] | null
        }
        Insert: {
          body: string
          club_id?: string | null
          id?: string
          recipient_count?: number
          sent_at?: string | null
          sent_by?: string | null
          subject: string
          team_ids?: string[] | null
          team_names?: string[] | null
        }
        Update: {
          body?: string
          club_id?: string | null
          id?: string
          recipient_count?: number
          sent_at?: string | null
          sent_by?: string | null
          subject?: string
          team_ids?: string[] | null
          team_names?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          cancellation_reason: string | null
          cancelled_at: string | null
          coach_notes: string | null
          created_at: string | null
          created_by: string | null
          duration_minutes: number | null
          event_date: string
          event_time: string | null
          field_notes: string | null
          field_type: string | null
          home_away: string | null
          id: string
          lat: number | null
          lng: number | null
          location: string | null
          notes: string | null
          recurrence_id: string | null
          require_rsvp: boolean
          rsvp_lock_at: string | null
          score_away: number | null
          score_home: number | null
          surface: string | null
          team_id: string
          title: string
          type: string | null
          uniform: string | null
          video_url: string | null
        }
        Insert: {
          address?: string | null
          ai_suggested_lock_at?: string | null
          arrival_buffer_minutes?: number | null
          arrive_early_minutes?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
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
          score_away?: number | null
          score_home?: number | null
          surface?: string | null
          team_id: string
          title: string
          type?: string | null
          uniform?: string | null
          video_url?: string | null
        }
        Update: {
          address?: string | null
          ai_suggested_lock_at?: string | null
          arrival_buffer_minutes?: number | null
          arrive_early_minutes?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
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
          score_away?: number | null
          score_home?: number | null
          surface?: string | null
          team_id?: string
          title?: string
          type?: string | null
          uniform?: string | null
          video_url?: string | null
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
      fee_categories: {
        Row: {
          amount: number
          club_id: string
          created_at: string | null
          created_by: string | null
          currency: string
          description: string | null
          id: string
          name: string
          season: string | null
        }
        Insert: {
          amount?: number
          club_id: string
          created_at?: string | null
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          name: string
          season?: string | null
        }
        Update: {
          amount?: number
          club_id?: string
          created_at?: string | null
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          name?: string
          season?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_categories_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_payments: {
        Row: {
          amount: number
          id: string
          method: string | null
          notes: string | null
          paid_at: string | null
          player_fee_id: string
          recorded_by: string | null
          reference: string | null
        }
        Insert: {
          amount: number
          id?: string
          method?: string | null
          notes?: string | null
          paid_at?: string | null
          player_fee_id: string
          recorded_by?: string | null
          reference?: string | null
        }
        Update: {
          amount?: number
          id?: string
          method?: string | null
          notes?: string | null
          paid_at?: string | null
          player_fee_id?: string
          recorded_by?: string | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_payments_player_fee_id_fkey"
            columns: ["player_fee_id"]
            isOneToOne: false
            referencedRelation: "player_fees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      player_fees: {
        Row: {
          amount_due: number
          amount_paid: number
          category_id: string | null
          created_at: string | null
          created_by: string | null
          description: string
          discount: number
          discount_reason: string | null
          due_date: string | null
          id: string
          installment_number: number | null
          installment_total: number | null
          notes: string | null
          plan_group_id: string | null
          player_id: string
          status: string | null
          team_id: string
          updated_at: string | null
        }
        Insert: {
          amount_due?: number
          amount_paid?: number
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description: string
          discount?: number
          discount_reason?: string | null
          due_date?: string | null
          id?: string
          installment_number?: number | null
          installment_total?: number | null
          notes?: string | null
          plan_group_id?: string | null
          player_id: string
          status?: string | null
          team_id: string
          updated_at?: string | null
        }
        Update: {
          amount_due?: number
          amount_paid?: number
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string
          discount?: number
          discount_reason?: string | null
          due_date?: string | null
          id?: string
          installment_number?: number | null
          installment_total?: number | null
          notes?: string | null
          plan_group_id?: string | null
          player_id?: string
          status?: string | null
          team_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_fees_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "fee_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_fees_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_fees_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_fees_team_id_fkey"
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
          is_injured: boolean
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
          is_injured?: boolean
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
          is_injured?: boolean
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
          home_address: string | null
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
          home_address?: string | null
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
          home_address?: string | null
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
      registration_forms: {
        Row: {
          club_id: string
          confirmation_message: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          deadline: string | null
          description: string | null
          fields: Json
          id: string
          max_spots: number | null
          payment_options: string | null
          plan_deposit: number | null
          plan_frequency: string | null
          plan_installments: number | null
          price: number | null
          send_confirmation_email: boolean | null
          status: string | null
          team_id: string | null
          title: string
          token: string
        }
        Insert: {
          club_id: string
          confirmation_message?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          deadline?: string | null
          description?: string | null
          fields?: Json
          id?: string
          max_spots?: number | null
          payment_options?: string | null
          plan_deposit?: number | null
          plan_frequency?: string | null
          plan_installments?: number | null
          price?: number | null
          send_confirmation_email?: boolean | null
          status?: string | null
          team_id?: string | null
          title: string
          token?: string
        }
        Update: {
          club_id?: string
          confirmation_message?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          deadline?: string | null
          description?: string | null
          fields?: Json
          id?: string
          max_spots?: number | null
          payment_options?: string | null
          plan_deposit?: number | null
          plan_frequency?: string | null
          plan_installments?: number | null
          price?: number | null
          send_confirmation_email?: boolean | null
          status?: string | null
          team_id?: string | null
          title?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_forms_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_forms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_forms_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_submissions: {
        Row: {
          amount_due: number | null
          amount_paid: number | null
          data: Json
          form_id: string
          id: string
          notes: string | null
          payment_choice: string | null
          payment_status: string | null
          reviewer_id: string | null
          status: string | null
          submitted_at: string | null
        }
        Insert: {
          amount_due?: number | null
          amount_paid?: number | null
          data?: Json
          form_id: string
          id?: string
          notes?: string | null
          payment_choice?: string | null
          payment_status?: string | null
          reviewer_id?: string | null
          status?: string | null
          submitted_at?: string | null
        }
        Update: {
          amount_due?: number | null
          amount_paid?: number | null
          data?: Json
          form_id?: string
          id?: string
          notes?: string | null
          payment_choice?: string | null
          payment_status?: string | null
          reviewer_id?: string | null
          status?: string | null
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registration_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "registration_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_submissions_reviewer_id_fkey"
            columns: ["reviewer_id"]
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
          gender: string | null
          id: string
          name: string
          season: string | null
        }
        Insert: {
          age_group?: string | null
          club_id: string
          created_at?: string | null
          gender?: string | null
          id?: string
          name: string
          season?: string | null
        }
        Update: {
          age_group?: string | null
          club_id?: string
          created_at?: string | null
          gender?: string | null
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
      tryout_assignments: {
        Row: {
          club_id: string
          created_at: string | null
          declined_note: string | null
          declined_reason: string | null
          id: string
          offer_responded_at: string | null
          offer_sent_at: string | null
          offer_status: string | null
          offer_token: string | null
          player_id: string
          reminder_count: number | null
          reminder_sent_at: string | null
          status: string | null
          team: string | null
        }
        Insert: {
          club_id: string
          created_at?: string | null
          declined_note?: string | null
          declined_reason?: string | null
          id?: string
          offer_responded_at?: string | null
          offer_sent_at?: string | null
          offer_status?: string | null
          offer_token?: string | null
          player_id: string
          reminder_count?: number | null
          reminder_sent_at?: string | null
          status?: string | null
          team?: string | null
        }
        Update: {
          club_id?: string
          created_at?: string | null
          declined_note?: string | null
          declined_reason?: string | null
          id?: string
          offer_responded_at?: string | null
          offer_sent_at?: string | null
          offer_status?: string | null
          offer_token?: string | null
          player_id?: string
          reminder_count?: number | null
          reminder_sent_at?: string | null
          status?: string | null
          team?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tryout_assignments_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tryout_assignments_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "tryout_players"
            referencedColumns: ["id"]
          },
        ]
      }
      tryout_coach_assignments: {
        Row: {
          age_group: string | null
          club_id: string
          coach_id: string
          created_at: string | null
          gender: string | null
          id: string
          role: string | null
          team: string | null
        }
        Insert: {
          age_group?: string | null
          club_id: string
          coach_id: string
          created_at?: string | null
          gender?: string | null
          id?: string
          role?: string | null
          team?: string | null
        }
        Update: {
          age_group?: string | null
          club_id?: string
          coach_id?: string
          created_at?: string | null
          gender?: string | null
          id?: string
          role?: string | null
          team?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tryout_coach_assignments_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tryout_coach_assignments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "tryout_coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      tryout_coaches: {
        Row: {
          club_id: string
          created_at: string | null
          email: string | null
          full_name: string
          hourly_rate: number | null
          id: string
          is_active: boolean | null
          license: string | null
          notes: string | null
          phone: string | null
        }
        Insert: {
          club_id: string
          created_at?: string | null
          email?: string | null
          full_name: string
          hourly_rate?: number | null
          id?: string
          is_active?: boolean | null
          license?: string | null
          notes?: string | null
          phone?: string | null
        }
        Update: {
          club_id?: string
          created_at?: string | null
          email?: string | null
          full_name?: string
          hourly_rate?: number | null
          id?: string
          is_active?: boolean | null
          license?: string | null
          notes?: string | null
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tryout_coaches_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      tryout_email_templates: {
        Row: {
          body_html: string | null
          club_id: string
          created_at: string | null
          from_name: string | null
          id: string
          subject: string
          template_key: string
          updated_at: string | null
        }
        Insert: {
          body_html?: string | null
          club_id: string
          created_at?: string | null
          from_name?: string | null
          id?: string
          subject: string
          template_key: string
          updated_at?: string | null
        }
        Update: {
          body_html?: string | null
          club_id?: string
          created_at?: string | null
          from_name?: string | null
          id?: string
          subject?: string
          template_key?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tryout_email_templates_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      tryout_expenses: {
        Row: {
          amount: number
          category: string
          club_id: string
          created_at: string | null
          description: string | null
          id: string
          notes: string | null
          season_label: string | null
        }
        Insert: {
          amount?: number
          category: string
          club_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          notes?: string | null
          season_label?: string | null
        }
        Update: {
          amount?: number
          category?: string
          club_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          notes?: string | null
          season_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tryout_expenses_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      tryout_fields: {
        Row: {
          club_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
          sub_zones: string[] | null
        }
        Insert: {
          club_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
          sub_zones?: string[] | null
        }
        Update: {
          club_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
          sub_zones?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "tryout_fields_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      tryout_form_config: {
        Row: {
          club_id: string
          config_json: Json
          created_at: string | null
          id: string
          season_label: string | null
          updated_at: string | null
        }
        Insert: {
          club_id: string
          config_json?: Json
          created_at?: string | null
          id?: string
          season_label?: string | null
          updated_at?: string | null
        }
        Update: {
          club_id?: string
          config_json?: Json
          created_at?: string | null
          id?: string
          season_label?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tryout_form_config_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      tryout_games: {
        Row: {
          age_group: string | null
          away_location: string | null
          club_id: string
          coach_id: string | null
          created_at: string | null
          end_time: string | null
          field_name: string | null
          game_date: string | null
          gender: string | null
          id: string
          is_home_game: boolean | null
          league: string | null
          notes: string | null
          opponent_name: string | null
          season_label: string | null
          start_time: string | null
          status: string | null
          sub_zone: string | null
          team: string | null
        }
        Insert: {
          age_group?: string | null
          away_location?: string | null
          club_id: string
          coach_id?: string | null
          created_at?: string | null
          end_time?: string | null
          field_name?: string | null
          game_date?: string | null
          gender?: string | null
          id?: string
          is_home_game?: boolean | null
          league?: string | null
          notes?: string | null
          opponent_name?: string | null
          season_label?: string | null
          start_time?: string | null
          status?: string | null
          sub_zone?: string | null
          team?: string | null
        }
        Update: {
          age_group?: string | null
          away_location?: string | null
          club_id?: string
          coach_id?: string | null
          created_at?: string | null
          end_time?: string | null
          field_name?: string | null
          game_date?: string | null
          gender?: string | null
          id?: string
          is_home_game?: boolean | null
          league?: string | null
          notes?: string | null
          opponent_name?: string | null
          season_label?: string | null
          start_time?: string | null
          status?: string | null
          sub_zone?: string | null
          team?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tryout_games_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tryout_games_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "tryout_coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      tryout_offer_settings: {
        Row: {
          club_id: string
          club_website_url: string | null
          created_at: string | null
          deposit_amount: string | null
          email_body_html: string | null
          email_body_html_u8: string | null
          email_subject: string | null
          from_name: string | null
          id: string
          offer_deadline: string | null
          payment_due_date: string | null
          payment_link: string | null
          season_fee: string | null
          teamsnap_registration_url: string | null
          uniform_shop_url: string | null
          updated_at: string | null
        }
        Insert: {
          club_id: string
          club_website_url?: string | null
          created_at?: string | null
          deposit_amount?: string | null
          email_body_html?: string | null
          email_body_html_u8?: string | null
          email_subject?: string | null
          from_name?: string | null
          id?: string
          offer_deadline?: string | null
          payment_due_date?: string | null
          payment_link?: string | null
          season_fee?: string | null
          teamsnap_registration_url?: string | null
          uniform_shop_url?: string | null
          updated_at?: string | null
        }
        Update: {
          club_id?: string
          club_website_url?: string | null
          created_at?: string | null
          deposit_amount?: string | null
          email_body_html?: string | null
          email_body_html_u8?: string | null
          email_subject?: string | null
          from_name?: string | null
          id?: string
          offer_deadline?: string | null
          payment_due_date?: string | null
          payment_link?: string | null
          season_fee?: string | null
          teamsnap_registration_url?: string | null
          uniform_shop_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tryout_offer_settings_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      tryout_players: {
        Row: {
          age_group_override: boolean | null
          birth_year: number | null
          club_id: string
          created_at: string | null
          current_team: string | null
          custom_responses: Json | null
          date_of_birth: string | null
          duplicate_of: string | null
          early_decision_details: string | null
          early_decision_request: boolean | null
          email_primary: string | null
          email_secondary: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          final_age_group: string | null
          first_name: string
          full_name: string | null
          gender: string | null
          grade: string | null
          id: string
          image_permission: boolean | null
          is_duplicate_flagged: boolean | null
          jersey_size: string | null
          last_name: string
          maroons_status: string | null
          maybe_flag: boolean | null
          medical_notes: string | null
          notes: string | null
          parent_name: string | null
          phone: string | null
          positions: string[] | null
          referral_source: string | null
          school_attending: string | null
          season_label: string | null
          shorts_size: string | null
          source: string | null
          town: string | null
          tryout_date: string | null
          tryout_session: string | null
        }
        Insert: {
          age_group_override?: boolean | null
          club_id: string
          created_at?: string | null
          current_team?: string | null
          custom_responses?: Json | null
          date_of_birth?: string | null
          duplicate_of?: string | null
          early_decision_details?: string | null
          early_decision_request?: boolean | null
          email_primary?: string | null
          email_secondary?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          final_age_group?: string | null
          first_name: string
          gender?: string | null
          grade?: string | null
          id?: string
          image_permission?: boolean | null
          is_duplicate_flagged?: boolean | null
          jersey_size?: string | null
          last_name: string
          maroons_status?: string | null
          maybe_flag?: boolean | null
          medical_notes?: string | null
          notes?: string | null
          parent_name?: string | null
          phone?: string | null
          positions?: string[] | null
          referral_source?: string | null
          school_attending?: string | null
          season_label?: string | null
          shorts_size?: string | null
          source?: string | null
          town?: string | null
          tryout_date?: string | null
          tryout_session?: string | null
        }
        Update: {
          age_group_override?: boolean | null
          club_id?: string
          created_at?: string | null
          current_team?: string | null
          custom_responses?: Json | null
          date_of_birth?: string | null
          duplicate_of?: string | null
          early_decision_details?: string | null
          early_decision_request?: boolean | null
          email_primary?: string | null
          email_secondary?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          final_age_group?: string | null
          first_name?: string
          gender?: string | null
          grade?: string | null
          id?: string
          image_permission?: boolean | null
          is_duplicate_flagged?: boolean | null
          jersey_size?: string | null
          last_name?: string
          maroons_status?: string | null
          maybe_flag?: boolean | null
          medical_notes?: string | null
          notes?: string | null
          parent_name?: string | null
          phone?: string | null
          positions?: string[] | null
          referral_source?: string | null
          school_attending?: string | null
          season_label?: string | null
          shorts_size?: string | null
          source?: string | null
          town?: string | null
          tryout_date?: string | null
          tryout_session?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tryout_players_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tryout_players_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "tryout_players"
            referencedColumns: ["id"]
          },
        ]
      }
      tryout_practice_slots: {
        Row: {
          age_group: string | null
          club_id: string
          created_at: string | null
          day_of_week: string | null
          end_time: string | null
          field_name: string | null
          gender: string | null
          id: string
          notes: string | null
          season_label: string | null
          start_time: string | null
          sub_zone: string | null
          team: string | null
        }
        Insert: {
          age_group?: string | null
          club_id: string
          created_at?: string | null
          day_of_week?: string | null
          end_time?: string | null
          field_name?: string | null
          gender?: string | null
          id?: string
          notes?: string | null
          season_label?: string | null
          start_time?: string | null
          sub_zone?: string | null
          team?: string | null
        }
        Update: {
          age_group?: string | null
          club_id?: string
          created_at?: string | null
          day_of_week?: string | null
          end_time?: string | null
          field_name?: string | null
          gender?: string | null
          id?: string
          notes?: string | null
          season_label?: string | null
          start_time?: string | null
          sub_zone?: string | null
          team?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tryout_practice_slots_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      tryout_rankings: {
        Row: {
          club_id: string
          coach_rank: number | null
          combined_score: number | null
          created_at: string | null
          id: string
          player_id: string
          ranking_age_group: string | null
          tryout_rank: number | null
          tryout_status: string | null
          updated_at: string | null
        }
        Insert: {
          club_id: string
          coach_rank?: number | null
          combined_score?: number | null
          created_at?: string | null
          id?: string
          player_id: string
          ranking_age_group?: string | null
          tryout_rank?: number | null
          tryout_status?: string | null
          updated_at?: string | null
        }
        Update: {
          club_id?: string
          coach_rank?: number | null
          combined_score?: number | null
          created_at?: string | null
          id?: string
          player_id?: string
          ranking_age_group?: string | null
          tryout_rank?: number | null
          tryout_status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tryout_rankings_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tryout_rankings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "tryout_players"
            referencedColumns: ["id"]
          },
        ]
      }
      tryout_teams: {
        Row: {
          age_group: string | null
          club_id: string
          color: string | null
          created_at: string | null
          deposit_amount: string | null
          format: string | null
          gender: string | null
          head_coach_id: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          roster_locked: boolean | null
          season_fee: string | null
          sort_order: number | null
          tier: string | null
        }
        Insert: {
          age_group?: string | null
          club_id: string
          color?: string | null
          created_at?: string | null
          deposit_amount?: string | null
          format?: string | null
          gender?: string | null
          head_coach_id?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          roster_locked?: boolean | null
          season_fee?: string | null
          sort_order?: number | null
          tier?: string | null
        }
        Update: {
          age_group?: string | null
          club_id?: string
          color?: string | null
          created_at?: string | null
          deposit_amount?: string | null
          format?: string | null
          gender?: string | null
          head_coach_id?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          roster_locked?: boolean | null
          season_fee?: string | null
          sort_order?: number | null
          tier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tryout_teams_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tryout_teams_head_coach_id_fkey"
            columns: ["head_coach_id"]
            isOneToOne: false
            referencedRelation: "tryout_coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      waiver_assignments: {
        Row: {
          created_at: string | null
          id: string
          team_id: string
          waiver_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          team_id: string
          waiver_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          team_id?: string
          waiver_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waiver_assignments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiver_assignments_waiver_id_fkey"
            columns: ["waiver_id"]
            isOneToOne: false
            referencedRelation: "waivers"
            referencedColumns: ["id"]
          },
        ]
      }
      waiver_signatures: {
        Row: {
          id: string
          player_id: string
          signed_at: string | null
          signed_by_name: string
          waiver_id: string
        }
        Insert: {
          id?: string
          player_id: string
          signed_at?: string | null
          signed_by_name: string
          waiver_id: string
        }
        Update: {
          id?: string
          player_id?: string
          signed_at?: string | null
          signed_by_name?: string
          waiver_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waiver_signatures_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiver_signatures_waiver_id_fkey"
            columns: ["waiver_id"]
            isOneToOne: false
            referencedRelation: "waivers"
            referencedColumns: ["id"]
          },
        ]
      }
      waivers: {
        Row: {
          body: string
          club_id: string
          created_at: string | null
          created_by: string | null
          id: string
          required_by: string | null
          title: string
        }
        Insert: {
          body: string
          club_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          required_by?: string | null
          title: string
        }
        Update: {
          body?: string
          club_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          required_by?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "waivers_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waivers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_attendance: {
        Row: {
          created_at: string
          event_id: string
          id: string
          marked_by: string | null
          player_id: string
          status: 'present' | 'absent' | 'late'
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          marked_by?: string | null
          player_id: string
          status: 'present' | 'absent' | 'late'
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          marked_by?: string | null
          player_id?: string
          status?: 'present' | 'absent' | 'late'
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "event_attendance_event_id_fkey"; columns: ["event_id"]; isOneToOne: false; referencedRelation: "events"; referencedColumns: ["id"] },
          { foreignKeyName: "event_attendance_player_id_fkey"; columns: ["player_id"]; isOneToOne: false; referencedRelation: "players"; referencedColumns: ["id"] },
          { foreignKeyName: "event_attendance_marked_by_fkey"; columns: ["marked_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      event_guests: {
        Row: {
          created_at: string
          event_id: string
          full_name: string
          id: string
          player_id: string | null
          profile_id: string | null
          responded_at: string | null
          role: 'player' | 'coach'
          status: 'pending' | 'confirmed' | 'declined'
          added_by: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          full_name: string
          id?: string
          player_id?: string | null
          profile_id?: string | null
          responded_at?: string | null
          role: 'player' | 'coach'
          status?: 'pending' | 'confirmed' | 'declined'
          added_by?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          full_name?: string
          id?: string
          player_id?: string | null
          profile_id?: string | null
          responded_at?: string | null
          role?: 'player' | 'coach'
          status?: 'pending' | 'confirmed' | 'declined'
          added_by?: string | null
        }
        Relationships: [
          { foreignKeyName: "event_guests_event_id_fkey"; columns: ["event_id"]; isOneToOne: false; referencedRelation: "events"; referencedColumns: ["id"] },
          { foreignKeyName: "event_guests_player_id_fkey"; columns: ["player_id"]; isOneToOne: false; referencedRelation: "players"; referencedColumns: ["id"] },
          { foreignKeyName: "event_guests_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "event_guests_added_by_fkey"; columns: ["added_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: { Args: { p_token: string }; Returns: Json }
      current_user_club_id: { Args: Record<string, never>; Returns: string }
      current_user_role: { Args: Record<string, never>; Returns: string }
      delete_account: { Args: Record<string, never>; Returns: undefined }
      find_direct_conversation: {
        Args: { p_other_profile_id: string }
        Returns: string | null
      }
      is_club_admin: { Args: { cid: string }; Returns: boolean }
      is_club_conversation: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      is_conversation_participant: {
        Args: { p_conversation_id: string }
        Returns: boolean
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
