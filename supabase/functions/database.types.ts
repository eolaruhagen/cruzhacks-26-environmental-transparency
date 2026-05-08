export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      article_details: {
        Row: {
          artifact_id: string
          author: string[] | null
          description: string | null
          people: string[] | null
          source: string | null
          title: string
          topics: string[] | null
        }
        Insert: {
          artifact_id: string
          author?: string[] | null
          description?: string | null
          people?: string[] | null
          source?: string | null
          title: string
          topics?: string[] | null
        }
        Update: {
          artifact_id?: string
          author?: string[] | null
          description?: string | null
          people?: string[] | null
          source?: string | null
          title?: string
          topics?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "article_details_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: true
            referencedRelation: "artifacts"
            referencedColumns: ["id"]
          },
        ]
      }
      artifact_enrichments: {
        Row: {
          artifact_id: string
          associated_bills:
            | Database["public"]["CompositeTypes"]["bill_reference"][]
            | null
          associated_representatives: string[] | null
          environmental_topic: Database["public"]["Enums"]["bill_type"]
          impact_level: Database["public"]["Enums"]["impact_level"]
          key_quote: string | null
          sentiment: number
          stakeholders: string[] | null
          state: string | null
          summary: string
        }
        Insert: {
          artifact_id: string
          associated_bills?:
            | Database["public"]["CompositeTypes"]["bill_reference"][]
            | null
          associated_representatives?: string[] | null
          environmental_topic: Database["public"]["Enums"]["bill_type"]
          impact_level: Database["public"]["Enums"]["impact_level"]
          key_quote?: string | null
          sentiment: number
          stakeholders?: string[] | null
          state?: string | null
          summary: string
        }
        Update: {
          artifact_id?: string
          associated_bills?:
            | Database["public"]["CompositeTypes"]["bill_reference"][]
            | null
          associated_representatives?: string[] | null
          environmental_topic?: Database["public"]["Enums"]["bill_type"]
          impact_level?: Database["public"]["Enums"]["impact_level"]
          key_quote?: string | null
          sentiment?: number
          stakeholders?: string[] | null
          state?: string | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "artifact_enrichments_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: true
            referencedRelation: "artifacts"
            referencedColumns: ["id"]
          },
        ]
      }
      artifacts: {
        Row: {
          created_at: string | null
          embedding: unknown
          id: string
          published_at: string | null
          source_icon_url: string | null
          story_id: string | null
          type: Database["public"]["Enums"]["artifact_type"]
          updated_at: string | null
          url: string
        }
        Insert: {
          created_at?: string | null
          embedding?: unknown
          id?: string
          published_at?: string | null
          source_icon_url?: string | null
          story_id?: string | null
          type: Database["public"]["Enums"]["artifact_type"]
          updated_at?: string | null
          url: string
        }
        Update: {
          created_at?: string | null
          embedding?: unknown
          id?: string
          published_at?: string | null
          source_icon_url?: string | null
          story_id?: string | null
          type?: Database["public"]["Enums"]["artifact_type"]
          updated_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "artifacts_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      categories_embeddings: {
        Row: {
          bill_type: Database["public"]["Enums"]["bill_type"]
          created_at: string | null
          description: string
          embedding: unknown
          id: string
          subcategory: string
        }
        Insert: {
          bill_type: Database["public"]["Enums"]["bill_type"]
          created_at?: string | null
          description: string
          embedding?: unknown
          id?: string
          subcategory: string
        }
        Update: {
          bill_type?: Database["public"]["Enums"]["bill_type"]
          created_at?: string | null
          description?: string
          embedding?: unknown
          id?: string
          subcategory?: string
        }
        Relationships: []
      }
      congress_sync_state: {
        Row: {
          collector_status: string | null
          created_at: string | null
          current_congress: number | null
          daily_request_count: number | null
          fetcher_status: string | null
          id: string
          last_error: string | null
          last_null_count: number | null
          last_request_reset: string | null
          last_sync_date: string | null
          pipeline_stage: string | null
          stagnant_cycles: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          collector_status?: string | null
          created_at?: string | null
          current_congress?: number | null
          daily_request_count?: number | null
          fetcher_status?: string | null
          id?: string
          last_error?: string | null
          last_null_count?: number | null
          last_request_reset?: string | null
          last_sync_date?: string | null
          pipeline_stage?: string | null
          stagnant_cycles?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          collector_status?: string | null
          created_at?: string | null
          current_congress?: number | null
          daily_request_count?: number | null
          fetcher_status?: string | null
          id?: string
          last_error?: string | null
          last_null_count?: number | null
          last_request_reset?: string | null
          last_sync_date?: string | null
          pipeline_stage?: string | null
          stagnant_cycles?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      congress_sync_state_new: {
        Row: {
          api_rate_limit_reset_at: string | null
          created_at: string
          id: number
          last_error: string | null
          last_sync_at: string | null
          updated_at: string
        }
        Insert: {
          api_rate_limit_reset_at?: string | null
          created_at?: string
          id: number
          last_error?: string | null
          last_sync_at?: string | null
          updated_at?: string
        }
        Update: {
          api_rate_limit_reset_at?: string | null
          created_at?: string
          id?: number
          last_error?: string | null
          last_sync_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      house_bills: {
        Row: {
          bill_policy_area: string | null
          bill_text: string
          category: Database["public"]["Enums"]["bill_type"] | null
          committees: string | null
          congress: string
          congress_number: number
          congress_years: number[]
          cosponsors: string[] | null
          created_at: string
          date_of_introduction: string | null
          embedding: unknown
          id: string
          latest_action: string
          latest_action_date: string | null
          latest_summary: string | null
          latest_tracker_stage: string
          legislation_number: string
          num_cosponsors: number | null
          party_of_sponsor: string
          sponsor: string
          subcategory_scores: Json | null
          subject_terms: string[] | null
          title: string
          updated_at: string
          updated_category: Database["public"]["Enums"]["bill_type"] | null
          url: string
        }
        Insert: {
          bill_policy_area?: string | null
          bill_text?: string
          category?: Database["public"]["Enums"]["bill_type"] | null
          committees?: string | null
          congress: string
          congress_number?: number
          congress_years?: number[]
          cosponsors?: string[] | null
          created_at?: string
          date_of_introduction?: string | null
          embedding?: unknown
          id?: string
          latest_action: string
          latest_action_date?: string | null
          latest_summary?: string | null
          latest_tracker_stage: string
          legislation_number: string
          num_cosponsors?: number | null
          party_of_sponsor: string
          sponsor: string
          subcategory_scores?: Json | null
          subject_terms?: string[] | null
          title: string
          updated_at?: string
          updated_category?: Database["public"]["Enums"]["bill_type"] | null
          url: string
        }
        Update: {
          bill_policy_area?: string | null
          bill_text?: string
          category?: Database["public"]["Enums"]["bill_type"] | null
          committees?: string | null
          congress?: string
          congress_number?: number
          congress_years?: number[]
          cosponsors?: string[] | null
          created_at?: string
          date_of_introduction?: string | null
          embedding?: unknown
          id?: string
          latest_action?: string
          latest_action_date?: string | null
          latest_summary?: string | null
          latest_tracker_stage?: string
          legislation_number?: string
          num_cosponsors?: number | null
          party_of_sponsor?: string
          sponsor?: string
          subcategory_scores?: Json | null
          subject_terms?: string[] | null
          title?: string
          updated_at?: string
          updated_category?: Database["public"]["Enums"]["bill_type"] | null
          url?: string
        }
        Relationships: []
      }
      house_bills_2: {
        Row: {
          bill_number: number
          bill_policy_area: string | null
          bill_text: string | null
          bill_type: Database["public"]["Enums"]["legislation_type"]
          category: Database["public"]["Enums"]["bill_type"] | null
          committees: string[]
          congress: number
          congress_end_year: number
          congress_start_year: number
          congress_update_date: string | null
          congress_update_date_including_text: string | null
          cosponsor_bioguide_ids: string[]
          created_at: string
          date_of_introduction: string | null
          embedding: unknown
          id: string
          is_law: boolean
          latest_action: string | null
          latest_action_code: string | null
          latest_action_date: string | null
          latest_action_type: string | null
          latest_summary: string | null
          law_number: string | null
          law_type: string | null
          num_cosponsors: number
          origin_chamber: Database["public"]["Enums"]["chamber"]
          sponsor_bioguide_id: string | null
          subcategory_scores: Json | null
          subject_terms: string[]
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          bill_number: number
          bill_policy_area?: string | null
          bill_text?: string | null
          bill_type: Database["public"]["Enums"]["legislation_type"]
          category?: Database["public"]["Enums"]["bill_type"] | null
          committees?: string[]
          congress: number
          congress_end_year: number
          congress_start_year: number
          congress_update_date?: string | null
          congress_update_date_including_text?: string | null
          cosponsor_bioguide_ids?: string[]
          created_at?: string
          date_of_introduction?: string | null
          embedding?: unknown
          id?: string
          is_law?: boolean
          latest_action?: string | null
          latest_action_code?: string | null
          latest_action_date?: string | null
          latest_action_type?: string | null
          latest_summary?: string | null
          law_number?: string | null
          law_type?: string | null
          num_cosponsors?: number
          origin_chamber: Database["public"]["Enums"]["chamber"]
          sponsor_bioguide_id?: string | null
          subcategory_scores?: Json | null
          subject_terms?: string[]
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          bill_number?: number
          bill_policy_area?: string | null
          bill_text?: string | null
          bill_type?: Database["public"]["Enums"]["legislation_type"]
          category?: Database["public"]["Enums"]["bill_type"] | null
          committees?: string[]
          congress?: number
          congress_end_year?: number
          congress_start_year?: number
          congress_update_date?: string | null
          congress_update_date_including_text?: string | null
          cosponsor_bioguide_ids?: string[]
          created_at?: string
          date_of_introduction?: string | null
          embedding?: unknown
          id?: string
          is_law?: boolean
          latest_action?: string | null
          latest_action_code?: string | null
          latest_action_date?: string | null
          latest_action_type?: string | null
          latest_summary?: string | null
          law_number?: string | null
          law_type?: string | null
          num_cosponsors?: number
          origin_chamber?: Database["public"]["Enums"]["chamber"]
          sponsor_bioguide_id?: string | null
          subcategory_scores?: Json | null
          subject_terms?: string[]
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "house_bills_2_sponsor_bioguide_id_fkey"
            columns: ["sponsor_bioguide_id"]
            isOneToOne: false
            referencedRelation: "representatives"
            referencedColumns: ["bioguide_id"]
          },
        ]
      }
      incomplete_bills: {
        Row: {
          bill_policy_area: string | null
          committees: string | null
          congress: string
          cosponsors: string[] | null
          created_at: string | null
          date_of_introduction: string | null
          id: string
          latest_action: string | null
          latest_action_date: string | null
          latest_summary: string | null
          latest_tracker_stage: string | null
          legislation_number: string
          num_cosponsors: number | null
          party_of_sponsor: string | null
          sponsor: string | null
          subject_terms: string[] | null
          title: string | null
          updated_at: string | null
          url: string | null
        }
        Insert: {
          bill_policy_area?: string | null
          committees?: string | null
          congress: string
          cosponsors?: string[] | null
          created_at?: string | null
          date_of_introduction?: string | null
          id?: string
          latest_action?: string | null
          latest_action_date?: string | null
          latest_summary?: string | null
          latest_tracker_stage?: string | null
          legislation_number: string
          num_cosponsors?: number | null
          party_of_sponsor?: string | null
          sponsor?: string | null
          subject_terms?: string[] | null
          title?: string | null
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          bill_policy_area?: string | null
          committees?: string | null
          congress?: string
          cosponsors?: string[] | null
          created_at?: string | null
          date_of_introduction?: string | null
          id?: string
          latest_action?: string | null
          latest_action_date?: string | null
          latest_summary?: string | null
          latest_tracker_stage?: string | null
          legislation_number?: string
          num_cosponsors?: number | null
          party_of_sponsor?: string | null
          sponsor?: string | null
          subject_terms?: string[] | null
          title?: string | null
          updated_at?: string | null
          url?: string | null
        }
        Relationships: []
      }
      representatives: {
        Row: {
          bioguide_id: string
          created_at: string
          district: number | null
          first_name: string | null
          is_active: boolean
          last_name: string | null
          last_seen_in_congress: number | null
          middle_name: string | null
          party: Database["public"]["Enums"]["party"] | null
          role: Database["public"]["Enums"]["chamber"]
          state: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          bioguide_id: string
          created_at?: string
          district?: number | null
          first_name?: string | null
          is_active?: boolean
          last_name?: string | null
          last_seen_in_congress?: number | null
          middle_name?: string | null
          party?: Database["public"]["Enums"]["party"] | null
          role: Database["public"]["Enums"]["chamber"]
          state?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          bioguide_id?: string
          created_at?: string
          district?: number | null
          first_name?: string | null
          is_active?: boolean
          last_name?: string | null
          last_seen_in_congress?: number | null
          middle_name?: string | null
          party?: Database["public"]["Enums"]["party"] | null
          role?: Database["public"]["Enums"]["chamber"]
          state?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "representatives_state_fkey"
            columns: ["state"]
            isOneToOne: false
            referencedRelation: "states"
            referencedColumns: ["code"]
          },
        ]
      }
      states: {
        Row: {
          code: string
          kind: string
          name: string
        }
        Insert: {
          code: string
          kind: string
          name: string
        }
        Update: {
          code?: string
          kind?: string
          name?: string
        }
        Relationships: []
      }
      stories: {
        Row: {
          centroid: unknown
          created_at: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          centroid?: unknown
          created_at?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          centroid?: unknown
          created_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_and_reset_daily_limit: { Args: never; Returns: undefined }
      get_current_sync_state: {
        Args: never
        Returns: {
          collector_status: string | null
          created_at: string | null
          current_congress: number | null
          daily_request_count: number | null
          fetcher_status: string | null
          id: string
          last_error: string | null
          last_null_count: number | null
          last_request_reset: string | null
          last_sync_date: string | null
          pipeline_stage: string | null
          stagnant_cycles: number | null
          status: string | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "congress_sync_state"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      increment_api_request_count: {
        Args: { p_increment: number }
        Returns: undefined
      }
      pgmq_archive: {
        Args: { msg_id: number; queue_name: string }
        Returns: boolean
      }
      pgmq_metrics: {
        Args: { queue_name: string }
        Returns: {
          newest_msg_age_sec: number
          oldest_msg_age_sec: number
          queue_length: number
          total_messages: number
        }[]
      }
      pgmq_read_batch: {
        Args: {
          batch_size?: number
          queue_name: string
          visibility_timeout?: number
        }
        Returns: {
          enqueued_at: string
          headers: Json
          message: Json
          msg_id: number
          read_ct: number
          vt: string
        }[]
      }
      pgmq_send_batch: {
        Args: { msgs: Json[]; queue_name: string }
        Returns: number[]
      }
      trigger_next_step_internal: {
        Args: {
          p_function_name: string
          p_payload?: Json
          p_project_url: string
          p_service_role_key: string
        }
        Returns: undefined
      }
      update_sync_state: {
        Args: {
          p_error?: string
          p_last_null_count?: number
          p_stage?: string
          p_stagnant_cycles?: number
          p_status: string
        }
        Returns: undefined
      }
    }
    Enums: {
      artifact_type: "article" | "social_post"
      bill_type:
        | "air_and_atmosphere"
        | "water_resources"
        | "waste_and_toxics"
        | "energy_and_resources"
        | "land_and_conservation"
        | "disaster_and_emergency"
        | "climate_and_emissions"
        | "justice_and_environment"
      chamber: "House" | "Senate" | "Joint"
      impact_level: "local" | "state" | "national" | "international"
      legislation_type:
        | "HR"
        | "S"
        | "HJRES"
        | "SJRES"
        | "HCONRES"
        | "SCONRES"
        | "HRES"
        | "SRES"
      party: "Democrat" | "Republican" | "Independent"
    }
    CompositeTypes: {
      bill_reference: {
        legislation_number: string | null
        reason: string | null
      }
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
    Enums: {
      artifact_type: ["article", "social_post"],
      bill_type: [
        "air_and_atmosphere",
        "water_resources",
        "waste_and_toxics",
        "energy_and_resources",
        "land_and_conservation",
        "disaster_and_emergency",
        "climate_and_emissions",
        "justice_and_environment",
      ],
      chamber: ["House", "Senate", "Joint"],
      impact_level: ["local", "state", "national", "international"],
      legislation_type: [
        "HR",
        "S",
        "HJRES",
        "SJRES",
        "HCONRES",
        "SCONRES",
        "HRES",
        "SRES",
      ],
      party: ["Democrat", "Republican", "Independent"],
    },
  },
} as const

