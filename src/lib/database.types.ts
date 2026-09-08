export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
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
  public: {
    Tables: {
      applications: {
        Row: {
          cover_letter: string | null
          created_at: string
          expert_id: string
          id: string
          opportunity_id: string
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
        }
        Insert: {
          cover_letter?: string | null
          created_at?: string
          expert_id: string
          id?: string
          opportunity_id: string
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Update: {
          cover_letter?: string | null
          created_at?: string
          expert_id?: string
          id?: string
          opportunity_id?: string
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_expert_id_fkey"
            columns: ["expert_id"]
            isOneToOne: false
            referencedRelation: "experts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          ip: unknown
          reason: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: never
          ip?: unknown
          reason?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: never
          ip?: unknown
          reason?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_disclosures: {
        Row: {
          created_at: string
          disclosed_to: string
          expert_id: string
          id: number
          institution_id: string
        }
        Insert: {
          created_at?: string
          disclosed_to: string
          expert_id: string
          id?: never
          institution_id: string
        }
        Update: {
          created_at?: string
          disclosed_to?: string
          expert_id?: string
          id?: never
          institution_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_disclosures_disclosed_to_fkey"
            columns: ["disclosed_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_disclosures_expert_id_fkey"
            columns: ["expert_id"]
            isOneToOne: false
            referencedRelation: "experts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_disclosures_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          id: number
          is_african: boolean
          iso2: string
          name: string
          region: string | null
        }
        Insert: {
          id?: never
          is_african?: boolean
          iso2: string
          name: string
          region?: string | null
        }
        Update: {
          id?: never
          is_african?: boolean
          iso2?: string
          name?: string
          region?: string | null
        }
        Relationships: []
      }
      engagements: {
        Row: {
          confirmed_at: string
          expert_id: string
          id: string
          institution_id: string
          source_id: string
          source_type: Database["public"]["Enums"]["engagement_source"]
        }
        Insert: {
          confirmed_at?: string
          expert_id: string
          id?: string
          institution_id: string
          source_id: string
          source_type: Database["public"]["Enums"]["engagement_source"]
        }
        Update: {
          confirmed_at?: string
          expert_id?: string
          id?: string
          institution_id?: string
          source_id?: string
          source_type?: Database["public"]["Enums"]["engagement_source"]
        }
        Relationships: [
          {
            foreignKeyName: "engagements_expert_id_fkey"
            columns: ["expert_id"]
            isOneToOne: false
            referencedRelation: "experts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagements_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      expert_expertise: {
        Row: {
          expert_id: string
          expertise_id: number
          is_primary: boolean
          years_experience: number | null
        }
        Insert: {
          expert_id: string
          expertise_id: number
          is_primary?: boolean
          years_experience?: number | null
        }
        Update: {
          expert_id?: string
          expertise_id?: number
          is_primary?: boolean
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "expert_expertise_expert_id_fkey"
            columns: ["expert_id"]
            isOneToOne: false
            referencedRelation: "experts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expert_expertise_expertise_id_fkey"
            columns: ["expertise_id"]
            isOneToOne: false
            referencedRelation: "expertise"
            referencedColumns: ["id"]
          },
        ]
      }
      expert_languages: {
        Row: {
          expert_id: string
          language_id: number
          proficiency: string
        }
        Insert: {
          expert_id: string
          language_id: number
          proficiency: string
        }
        Update: {
          expert_id?: string
          language_id?: number
          proficiency?: string
        }
        Relationships: [
          {
            foreignKeyName: "expert_languages_expert_id_fkey"
            columns: ["expert_id"]
            isOneToOne: false
            referencedRelation: "experts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expert_languages_language_id_fkey"
            columns: ["language_id"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["id"]
          },
        ]
      }
      expertise: {
        Row: {
          id: number
          label: string
          parent_id: number | null
          slug: string
        }
        Insert: {
          id?: never
          label: string
          parent_id?: number | null
          slug: string
        }
        Update: {
          id?: never
          label?: string
          parent_id?: number | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "expertise_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "expertise"
            referencedColumns: ["id"]
          },
        ]
      }
      experts: {
        Row: {
          academic_level: Database["public"]["Enums"]["academic_level"] | null
          bio: string | null
          country_id: number | null
          created_at: string
          current_institution_id: string | null
          current_institution_name: string | null
          cv_file_id: string | null
          deleted_at: string | null
          first_name: string
          highest_degree: string | null
          id: string
          last_name: string
          orcid_id: string | null
          phone: string | null
          photo_file_id: string | null
          profile_visibility: Database["public"]["Enums"]["profile_visibility"]
          published_at: string | null
          search_document: unknown
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          academic_level?: Database["public"]["Enums"]["academic_level"] | null
          bio?: string | null
          country_id?: number | null
          created_at?: string
          current_institution_id?: string | null
          current_institution_name?: string | null
          cv_file_id?: string | null
          deleted_at?: string | null
          first_name: string
          highest_degree?: string | null
          id?: string
          last_name: string
          orcid_id?: string | null
          phone?: string | null
          photo_file_id?: string | null
          profile_visibility?: Database["public"]["Enums"]["profile_visibility"]
          published_at?: string | null
          search_document?: unknown
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          academic_level?: Database["public"]["Enums"]["academic_level"] | null
          bio?: string | null
          country_id?: number | null
          created_at?: string
          current_institution_id?: string | null
          current_institution_name?: string | null
          cv_file_id?: string | null
          deleted_at?: string | null
          first_name?: string
          highest_degree?: string | null
          id?: string
          last_name?: string
          orcid_id?: string | null
          phone?: string | null
          photo_file_id?: string | null
          profile_visibility?: Database["public"]["Enums"]["profile_visibility"]
          published_at?: string | null
          search_document?: unknown
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "experts_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experts_current_institution_id_fkey"
            columns: ["current_institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experts_cv_file_id_fkey"
            columns: ["cv_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experts_photo_file_id_fkey"
            columns: ["photo_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["file_kind"]
          mime_type: string
          owner_user_id: string
          scan_status: Database["public"]["Enums"]["file_scan_status"]
          size_bytes: number
          storage_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["file_kind"]
          mime_type: string
          owner_user_id: string
          scan_status?: Database["public"]["Enums"]["file_scan_status"]
          size_bytes: number
          storage_key: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["file_kind"]
          mime_type?: string
          owner_user_id?: string
          scan_status?: Database["public"]["Enums"]["file_scan_status"]
          size_bytes?: number
          storage_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "files_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      institution_members: {
        Row: {
          institution_id: string
          invited_by: string | null
          joined_at: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          institution_id: string
          invited_by?: string | null
          joined_at?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          institution_id?: string
          invited_by?: string | null
          joined_at?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "institution_members_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "institution_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "institution_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      institutions: {
        Row: {
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          country_id: number
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          plan: string
          ror_id: string | null
          type: Database["public"]["Enums"]["institution_type"]
          updated_at: string
          verified_at: string | null
          website: string | null
        }
        Insert: {
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          country_id: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          plan?: string
          ror_id?: string | null
          type: Database["public"]["Enums"]["institution_type"]
          updated_at?: string
          verified_at?: string | null
          website?: string | null
        }
        Update: {
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          country_id?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          plan?: string
          ror_id?: string | null
          type?: Database["public"]["Enums"]["institution_type"]
          updated_at?: string
          verified_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "institutions_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          created_at: string
          expert_id: string
          expires_at: string | null
          id: string
          institution_id: string
          message: string | null
          opportunity_id: string | null
          status: Database["public"]["Enums"]["invitation_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          expert_id: string
          expires_at?: string | null
          id?: string
          institution_id: string
          message?: string | null
          opportunity_id?: string | null
          status?: Database["public"]["Enums"]["invitation_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          expert_id?: string
          expires_at?: string | null
          id?: string
          institution_id?: string
          message?: string | null
          opportunity_id?: string | null
          status?: Database["public"]["Enums"]["invitation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_expert_id_fkey"
            columns: ["expert_id"]
            isOneToOne: false
            referencedRelation: "experts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      languages: {
        Row: {
          id: number
          iso639_1: string
          name: string
        }
        Insert: {
          id?: never
          iso639_1: string
          name: string
        }
        Update: {
          id?: never
          iso639_1?: string
          name?: string
        }
        Relationships: []
      }
      opportunities: {
        Row: {
          compensation_amount: number | null
          compensation_currency: string | null
          country_id: number | null
          created_at: string
          created_by: string
          deadline: string | null
          description: string
          duration: string | null
          id: string
          institution_id: string
          location: string | null
          mode: Database["public"]["Enums"]["opportunity_mode"]
          published_at: string | null
          status: Database["public"]["Enums"]["opportunity_status"]
          title: string
          type: Database["public"]["Enums"]["opportunity_type"]
          updated_at: string
        }
        Insert: {
          compensation_amount?: number | null
          compensation_currency?: string | null
          country_id?: number | null
          created_at?: string
          created_by: string
          deadline?: string | null
          description: string
          duration?: string | null
          id?: string
          institution_id: string
          location?: string | null
          mode: Database["public"]["Enums"]["opportunity_mode"]
          published_at?: string | null
          status?: Database["public"]["Enums"]["opportunity_status"]
          title: string
          type: Database["public"]["Enums"]["opportunity_type"]
          updated_at?: string
        }
        Update: {
          compensation_amount?: number | null
          compensation_currency?: string | null
          country_id?: number | null
          created_at?: string
          created_by?: string
          deadline?: string | null
          description?: string
          duration?: string | null
          id?: string
          institution_id?: string
          location?: string | null
          mode?: Database["public"]["Enums"]["opportunity_mode"]
          published_at?: string | null
          status?: Database["public"]["Enums"]["opportunity_status"]
          title?: string
          type?: Database["public"]["Enums"]["opportunity_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_requirements: {
        Row: {
          id: number
          is_mandatory: boolean
          kind: Database["public"]["Enums"]["requirement_kind"]
          opportunity_id: string
          ref_value: string
        }
        Insert: {
          id?: never
          is_mandatory?: boolean
          kind: Database["public"]["Enums"]["requirement_kind"]
          opportunity_id: string
          ref_value: string
        }
        Update: {
          id?: never
          is_mandatory?: boolean
          kind?: Database["public"]["Enums"]["requirement_kind"]
          opportunity_id?: string
          ref_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_requirements_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_limits: {
        Row: {
          contact_disclosures_per_day: number
          first_contacts_per_day: number
          plan: string
        }
        Insert: {
          contact_disclosures_per_day: number
          first_contacts_per_day: number
          plan: string
        }
        Update: {
          contact_disclosures_per_day?: number
          first_contacts_per_day?: number
          plan?: string
        }
        Relationships: []
      }
      saved_experts: {
        Row: {
          created_at: string
          expert_id: string
          institution_id: string
          saved_by: string
        }
        Insert: {
          created_at?: string
          expert_id: string
          institution_id: string
          saved_by: string
        }
        Update: {
          created_at?: string
          expert_id?: string
          institution_id?: string
          saved_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_experts_expert_id_fkey"
            columns: ["expert_id"]
            isOneToOne: false
            referencedRelation: "experts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_experts_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_experts_saved_by_fkey"
            columns: ["saved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          locale: string
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id: string
          locale?: string
          role: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          locale?: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_institution_id: { Args: never; Returns: string }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      expert_expertise_ids: {
        Args: { target_expert_id: string }
        Returns: number[]
      }
      expert_language_ids: {
        Args: { target_expert_id: string }
        Returns: number[]
      }
      expertise_broaden: { Args: { ids: number[] }; Returns: number[] }
      is_admin: { Args: never; Returns: boolean }
      is_member_of: {
        Args: { target_institution_id: string }
        Returns: boolean
      }
      is_owner_of: { Args: { target_institution_id: string }; Returns: boolean }
      my_expert_profile: {
        Args: never
        Returns: {
          academic_level: Database["public"]["Enums"]["academic_level"]
          bio: string
          country_id: number
          current_institution_id: string
          current_institution_name: string
          cv_file_id: string
          first_name: string
          highest_degree: string
          id: string
          last_name: string
          orcid_id: string
          phone: string
          photo_file_id: string
          profile_visibility: Database["public"]["Enums"]["profile_visibility"]
          published_at: string
          title: string
        }[]
      }
      reveal_expert_contacts: {
        Args: { target_expert_id: string }
        Returns: {
          cv_file_id: string
          email: string
          phone: string
        }[]
      }
      search_experts: {
        Args: {
          after_id?: string
          after_published_at?: string
          after_rank?: number
          filter_country_ids?: number[]
          filter_expertise_ids?: number[]
          filter_language_ids?: number[]
          filter_levels?: Database["public"]["Enums"]["academic_level"][]
          page_size?: number
          q?: string
        }
        Returns: Database["public"]["CompositeTypes"]["expert_search_row"][]
        SetofOptions: {
          from: "*"
          to: "expert_search_row"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      search_experts_similar: {
        Args: { page_size?: number; q?: string }
        Returns: Database["public"]["CompositeTypes"]["expert_search_row"][]
        SetofOptions: {
          from: "*"
          to: "expert_search_row"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      academic_level: "professor" | "lecturer" | "researcher" | "phd_candidate"
      application_status:
        | "submitted"
        | "under_review"
        | "shortlisted"
        | "accepted"
        | "rejected"
        | "withdrawn"
      engagement_source: "application" | "invitation"
      file_kind: "photo" | "cv"
      file_scan_status: "pending" | "clean" | "infected" | "failed"
      institution_type:
        | "university"
        | "college"
        | "research_institute"
        | "government"
        | "ngo"
        | "international_organization"
        | "other"
      invitation_status:
        | "pending"
        | "accepted"
        | "declined"
        | "expired"
        | "cancelled"
      member_role: "owner" | "admin" | "member"
      opportunity_mode: "online" | "hybrid" | "onsite"
      opportunity_status: "draft" | "published" | "closed"
      opportunity_type:
        | "lectureship"
        | "supervision"
        | "research"
        | "mentorship"
        | "consulting"
        | "conference"
        | "other"
      profile_visibility: "public" | "authenticated" | "hidden"
      requirement_kind: "expertise" | "language" | "academic_level" | "country"
      user_role: "expert" | "institution_member" | "admin"
      user_status: "pending" | "active" | "suspended"
    }
    CompositeTypes: {
      expert_search_row: {
        id: string | null
        first_name: string | null
        last_name: string | null
        title: string | null
        academic_level: Database["public"]["Enums"]["academic_level"] | null
        highest_degree: string | null
        current_institution_name: string | null
        country_id: number | null
        bio_excerpt: string | null
        photo_file_id: string | null
        expertise_ids: number[] | null
        language_ids: number[] | null
        rank: number | null
        published_at: string | null
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      academic_level: ["professor", "lecturer", "researcher", "phd_candidate"],
      application_status: [
        "submitted",
        "under_review",
        "shortlisted",
        "accepted",
        "rejected",
        "withdrawn",
      ],
      engagement_source: ["application", "invitation"],
      file_kind: ["photo", "cv"],
      file_scan_status: ["pending", "clean", "infected", "failed"],
      institution_type: [
        "university",
        "college",
        "research_institute",
        "government",
        "ngo",
        "international_organization",
        "other",
      ],
      invitation_status: [
        "pending",
        "accepted",
        "declined",
        "expired",
        "cancelled",
      ],
      member_role: ["owner", "admin", "member"],
      opportunity_mode: ["online", "hybrid", "onsite"],
      opportunity_status: ["draft", "published", "closed"],
      opportunity_type: [
        "lectureship",
        "supervision",
        "research",
        "mentorship",
        "consulting",
        "conference",
        "other",
      ],
      profile_visibility: ["public", "authenticated", "hidden"],
      requirement_kind: ["expertise", "language", "academic_level", "country"],
      user_role: ["expert", "institution_member", "admin"],
      user_status: ["pending", "active", "suspended"],
    },
  },
} as const

