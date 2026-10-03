export type Json =
  string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      responsible_accounts: {
        Row: { user_id: string; created_at: string };
        Insert: { user_id: string; created_at?: string };
        Update: { user_id?: string; created_at?: string };
        Relationships: [];
      };
      passengers: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          default_daily_rate: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          default_daily_rate: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          default_daily_rate?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      rides: {
        Row: {
          id: string;
          user_id: string;
          passenger_id: string;
          ride_date: string;
          rate_charged: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          passenger_id: string;
          ride_date: string;
          rate_charged: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          passenger_id?: string;
          ride_date?: string;
          rate_charged?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      monthly_charges: {
        Row: {
          id: string;
          user_id: string;
          passenger_id: string;
          reference_month: string;
          total_amount: number;
          paid: boolean;
          paid_amount: number;
          paid_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          passenger_id: string;
          reference_month: string;
          total_amount: number;
          paid?: boolean;
          paid_amount?: number;
          paid_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          passenger_id?: string;
          reference_month?: string;
          total_amount?: number;
          paid?: boolean;
          paid_amount?: number;
          paid_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      received_rides: {
        Row: {
          id: string;
          user_id: string;
          passenger_id: string;
          received_date: string;
          amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          passenger_id: string;
          received_date: string;
          amount: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          passenger_id?: string;
          received_date?: string;
          amount?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      passenger_invites: {
        Row: {
          id: string;
          passenger_id: string;
          owner_user_id: string;
          token_hash: string;
          used: boolean;
          used_by: string | null;
          created_at: string;
          expires_at: string;
          used_at: string | null;
          revoked_at: string | null;
        };
        Insert: {
          id?: string;
          passenger_id: string;
          owner_user_id: string;
          token_hash: string;
          created_at?: string;
          expires_at?: string;
          used?: boolean;
          used_by?: string | null;
          used_at?: string | null;
          revoked_at?: string | null;
        };
        Update: {
          used?: boolean;
          used_by?: string | null;
          used_at?: string | null;
          revoked_at?: string | null;
        };
        Relationships: [];
      };
      passenger_accounts: {
        Row: {
          user_id: string;
          passenger_id: string;
          owner_user_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          passenger_id: string;
          owner_user_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          passenger_id?: string;
          owner_user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      ride_flags: {
        Row: {
          id: string;
          ride_id: string;
          flagged_by: string;
          resolved: boolean;
          resolved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          ride_id: string;
          flagged_by: string;
          resolved?: boolean;
          resolved_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          ride_id?: string;
          flagged_by?: string;
          resolved?: boolean;
          resolved_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_responsible: { Args: Record<string, never>; Returns: boolean };
      create_passenger_invite: {
        Args: { target_passenger: string; invite_token: string };
        Returns: string;
      };
      revoke_passenger_invite: { Args: { target_invite: string }; Returns: undefined };
      redeem_passenger_invite: {
        Args: { invite_code: string };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
