export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      cuisine_preferences: {
        Row: {
          cuisine: string;
          score: number;
          user_id: string;
        };
        Insert: {
          cuisine: string;
          score: number;
          user_id: string;
        };
        Update: {
          cuisine?: string;
          score?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cuisine_preferences_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_preference_profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
      dietary_rules: {
        Row: {
          rule_type: string;
          user_id: string;
          value: string;
        };
        Insert: {
          rule_type: string;
          user_id: string;
          value: string;
        };
        Update: {
          rule_type?: string;
          user_id?: string;
          value?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dietary_rules_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_preference_profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
      household_equipment: {
        Row: {
          equipment_key: string;
          household_id: string;
        };
        Insert: {
          equipment_key: string;
          household_id: string;
        };
        Update: {
          equipment_key?: string;
          household_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "household_equipment_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "household_planning_settings";
            referencedColumns: ["household_id"];
          },
        ];
      };
      household_members: {
        Row: {
          archived_at: string | null;
          household_id: string;
          id: string;
          joined_at: string;
          role: string;
          slot: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          archived_at?: string | null;
          household_id: string;
          id?: string;
          joined_at?: string;
          role: string;
          slot: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          archived_at?: string | null;
          household_id?: string;
          id?: string;
          joined_at?: string;
          role?: string;
          slot?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "household_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      household_planning_settings: {
        Row: {
          cadence: string;
          completed: boolean;
          equipment_note: string;
          household_id: string;
          planning_day: number;
          updated_at: string;
        };
        Insert: {
          cadence?: string;
          completed?: boolean;
          equipment_note?: string;
          household_id: string;
          planning_day?: number;
          updated_at?: string;
        };
        Update: {
          cadence?: string;
          completed?: boolean;
          equipment_note?: string;
          household_id?: string;
          planning_day?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "household_planning_settings_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: true;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      households: {
        Row: {
          archived_at: string | null;
          created_at: string;
          created_by_user_id: string;
          default_servings: number;
          id: string;
          name: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          created_by_user_id: string;
          default_servings?: number;
          id: string;
          name: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          created_by_user_id?: string;
          default_servings?: number;
          id?: string;
          name?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "households_created_by_user_id_fkey";
            columns: ["created_by_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_preference_profiles: {
        Row: {
          adventure_weight: number;
          budget_weight: number;
          completed: boolean;
          effort_weight: number;
          max_cook_minutes: number;
          reuse_weight: number;
          safety_reviewed: boolean;
          updated_at: string;
          user_id: string;
          variety_weight: number;
        };
        Insert: {
          adventure_weight?: number;
          budget_weight?: number;
          completed?: boolean;
          effort_weight?: number;
          max_cook_minutes?: number;
          reuse_weight?: number;
          safety_reviewed?: boolean;
          updated_at?: string;
          user_id: string;
          variety_weight?: number;
        };
        Update: {
          adventure_weight?: number;
          budget_weight?: number;
          completed?: boolean;
          effort_weight?: number;
          max_cook_minutes?: number;
          reuse_weight?: number;
          safety_reviewed?: boolean;
          updated_at?: string;
          user_id?: string;
          variety_weight?: number;
        };
        Relationships: [
          {
            foreignKeyName: "user_preference_profiles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_household_invitation: {
        Args: { invitation_code: string };
        Returns: {
          archived_at: string | null;
          created_at: string;
          created_by_user_id: string;
          default_servings: number;
          id: string;
          name: string;
          timezone: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "households";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      archive_household: {
        Args: { target_household_id: string };
        Returns: undefined;
      };
      create_household: {
        Args: {
          household_id: string;
          household_name: string;
          household_timezone?: string;
          servings?: number;
        };
        Returns: {
          archived_at: string | null;
          created_at: string;
          created_by_user_id: string;
          default_servings: number;
          id: string;
          name: string;
          timezone: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "households";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_household_invitation: {
        Args: { target_household_id: string };
        Returns: {
          code: string;
          expires_at: string;
          id: string;
        }[];
      };
      get_kitchen_settings: {
        Args: { target_household_id: string };
        Returns: Json;
      };
      get_personal_preferences: { Args: never; Returns: Json };
      is_household_member: {
        Args: { target_household_id: string };
        Returns: boolean;
      };
      list_household_invitations: {
        Args: { target_household_id: string };
        Returns: {
          accepted_at: string;
          expires_at: string;
          id: string;
          revoked_at: string;
        }[];
      };
      revoke_household_invitation: {
        Args: { target_invitation_id: string };
        Returns: undefined;
      };
      save_kitchen_settings: {
        Args: { payload: Json; target_household_id: string };
        Returns: Json;
      };
      save_personal_preferences: { Args: { payload: Json }; Returns: Json };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
