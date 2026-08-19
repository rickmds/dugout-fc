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
      admin_club_notes: {
        Row: {
          club_id: string
          contacted_at: string | null
          notes: string
          updated_at: string | null
        }
        Insert: {
          club_id: string
          contacted_at?: string | null
          notes?: string
          updated_at?: string | null
        }
        Update: {
          club_id?: string
          contacted_at?: string | null
          notes?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_club_notes_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
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
          allow_partial_payments: boolean | null
          away_kit_color: string | null
          contact_email: string | null
          country: string
          created_at: string | null
          currency: string
          hardship_fund_enabled: boolean | null
          header_pattern: string | null
          home_kit_color: string | null
          id: string
          late_fee_amount: number | null
          late_fee_enabled: boolean | null
          late_fee_grace_days: number | null
          late_fee_type: string | null
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          name: string
          primary_color: string | null
          secondary_color: string | null
          slug: string
          stripe_connect_account_id: string | null
          stripe_connect_onboarded: boolean | null
          stripe_fee_handling: string | null
          stripe_surcharge_pct: number | null
          suspended_at: string | null
          tagline: string | null
          timezone: string | null
          training_kit_color: string | null
          tryouts_active: boolean | null
          website: string | null
        }
        Insert: {
          allow_partial_payments?: boolean | null
          away_kit_color?: string | null
          contact_email?: string | null
          country?: string
          created_at?: string | null
          currency?: string
          hardship_fund_enabled?: boolean | null
          header_pattern?: string | null
          home_kit_color?: string | null
          id?: string
          late_fee_amount?: number | null
          late_fee_enabled?: boolean | null
          late_fee_grace_days?: number | null
          late_fee_type?: string | null
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          name: string
          primary_color?: string | null
          secondary_color?: string | null
          slug: string
          stripe_connect_account_id?: string | null
          stripe_connect_onboarded?: boolean | null
          stripe_fee_handling?: string | null
          stripe_surcharge_pct?: number | null
          suspended_at?: string | null
          tagline?: string | null
          timezone?: string | null
          training_kit_color?: string | null
          tryouts_active?: boolean | null
          website?: string | null
        }
        Update: {
          allow_partial_payments?: boolean | null
          away_kit_color?: string | null
          contact_email?: string | null
          country?: string
          created_at?: string | null
          currency?: string
          hardship_fund_enabled?: boolean | null
          header_pattern?: string | null
          home_kit_color?: string | null
          id?: string
          late_fee_amount?: number | null
          late_fee_enabled?: boolean | null
          late_fee_grace_days?: number | null
          late_fee_type?: string | null
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          name?: string
          primary_color?: string | null
          secondary_color?: string | null
          slug?: string
          stripe_connect_account_id?: string | null
          stripe_connect_onboarded?: boolean | null
          stripe_fee_handling?: string | null
          stripe_surcharge_pct?: number | null
          suspended_at?: string | null
          tagline?: string | null
          timezone?: string | null
          training_kit_color?: string | null
          tryouts_active?: boolean | null
          website?: string | null
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
      evaluation_batches: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          club_id: string
          coach_id: string | null
          completed_count: number | null
          created_at: string | null
          id: string
          period_label: string
          season_label: string
          status: string | null
          submitted_at: string | null
          team_id: string
          total_players: number | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          club_id: string
          coach_id?: string | null
          completed_count?: number | null
          created_at?: string | null
          id?: string
          period_label: string
          season_label: string
          status?: string | null
          submitted_at?: string | null
          team_id: string
          total_players?: number | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          club_id?: string
          coach_id?: string | null
          completed_count?: number | null
          created_at?: string | null
          id?: string
          period_label?: string
          season_label?: string
          status?: string | null
          submitted_at?: string | null
          team_id?: string
          total_players?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_batches_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_batches_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_batches_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_batches_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
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
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          marked_by?: string | null
          player_id: string
          status: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          marked_by?: string | null
          player_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_attendance_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendance_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendance_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      event_guests: {
        Row: {
          added_by: string | null
          created_at: string
          event_id: string
          full_name: string
          id: string
          player_id: string | null
          profile_id: string | null
          responded_at: string | null
          role: string
          status: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          event_id: string
          full_name: string
          id?: string
          player_id?: string | null
          profile_id?: string | null
          responded_at?: string | null
          role: string
          status?: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          event_id?: string
          full_name?: string
          id?: string
          player_id?: string | null
          profile_id?: string | null
          responded_at?: string | null
          role?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_guests_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_guests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_guests_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_guests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_player_stats: {
        Row: {
          assists: number
          club_id: string
          created_at: string | null
          created_by: string | null
          event_id: string
          goals: number
          id: string
          minutes_played: number | null
          player_id: string
          red_cards: number
          team_id: string
          updated_at: string | null
          yellow_cards: number
        }
        Insert: {
          assists?: number
          club_id: string
          created_at?: string | null
          created_by?: string | null
          event_id: string
          goals?: number
          id?: string
          minutes_played?: number | null
          player_id: string
          red_cards?: number
          team_id: string
          updated_at?: string | null
          yellow_cards?: number
        }
        Update: {
          assists?: number
          club_id?: string
          created_at?: string | null
          created_by?: string | null
          event_id?: string
          goals?: number
          id?: string
          minutes_played?: number | null
          player_id?: string
          red_cards?: number
          team_id?: string
          updated_at?: string | null
          yellow_cards?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_player_stats_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_player_stats_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_player_stats_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_player_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_player_stats_team_id_fkey"
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
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_reason: string | null
          coach_notes: string | null
          created_at: string | null
          created_by: string | null
          duration_minutes: number | null
          event_date: string
          event_group_id: string | null
          event_time: string | null
          field_id: string | null
          field_notes: string | null
          field_type: string | null
          home_away: string | null
          id: string
          lat: number | null
          lng: number | null
          location: string | null
          notes: string | null
          recurrence_id: string | null
          reflection_prompt_sent_at: string | null
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
          cancelled_reason?: string | null
          coach_notes?: string | null
          created_at?: string | null
          created_by?: string | null
          duration_minutes?: number | null
          event_date: string
          event_group_id?: string | null
          event_time?: string | null
          field_id?: string | null
          field_notes?: string | null
          field_type?: string | null
          home_away?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          location?: string | null
          notes?: string | null
          recurrence_id?: string | null
          reflection_prompt_sent_at?: string | null
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
          cancelled_reason?: string | null
          coach_notes?: string | null
          created_at?: string | null
          created_by?: string | null
          duration_minutes?: number | null
          event_date?: string
          event_group_id?: string | null
          event_time?: string | null
          field_id?: string | null
          field_notes?: string | null
          field_type?: string | null
          home_away?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          location?: string | null
          notes?: string | null
          recurrence_id?: string | null
          reflection_prompt_sent_at?: string | null
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
            foreignKeyName: "events_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "tryout_fields"
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
          fee_charged: number | null
          id: string
          method: string | null
          notes: string | null
          paid_at: string | null
          payment_rail: string | null
          platform_cost: number | null
          platform_fee_collected: number | null
          player_fee_id: string
          recorded_by: string | null
          reference: string | null
          refunded_amount: number
          refunded_surcharge: number
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
          surcharge_passed_to_payer: boolean
        }
        Insert: {
          amount: number
          fee_charged?: number | null
          id?: string
          method?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_rail?: string | null
          platform_cost?: number | null
          platform_fee_collected?: number | null
          player_fee_id: string
          recorded_by?: string | null
          reference?: string | null
          refunded_amount?: number
          refunded_surcharge?: number
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          surcharge_passed_to_payer?: boolean
        }
        Update: {
          amount?: number
          fee_charged?: number | null
          id?: string
          method?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_rail?: string | null
          platform_cost?: number | null
          platform_fee_collected?: number | null
          player_fee_id?: string
          recorded_by?: string | null
          reference?: string | null
          refunded_amount?: number
          refunded_surcharge?: number
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          surcharge_passed_to_payer?: boolean
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
      fee_refunds: {
        Row: {
          amount: number
          created_at: string | null
          fee_payment_id: string
          id: string
          mode: string
          player_fee_id: string
          reason: string | null
          refunded_by: string | null
          stripe_refund_id: string | null
          surcharge_amount: number
        }
        Insert: {
          amount: number
          created_at?: string | null
          fee_payment_id: string
          id?: string
          mode: string
          player_fee_id: string
          reason?: string | null
          refunded_by?: string | null
          stripe_refund_id?: string | null
          surcharge_amount?: number
        }
        Update: {
          amount?: number
          created_at?: string | null
          fee_payment_id?: string
          id?: string
          mode?: string
          player_fee_id?: string
          reason?: string | null
          refunded_by?: string | null
          stripe_refund_id?: string | null
          surcharge_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "fee_refunds_fee_payment_id_fkey"
            columns: ["fee_payment_id"]
            isOneToOne: false
            referencedRelation: "fee_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_refunds_player_fee_id_fkey"
            columns: ["player_fee_id"]
            isOneToOne: false
            referencedRelation: "player_fees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_refunds_refunded_by_fkey"
            columns: ["refunded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_reminder_log: {
        Row: {
          created_at: string | null
          id: string
          player_fee_id: string
          reminder_type: string | null
          sent_at: string
          sent_by: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          player_fee_id: string
          reminder_type?: string | null
          sent_at?: string
          sent_by?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          player_fee_id?: string
          reminder_type?: string | null
          sent_at?: string
          sent_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_reminder_log_player_fee_id_fkey"
            columns: ["player_fee_id"]
            isOneToOne: false
            referencedRelation: "player_fees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_reminder_log_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      field_availability_rules: {
        Row: {
          club_id: string
          created_at: string | null
          day_of_week: string | null
          field_name: string
          id: string
          label: string | null
          rule_date: string | null
          rule_type: string
          season_label: string | null
          sub_zone: string | null
          unavailable_from: string
          unavailable_until: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          club_id: string
          created_at?: string | null
          day_of_week?: string | null
          field_name: string
          id?: string
          label?: string | null
          rule_date?: string | null
          rule_type?: string
          season_label?: string | null
          sub_zone?: string | null
          unavailable_from: string
          unavailable_until: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          club_id?: string
          created_at?: string | null
          day_of_week?: string | null
          field_name?: string
          id?: string
          label?: string | null
          rule_date?: string | null
          rule_type?: string
          season_label?: string | null
          sub_zone?: string | null
          unavailable_from?: string
          unavailable_until?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "field_availability_rules_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      field_closure_acknowledgements: {
        Row: {
          acknowledged_at: string | null
          closure_id: string
          coach_email: string
          coach_name: string | null
          coach_profile_id: string | null
          id: string
        }
        Insert: {
          acknowledged_at?: string | null
          closure_id: string
          coach_email: string
          coach_name?: string | null
          coach_profile_id?: string | null
          id?: string
        }
        Update: {
          acknowledged_at?: string | null
          closure_id?: string
          coach_email?: string
          coach_name?: string | null
          coach_profile_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_closure_acknowledgements_closure_id_fkey"
            columns: ["closure_id"]
            isOneToOne: false
            referencedRelation: "field_closures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_closure_acknowledgements_coach_profile_id_fkey"
            columns: ["coach_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      field_closure_templates: {
        Row: {
          club_id: string
          created_at: string | null
          duration_label: string | null
          id: string
          message_template: string | null
          name: string
          reason: string | null
        }
        Insert: {
          club_id: string
          created_at?: string | null
          duration_label?: string | null
          id?: string
          message_template?: string | null
          name: string
          reason?: string | null
        }
        Update: {
          club_id?: string
          created_at?: string | null
          duration_label?: string | null
          id?: string
          message_template?: string | null
          name?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "field_closure_templates_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      field_closures: {
        Row: {
          closed_from: string
          closed_until: string | null
          club_id: string
          created_at: string | null
          created_by: string | null
          duration_label: string | null
          emails_sent_at: string | null
          emails_sent_count: number | null
          field_name: string
          id: string
          notify_message: string | null
          push_sent: boolean | null
          reason: string | null
          sub_zones: string[] | null
        }
        Insert: {
          closed_from: string
          closed_until?: string | null
          club_id: string
          created_at?: string | null
          created_by?: string | null
          duration_label?: string | null
          emails_sent_at?: string | null
          emails_sent_count?: number | null
          field_name: string
          id?: string
          notify_message?: string | null
          push_sent?: boolean | null
          reason?: string | null
          sub_zones?: string[] | null
        }
        Update: {
          closed_from?: string
          closed_until?: string | null
          club_id?: string
          created_at?: string | null
          created_by?: string | null
          duration_label?: string | null
          emails_sent_at?: string | null
          emails_sent_count?: number | null
          field_name?: string
          id?: string
          notify_message?: string | null
          push_sent?: boolean | null
          reason?: string | null
          sub_zones?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "field_closures_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_closures_created_by_fkey"
            columns: ["created_by"]
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
      game_slots: {
        Row: {
          age_group: string | null
          away_team: string | null
          club_id: string
          created_at: string
          end_time: string
          field_name: string
          game_format: string | null
          home_team_id: string | null
          id: string
          notes: string | null
          slot_date: string
          start_time: string
          status: string
          updated_at: string
        }
        Insert: {
          age_group?: string | null
          away_team?: string | null
          club_id: string
          created_at?: string
          end_time: string
          field_name: string
          game_format?: string | null
          home_team_id?: string | null
          id?: string
          notes?: string | null
          slot_date: string
          start_time: string
          status?: string
          updated_at?: string
        }
        Update: {
          age_group?: string | null
          away_team?: string | null
          club_id?: string
          created_at?: string
          end_time?: string
          field_name?: string
          game_format?: string | null
          home_team_id?: string | null
          id?: string
          notes?: string | null
          slot_date?: string
          start_time?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_slots_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_slots_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_request_targets: {
        Row: {
          id: string
          request_id: string
          team_id: string
        }
        Insert: {
          id?: string
          request_id: string
          team_id: string
        }
        Update: {
          id?: string
          request_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_request_targets_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "guest_request_fill"
            referencedColumns: ["request_id"]
          },
          {
            foreignKeyName: "guest_request_targets_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "guest_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_request_targets_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_requests: {
        Row: {
          created_at: string
          created_by: string | null
          event_id: string
          id: string
          note: string | null
          requesting_team_id: string
          spots_needed: number
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_id: string
          id?: string
          note?: string | null
          requesting_team_id: string
          spots_needed?: number
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_id?: string
          id?: string
          note?: string | null
          requesting_team_id?: string
          spots_needed?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_requests_requesting_team_id_fkey"
            columns: ["requesting_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      hardship_contributions: {
        Row: {
          amount: number
          club_id: string
          created_at: string | null
          id: string
          player_fee_id: string | null
        }
        Insert: {
          amount: number
          club_id: string
          created_at?: string | null
          id?: string
          player_fee_id?: string | null
        }
        Update: {
          amount?: number
          club_id?: string
          created_at?: string | null
          id?: string
          player_fee_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hardship_contributions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hardship_contributions_player_fee_id_fkey"
            columns: ["player_fee_id"]
            isOneToOne: false
            referencedRelation: "player_fees"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          address: string | null
          club_id: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          guardian_name: string | null
          id: string
          phone: string | null
          player_id: string | null
          relationship: string | null
          role: string
          team_id: string | null
          team_ids: string[]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          address?: string | null
          club_id?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          guardian_name?: string | null
          id?: string
          phone?: string | null
          player_id?: string | null
          relationship?: string | null
          role?: string
          team_id?: string | null
          team_ids?: string[]
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          address?: string | null
          club_id?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          guardian_name?: string | null
          id?: string
          phone?: string | null
          player_id?: string | null
          relationship?: string | null
          role?: string
          team_id?: string | null
          team_ids?: string[]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
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
      pending_games: {
        Row: {
          age_group: string | null
          club_id: string
          created_at: string | null
          game_date: string
          gender: string | null
          id: string
          league: string | null
          notes: string | null
          opponent: string
          our_team: string | null
          raw_data: Json | null
          season_label: string | null
          slot_id: string | null
          status: string
        }
        Insert: {
          age_group?: string | null
          club_id: string
          created_at?: string | null
          game_date: string
          gender?: string | null
          id?: string
          league?: string | null
          notes?: string | null
          opponent: string
          our_team?: string | null
          raw_data?: Json | null
          season_label?: string | null
          slot_id?: string | null
          status?: string
        }
        Update: {
          age_group?: string | null
          club_id?: string
          created_at?: string | null
          game_date?: string
          gender?: string | null
          id?: string
          league?: string | null
          notes?: string | null
          opponent?: string
          our_team?: string | null
          raw_data?: Json | null
          season_label?: string | null
          slot_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_games_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_games_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "game_slots"
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
      player_emergency_contacts: {
        Row: {
          created_at: string | null
          id: string
          name: string
          phone: string | null
          player_id: string
          relationship: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          phone?: string | null
          player_id: string
          relationship?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          phone?: string | null
          player_id?: string
          relationship?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_emergency_contacts_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_evaluations: {
        Row: {
          ai_draft: string | null
          approved_at: string | null
          approved_by: string | null
          batch_id: string
          club_id: string
          coach_id: string | null
          created_at: string | null
          final_text: string | null
          id: string
          period_label: string
          player_id: string
          published_at: string | null
          q1_improvement: string | null
          q2_focus: string | null
          q3_message: string | null
          rating_mental: number | null
          rating_physical: number | null
          rating_tactical: number | null
          rating_technical: number | null
          report_data: Json | null
          season_label: string
          status: string | null
          submitted_at: string | null
          team_id: string
        }
        Insert: {
          ai_draft?: string | null
          approved_at?: string | null
          approved_by?: string | null
          batch_id: string
          club_id: string
          coach_id?: string | null
          created_at?: string | null
          final_text?: string | null
          id?: string
          period_label: string
          player_id: string
          published_at?: string | null
          q1_improvement?: string | null
          q2_focus?: string | null
          q3_message?: string | null
          rating_mental?: number | null
          rating_physical?: number | null
          rating_tactical?: number | null
          rating_technical?: number | null
          report_data?: Json | null
          season_label: string
          status?: string | null
          submitted_at?: string | null
          team_id: string
        }
        Update: {
          ai_draft?: string | null
          approved_at?: string | null
          approved_by?: string | null
          batch_id?: string
          club_id?: string
          coach_id?: string | null
          created_at?: string | null
          final_text?: string | null
          id?: string
          period_label?: string
          player_id?: string
          published_at?: string | null
          q1_improvement?: string | null
          q2_focus?: string | null
          q3_message?: string | null
          rating_mental?: number | null
          rating_physical?: number | null
          rating_tactical?: number | null
          rating_technical?: number | null
          report_data?: Json | null
          season_label?: string
          status?: string | null
          submitted_at?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_evaluations_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_evaluations_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "evaluation_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_evaluations_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_evaluations_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_evaluations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_evaluations_team_id_fkey"
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
          claim_amount: number | null
          claim_method: string | null
          claim_note: string | null
          claim_status: string
          claimed_at: string | null
          claimed_by: string | null
          created_at: string | null
          created_by: string | null
          description: string
          discount: number
          discount_reason: string | null
          due_date: string | null
          event_id: string | null
          fee_model_version: string
          id: string
          installment_number: number | null
          installment_total: number | null
          last_reminded_at: string | null
          late_fee_applied: boolean | null
          notes: string | null
          payee_type: string
          payment_instructions: string | null
          payment_token: string
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
          claim_amount?: number | null
          claim_method?: string | null
          claim_note?: string | null
          claim_status?: string
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          description: string
          discount?: number
          discount_reason?: string | null
          due_date?: string | null
          event_id?: string | null
          fee_model_version?: string
          id?: string
          installment_number?: number | null
          installment_total?: number | null
          last_reminded_at?: string | null
          late_fee_applied?: boolean | null
          notes?: string | null
          payee_type?: string
          payment_instructions?: string | null
          payment_token?: string
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
          claim_amount?: number | null
          claim_method?: string | null
          claim_note?: string | null
          claim_status?: string
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string
          discount?: number
          discount_reason?: string | null
          due_date?: string | null
          event_id?: string | null
          fee_model_version?: string
          id?: string
          installment_number?: number | null
          installment_total?: number | null
          last_reminded_at?: string | null
          late_fee_applied?: boolean | null
          notes?: string | null
          payee_type?: string
          payment_instructions?: string | null
          payment_token?: string
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
            foreignKeyName: "player_fees_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            foreignKeyName: "player_fees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
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
      player_guardians: {
        Row: {
          created_at: string | null
          player_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string | null
          player_id: string
          profile_id: string
        }
        Update: {
          created_at?: string | null
          player_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_guardians_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_guardians_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      player_reflections: {
        Row: {
          created_at: string | null
          event_id: string
          id: string
          needs_improvement: string | null
          player_id: string
          rating: number
          submitted_by: string | null
          team_id: string
          updated_at: string | null
          went_well: string | null
        }
        Insert: {
          created_at?: string | null
          event_id: string
          id?: string
          needs_improvement?: string | null
          player_id: string
          rating: number
          submitted_by?: string | null
          team_id: string
          updated_at?: string | null
          went_well?: string | null
        }
        Update: {
          created_at?: string | null
          event_id?: string
          id?: string
          needs_improvement?: string | null
          player_id?: string
          rating?: number
          submitted_by?: string | null
          team_id?: string
          updated_at?: string | null
          went_well?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_reflections_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_reflections_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_reflections_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_reflections_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      player_shoutouts: {
        Row: {
          coach_id: string | null
          created_at: string | null
          event_id: string
          id: string
          note: string | null
          player_id: string
          tag: string
          team_id: string
        }
        Insert: {
          coach_id?: string | null
          created_at?: string | null
          event_id: string
          id?: string
          note?: string | null
          player_id: string
          tag: string
          team_id: string
        }
        Update: {
          coach_id?: string | null
          created_at?: string | null
          event_id?: string
          id?: string
          note?: string | null
          player_id?: string
          tag?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_shoutouts_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_shoutouts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_shoutouts_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_shoutouts_team_id_fkey"
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
          medical_notes: string | null
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
          medical_notes?: string | null
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
          medical_notes?: string | null
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
          address: string | null
          avatar_url: string | null
          club_id: string | null
          created_at: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          full_name: string | null
          home_address: string | null
          id: string
          notification_prefs: Json
          onboarded_at: string | null
          payment_instructions: string | null
          phone: string | null
          preferred_language: string | null
          role: string | null
          share_contact_with_team: boolean
          stripe_customer_id: string | null
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          club_id?: string | null
          created_at?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          full_name?: string | null
          home_address?: string | null
          id: string
          notification_prefs?: Json
          onboarded_at?: string | null
          payment_instructions?: string | null
          phone?: string | null
          preferred_language?: string | null
          role?: string | null
          share_contact_with_team?: boolean
          stripe_customer_id?: string | null
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          club_id?: string | null
          created_at?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          full_name?: string | null
          home_address?: string | null
          id?: string
          notification_prefs?: Json
          onboarded_at?: string | null
          payment_instructions?: string | null
          phone?: string | null
          preferred_language?: string | null
          role?: string | null
          share_contact_with_team?: boolean
          stripe_customer_id?: string | null
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
      registration_document_uploads: {
        Row: {
          created_at: string | null
          doc_name: string
          file_url: string | null
          id: string
          submission_id: string
          uploaded_at: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string | null
          doc_name: string
          file_url?: string | null
          id?: string
          submission_id: string
          uploaded_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string | null
          doc_name?: string
          file_url?: string | null
          id?: string
          submission_id?: string
          uploaded_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registration_document_uploads_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "registration_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_document_uploads_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_email_templates: {
        Row: {
          active: boolean | null
          body_html: string
          club_id: string
          created_at: string | null
          id: string
          subject: string
          trigger_name: string
        }
        Insert: {
          active?: boolean | null
          body_html: string
          club_id: string
          created_at?: string | null
          id?: string
          subject: string
          trigger_name: string
        }
        Update: {
          active?: boolean | null
          body_html?: string
          club_id?: string
          created_at?: string | null
          id?: string
          subject?: string
          trigger_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_email_templates_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_forms: {
        Row: {
          allow_late_reg: boolean | null
          archived: boolean | null
          close_at: string | null
          club_id: string
          confirmation_message: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          deadline: string | null
          description: string | null
          early_access_ends_at: string | null
          field_logic: Json | null
          fields: Json
          financial_aid_enabled: boolean | null
          id: string
          max_spots: number | null
          open_at: string | null
          payment_options: string | null
          plan_deposit: number | null
          plan_frequency: string | null
          plan_installments: number | null
          price: number | null
          price_mode: string | null
          price_tiers: Json | null
          required_docs: Json | null
          season_label: string | null
          send_confirmation_email: boolean | null
          status: string | null
          team_id: string | null
          title: string
          token: string
          views_count: number | null
          volunteer_slots: Json | null
        }
        Insert: {
          allow_late_reg?: boolean | null
          archived?: boolean | null
          close_at?: string | null
          club_id: string
          confirmation_message?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          deadline?: string | null
          description?: string | null
          early_access_ends_at?: string | null
          field_logic?: Json | null
          fields?: Json
          financial_aid_enabled?: boolean | null
          id?: string
          max_spots?: number | null
          open_at?: string | null
          payment_options?: string | null
          plan_deposit?: number | null
          plan_frequency?: string | null
          plan_installments?: number | null
          price?: number | null
          price_mode?: string | null
          price_tiers?: Json | null
          required_docs?: Json | null
          season_label?: string | null
          send_confirmation_email?: boolean | null
          status?: string | null
          team_id?: string | null
          title: string
          token?: string
          views_count?: number | null
          volunteer_slots?: Json | null
        }
        Update: {
          allow_late_reg?: boolean | null
          archived?: boolean | null
          close_at?: string | null
          club_id?: string
          confirmation_message?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          deadline?: string | null
          description?: string | null
          early_access_ends_at?: string | null
          field_logic?: Json | null
          fields?: Json
          financial_aid_enabled?: boolean | null
          id?: string
          max_spots?: number | null
          open_at?: string | null
          payment_options?: string | null
          plan_deposit?: number | null
          plan_frequency?: string | null
          plan_installments?: number | null
          price?: number | null
          price_mode?: string | null
          price_tiers?: Json | null
          required_docs?: Json | null
          season_label?: string | null
          send_confirmation_email?: boolean | null
          status?: string | null
          team_id?: string | null
          title?: string
          token?: string
          views_count?: number | null
          volunteer_slots?: Json | null
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
      registration_installments: {
        Row: {
          amount: number
          created_at: string | null
          due_date: string | null
          id: string
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          reference: string | null
          submission_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          reference?: string | null
          submission_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          reference?: string | null
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_installments_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "registration_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_late_invites: {
        Row: {
          email: string
          expires_at: string | null
          form_id: string
          id: string
          sent_at: string | null
          token: string | null
          used_at: string | null
        }
        Insert: {
          email: string
          expires_at?: string | null
          form_id: string
          id?: string
          sent_at?: string | null
          token?: string | null
          used_at?: string | null
        }
        Update: {
          email?: string
          expires_at?: string | null
          form_id?: string
          id?: string
          sent_at?: string | null
          token?: string | null
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registration_late_invites_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "registration_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_promo_codes: {
        Row: {
          active: boolean | null
          club_id: string
          code: string
          created_at: string | null
          created_by: string | null
          discount_type: string | null
          discount_value: number
          expires_at: string | null
          form_id: string | null
          id: string
          max_uses: number | null
          uses_count: number | null
        }
        Insert: {
          active?: boolean | null
          club_id: string
          code: string
          created_at?: string | null
          created_by?: string | null
          discount_type?: string | null
          discount_value: number
          expires_at?: string | null
          form_id?: string | null
          id?: string
          max_uses?: number | null
          uses_count?: number | null
        }
        Update: {
          active?: boolean | null
          club_id?: string
          code?: string
          created_at?: string | null
          created_by?: string | null
          discount_type?: string | null
          discount_value?: number
          expires_at?: string | null
          form_id?: string | null
          id?: string
          max_uses?: number | null
          uses_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "registration_promo_codes_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_promo_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_promo_codes_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "registration_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_submissions: {
        Row: {
          amount_due: number | null
          amount_paid: number | null
          data: Json
          discount_applied: number | null
          duplicate_of: string | null
          family_group_id: string | null
          fee_waived: boolean | null
          financial_aid_amount: number | null
          financial_aid_approved: boolean | null
          financial_aid_requested: boolean | null
          form_id: string
          id: string
          internal_notes: string | null
          is_duplicate_flagged: boolean | null
          is_returning: boolean | null
          notes: string | null
          offline_payment_date: string | null
          offline_payment_method: string | null
          offline_payment_ref: string | null
          payment_choice: string | null
          payment_status: string | null
          promo_code_used: string | null
          refund_notes: string | null
          refunded_amount: number
          reviewer_id: string | null
          roster_added_at: string | null
          roster_player_id: string | null
          status: string | null
          submitted_at: string | null
          waitlist_position: number | null
        }
        Insert: {
          amount_due?: number | null
          amount_paid?: number | null
          data?: Json
          discount_applied?: number | null
          duplicate_of?: string | null
          family_group_id?: string | null
          fee_waived?: boolean | null
          financial_aid_amount?: number | null
          financial_aid_approved?: boolean | null
          financial_aid_requested?: boolean | null
          form_id: string
          id?: string
          internal_notes?: string | null
          is_duplicate_flagged?: boolean | null
          is_returning?: boolean | null
          notes?: string | null
          offline_payment_date?: string | null
          offline_payment_method?: string | null
          offline_payment_ref?: string | null
          payment_choice?: string | null
          payment_status?: string | null
          promo_code_used?: string | null
          refund_notes?: string | null
          refunded_amount?: number
          reviewer_id?: string | null
          roster_added_at?: string | null
          roster_player_id?: string | null
          status?: string | null
          submitted_at?: string | null
          waitlist_position?: number | null
        }
        Update: {
          amount_due?: number | null
          amount_paid?: number | null
          data?: Json
          discount_applied?: number | null
          duplicate_of?: string | null
          family_group_id?: string | null
          fee_waived?: boolean | null
          financial_aid_amount?: number | null
          financial_aid_approved?: boolean | null
          financial_aid_requested?: boolean | null
          form_id?: string
          id?: string
          internal_notes?: string | null
          is_duplicate_flagged?: boolean | null
          is_returning?: boolean | null
          notes?: string | null
          offline_payment_date?: string | null
          offline_payment_method?: string | null
          offline_payment_ref?: string | null
          payment_choice?: string | null
          payment_status?: string | null
          promo_code_used?: string | null
          refund_notes?: string | null
          refunded_amount?: number
          reviewer_id?: string | null
          roster_added_at?: string | null
          roster_player_id?: string | null
          status?: string | null
          submitted_at?: string | null
          waitlist_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "registration_submissions_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "registration_submissions"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "registration_submissions_roster_player_id_fkey"
            columns: ["roster_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_volunteer_signups: {
        Row: {
          created_at: string | null
          form_id: string
          id: string
          slot_id: string
          slot_label: string
          submission_id: string
        }
        Insert: {
          created_at?: string | null
          form_id: string
          id?: string
          slot_id: string
          slot_label: string
          submission_id: string
        }
        Update: {
          created_at?: string | null
          form_id?: string
          id?: string
          slot_id?: string
          slot_label?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_volunteer_signups_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "registration_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_volunteer_signups_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "registration_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_certifications: {
        Row: {
          cert_type: string
          club_id: string
          created_at: string | null
          custom_label: string | null
          doc_url: string | null
          expiry_date: string | null
          id: string
          license_level: string | null
          profile_id: string
          rejection_note: string | null
          status: string
          submitted_at: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          cert_type: string
          club_id: string
          created_at?: string | null
          custom_label?: string | null
          doc_url?: string | null
          expiry_date?: string | null
          id?: string
          license_level?: string | null
          profile_id: string
          rejection_note?: string | null
          status?: string
          submitted_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          cert_type?: string
          club_id?: string
          created_at?: string | null
          custom_label?: string | null
          doc_url?: string | null
          expiry_date?: string | null
          id?: string
          license_level?: string | null
          profile_id?: string
          rejection_note?: string | null
          status?: string
          submitted_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_certifications_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_certifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_certifications_verified_by_fkey"
            columns: ["verified_by"]
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
      team_callout_responses: {
        Row: {
          callout_id: string
          created_at: string | null
          id: string
          profile_id: string
          response: string
        }
        Insert: {
          callout_id: string
          created_at?: string | null
          id?: string
          profile_id: string
          response: string
        }
        Update: {
          callout_id?: string
          created_at?: string | null
          id?: string
          profile_id?: string
          response?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_callout_responses_callout_id_fkey"
            columns: ["callout_id"]
            isOneToOne: false
            referencedRelation: "team_callouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_callout_responses_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_callouts: {
        Row: {
          body: string | null
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          team_id: string
          title: string
          urgency: string
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          team_id: string
          title: string
          urgency?: string
        }
        Update: {
          body?: string | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          team_id?: string
          title?: string
          urgency?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_callouts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_callouts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
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
      team_photo_likes: {
        Row: {
          created_at: string | null
          photo_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string | null
          photo_id: string
          profile_id: string
        }
        Update: {
          created_at?: string | null
          photo_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_photo_likes_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "team_photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_photo_likes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_photos: {
        Row: {
          caption: string | null
          created_at: string | null
          event_id: string | null
          id: string
          storage_path: string
          team_id: string
          uploaded_by: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          event_id?: string | null
          id?: string
          storage_path: string
          team_id: string
          uploaded_by?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          event_id?: string | null
          id?: string
          storage_path?: string
          team_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_photos_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_photos_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_poll_options: {
        Row: {
          id: string
          label: string
          poll_id: string
          sort_order: number
        }
        Insert: {
          id?: string
          label: string
          poll_id: string
          sort_order?: number
        }
        Update: {
          id?: string
          label?: string
          poll_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "team_poll_options_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "team_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      team_poll_votes: {
        Row: {
          created_at: string | null
          id: string
          option_id: string
          poll_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          option_id: string
          poll_id: string
          profile_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          option_id?: string
          poll_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_poll_votes_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "team_poll_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "team_polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_poll_votes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_polls: {
        Row: {
          closes_at: string | null
          created_at: string | null
          created_by: string | null
          event_id: string | null
          id: string
          is_anonymous: boolean
          is_multiple_choice: boolean
          question: string
          result_visibility: string
          rsvp_gated: boolean
          team_id: string
        }
        Insert: {
          closes_at?: string | null
          created_at?: string | null
          created_by?: string | null
          event_id?: string | null
          id?: string
          is_anonymous?: boolean
          is_multiple_choice?: boolean
          question: string
          result_visibility?: string
          rsvp_gated?: boolean
          team_id: string
        }
        Update: {
          closes_at?: string | null
          created_at?: string | null
          created_by?: string | null
          event_id?: string | null
          id?: string
          is_anonymous?: boolean
          is_multiple_choice?: boolean
          question?: string
          result_visibility?: string
          rsvp_gated?: boolean
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_polls_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_polls_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_polls_team_id_fkey"
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
          packet_sent_at: string | null
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
          packet_sent_at?: string | null
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
          packet_sent_at?: string | null
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
          slot_id: string | null
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
          slot_id?: string | null
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
          slot_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tryout_expenses_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tryout_expenses_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "tryout_practice_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      tryout_fields: {
        Row: {
          address: string | null
          club_id: string
          created_at: string | null
          dimensions: string | null
          facilities: string[] | null
          facility_contact_name: string | null
          facility_contact_phone: string | null
          field_group: string | null
          field_notes: string | null
          field_size: string | null
          half_a_name: string | null
          half_b_name: string | null
          has_lights: boolean | null
          id: string
          is_active: boolean | null
          is_closed: boolean | null
          is_full_field: boolean
          lat: number | null
          lng: number | null
          name: string
          rental_cost_per_hour: number | null
          scheduler_format: string
          scheduler_split: number
          sort_order: number | null
          sub_zones: string[] | null
          surface: string | null
          surface_type: string | null
        }
        Insert: {
          address?: string | null
          club_id: string
          created_at?: string | null
          dimensions?: string | null
          facilities?: string[] | null
          facility_contact_name?: string | null
          facility_contact_phone?: string | null
          field_group?: string | null
          field_notes?: string | null
          field_size?: string | null
          half_a_name?: string | null
          half_b_name?: string | null
          has_lights?: boolean | null
          id?: string
          is_active?: boolean | null
          is_closed?: boolean | null
          is_full_field?: boolean
          lat?: number | null
          lng?: number | null
          name: string
          rental_cost_per_hour?: number | null
          scheduler_format?: string
          scheduler_split?: number
          sort_order?: number | null
          sub_zones?: string[] | null
          surface?: string | null
          surface_type?: string | null
        }
        Update: {
          address?: string | null
          club_id?: string
          created_at?: string | null
          dimensions?: string | null
          facilities?: string[] | null
          facility_contact_name?: string | null
          facility_contact_phone?: string | null
          field_group?: string | null
          field_notes?: string | null
          field_size?: string | null
          half_a_name?: string | null
          half_b_name?: string | null
          has_lights?: boolean | null
          id?: string
          is_active?: boolean | null
          is_closed?: boolean | null
          is_full_field?: boolean
          lat?: number | null
          lng?: number | null
          name?: string
          rental_cost_per_hour?: number | null
          scheduler_format?: string
          scheduler_split?: number
          sort_order?: number | null
          sub_zones?: string[] | null
          surface?: string | null
          surface_type?: string | null
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
            isOneToOne: true
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
            isOneToOne: true
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
          birth_year?: number | null
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
          full_name?: string | null
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
          birth_year?: number | null
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
          full_name?: string | null
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
      web_push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          id: string
          p256dh: string
          profile_id: string
        }
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh: string
          profile_id: string
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "web_push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      guest_request_fill: {
        Row: {
          filled_count: number | null
          request_id: string | null
          spots_needed: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_invite: { Args: { p_token: string }; Returns: Json }
      assign_fee_to_attendees:
        | {
            Args: {
              p_amount_due: number
              p_category_id?: string
              p_description: string
              p_due_date: string
              p_player_ids: string[]
              p_team_id: string
            }
            Returns: {
              amount_due: number
              amount_paid: number
              category_id: string | null
              claim_amount: number | null
              claim_method: string | null
              claim_note: string | null
              claim_status: string
              claimed_at: string | null
              claimed_by: string | null
              created_at: string | null
              created_by: string | null
              description: string
              discount: number
              discount_reason: string | null
              due_date: string | null
              event_id: string | null
              fee_model_version: string
              id: string
              installment_number: number | null
              installment_total: number | null
              last_reminded_at: string | null
              late_fee_applied: boolean | null
              notes: string | null
              payee_type: string
              payment_instructions: string | null
              payment_token: string
              plan_group_id: string | null
              player_id: string
              status: string | null
              team_id: string
              updated_at: string | null
            }[]
            SetofOptions: {
              from: "*"
              to: "player_fees"
              isOneToOne: false
              isSetofReturn: true
            }
          }
        | {
            Args: {
              p_amount_due: number
              p_category_id?: string
              p_description: string
              p_due_date: string
              p_payee_type?: string
              p_payment_instructions?: string
              p_player_ids: string[]
              p_team_id: string
            }
            Returns: {
              amount_due: number
              amount_paid: number
              category_id: string | null
              claim_amount: number | null
              claim_method: string | null
              claim_note: string | null
              claim_status: string
              claimed_at: string | null
              claimed_by: string | null
              created_at: string | null
              created_by: string | null
              description: string
              discount: number
              discount_reason: string | null
              due_date: string | null
              event_id: string | null
              fee_model_version: string
              id: string
              installment_number: number | null
              installment_total: number | null
              last_reminded_at: string | null
              late_fee_applied: boolean | null
              notes: string | null
              payee_type: string
              payment_instructions: string | null
              payment_token: string
              plan_group_id: string | null
              player_id: string
              status: string | null
              team_id: string
              updated_at: string | null
            }[]
            SetofOptions: {
              from: "*"
              to: "player_fees"
              isOneToOne: false
              isSetofReturn: true
            }
          }
        | {
            Args: {
              p_amount_due: number
              p_category_id?: string
              p_description: string
              p_due_date: string
              p_event_id?: string
              p_payee_type?: string
              p_payment_instructions?: string
              p_player_ids: string[]
              p_team_id: string
            }
            Returns: {
              amount_due: number
              amount_paid: number
              category_id: string | null
              claim_amount: number | null
              claim_method: string | null
              claim_note: string | null
              claim_status: string
              claimed_at: string | null
              claimed_by: string | null
              created_at: string | null
              created_by: string | null
              description: string
              discount: number
              discount_reason: string | null
              due_date: string | null
              event_id: string | null
              fee_model_version: string
              id: string
              installment_number: number | null
              installment_total: number | null
              last_reminded_at: string | null
              late_fee_applied: boolean | null
              notes: string | null
              payee_type: string
              payment_instructions: string | null
              payment_token: string
              plan_group_id: string | null
              player_id: string
              status: string | null
              team_id: string
              updated_at: string | null
            }[]
            SetofOptions: {
              from: "*"
              to: "player_fees"
              isOneToOne: false
              isSetofReturn: true
            }
          }
      can_manage_player_photo: {
        Args: { p_object_name: string }
        Returns: boolean
      }
      claim_fee_payment: {
        Args: {
          p_amount: number
          p_fee_id: string
          p_method: string
          p_note?: string
        }
        Returns: {
          amount_due: number
          amount_paid: number
          category_id: string | null
          claim_amount: number | null
          claim_method: string | null
          claim_note: string | null
          claim_status: string
          claimed_at: string | null
          claimed_by: string | null
          created_at: string | null
          created_by: string | null
          description: string
          discount: number
          discount_reason: string | null
          due_date: string | null
          event_id: string | null
          fee_model_version: string
          id: string
          installment_number: number | null
          installment_total: number | null
          last_reminded_at: string | null
          late_fee_applied: boolean | null
          notes: string | null
          payee_type: string
          payment_instructions: string | null
          payment_token: string
          plan_group_id: string | null
          player_id: string
          status: string | null
          team_id: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "player_fees"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_guest_spot: {
        Args: { p_player_id: string; p_request_id: string }
        Returns: {
          added_by: string | null
          created_at: string
          event_id: string
          full_name: string
          id: string
          player_id: string | null
          profile_id: string | null
          responded_at: string | null
          role: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "event_guests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirm_fee_payment: {
        Args: {
          p_amount?: number
          p_fee_id: string
          p_method?: string
          p_reference?: string
        }
        Returns: {
          amount_due: number
          amount_paid: number
          category_id: string | null
          claim_amount: number | null
          claim_method: string | null
          claim_note: string | null
          claim_status: string
          claimed_at: string | null
          claimed_by: string | null
          created_at: string | null
          created_by: string | null
          description: string
          discount: number
          discount_reason: string | null
          due_date: string | null
          event_id: string | null
          fee_model_version: string
          id: string
          installment_number: number | null
          installment_total: number | null
          last_reminded_at: string | null
          late_fee_applied: boolean | null
          notes: string | null
          payee_type: string
          payment_instructions: string | null
          payment_token: string
          plan_group_id: string | null
          player_id: string
          status: string | null
          team_id: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "player_fees"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_guest_request: {
        Args: {
          p_event_id: string
          p_note: string
          p_requesting_team_id: string
          p_spots_needed: number
          p_target_team_ids: string[]
        }
        Returns: {
          created_at: string
          created_by: string | null
          event_id: string
          id: string
          note: string | null
          requesting_team_id: string
          spots_needed: number
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "guest_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_user_club_id: { Args: never; Returns: string }
      current_user_role: { Args: never; Returns: string }
      decline_fee_claim: {
        Args: { p_fee_id: string }
        Returns: {
          amount_due: number
          amount_paid: number
          category_id: string | null
          claim_amount: number | null
          claim_method: string | null
          claim_note: string | null
          claim_status: string
          claimed_at: string | null
          claimed_by: string | null
          created_at: string | null
          created_by: string | null
          description: string
          discount: number
          discount_reason: string | null
          due_date: string | null
          event_id: string | null
          fee_model_version: string
          id: string
          installment_number: number | null
          installment_total: number | null
          last_reminded_at: string | null
          late_fee_applied: boolean | null
          notes: string | null
          payee_type: string
          payment_instructions: string | null
          payment_token: string
          plan_group_id: string | null
          player_id: string
          status: string | null
          team_id: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "player_fees"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_account: { Args: never; Returns: undefined }
      find_direct_conversation: {
        Args: { p_other_profile_id: string }
        Returns: string
      }
      find_my_pending_invites: {
        Args: never
        Returns: {
          club_name: string
          invite_id: string
          invite_role: string
          player_name: string
          team_name: string
          token: string
        }[]
      }
      get_my_guarded_players: {
        Args: never
        Returns: {
          created_at: string | null
          date_of_birth: string | null
          full_name: string
          id: string
          is_injured: boolean
          is_private: boolean
          jersey_number: number | null
          medical_notes: string | null
          notes: string | null
          photo_url: string | null
          position: string | null
          preferred_foot: string | null
          profile_id: string | null
          secondary_position: string | null
          team_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "players"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_team_contacts: {
        Args: { p_team_id: string }
        Returns: {
          guardian_name: string
          guardian_phone: string
          is_coach_viewer: boolean
          player_id: string
          player_name: string
        }[]
      }
      get_team_reflection_trends: {
        Args: { p_team_id: string }
        Returns: {
          avg_rating: number
          last_rating: number
          last_reflected_at: string
          player_id: string
          player_name: string
          recent_avg_rating: number
          reflection_count: number
          trend: string
        }[]
      }
      is_club_admin: { Args: { cid: string }; Returns: boolean }
      is_club_conversation: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      is_club_staff: { Args: { cid: string }; Returns: boolean }
      is_club_teammate: { Args: { p_club_id: string }; Returns: boolean }
      is_conversation_participant: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      is_event_coach_or_admin: {
        Args: { p_event_id: string }
        Returns: boolean
      }
      is_invite_manageable: {
        Args: { p_club_id: string; p_team_id: string }
        Returns: boolean
      }
      is_player_guardian: { Args: { p_player_id: string }; Returns: boolean }
      is_team_coach: { Args: { p_team_id: string }; Returns: boolean }
      is_team_member: { Args: { p_team_id: string }; Returns: boolean }
      owns_registration_form: { Args: { p_form_id: string }; Returns: boolean }
      revoke_guardian_access: {
        Args: { p_player_id: string; p_profile_id: string }
        Returns: Json
      }
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
