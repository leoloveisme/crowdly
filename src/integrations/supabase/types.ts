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
      branch_revisions: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string
          id: string
          language: string | null
          new_branch_name: string
          new_branch_paragraphs: string[]
          prev_branch_name: string | null
          prev_branch_paragraphs: string[] | null
          revision_number: number
          revision_reason: string | null
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by: string
          id?: string
          language?: string | null
          new_branch_name: string
          new_branch_paragraphs: string[]
          prev_branch_name?: string | null
          prev_branch_paragraphs?: string[] | null
          revision_number?: number
          revision_reason?: string | null
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string
          id?: string
          language?: string | null
          new_branch_name?: string
          new_branch_paragraphs?: string[]
          prev_branch_name?: string | null
          prev_branch_paragraphs?: string[] | null
          revision_number?: number
          revision_reason?: string | null
        }
        Relationships: []
      }
      chapter_comments: {
        Row: {
          chapter_id: string
          content: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          chapter_id: string
          content: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          chapter_id?: string
          content?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapter_comments_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["chapter_id"]
          },
        ]
      }
      chapter_contributors: {
        Row: {
          added_by: string | null
          chapter_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          added_by?: string | null
          chapter_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          added_by?: string | null
          chapter_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapter_contributors_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["chapter_id"]
          },
        ]
      }
      chapter_likes: {
        Row: {
          chapter_id: string
          created_at: string
          id: string
          is_like: boolean
          user_id: string
        }
        Insert: {
          chapter_id: string
          created_at?: string
          id?: string
          is_like: boolean
          user_id: string
        }
        Update: {
          chapter_id?: string
          created_at?: string
          id?: string
          is_like?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapter_likes_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["chapter_id"]
          },
        ]
      }
      chapter_revisions: {
        Row: {
          chapter_id: string
          created_at: string
          created_by: string
          id: string
          language: string | null
          new_chapter_title: string
          new_paragraphs: string[]
          prev_chapter_title: string | null
          prev_paragraphs: string[] | null
          revision_number: number
          revision_reason: string | null
        }
        Insert: {
          chapter_id: string
          created_at?: string
          created_by: string
          id?: string
          language?: string | null
          new_chapter_title: string
          new_paragraphs: string[]
          prev_chapter_title?: string | null
          prev_paragraphs?: string[] | null
          revision_number?: number
          revision_reason?: string | null
        }
        Update: {
          chapter_id?: string
          created_at?: string
          created_by?: string
          id?: string
          language?: string | null
          new_chapter_title?: string
          new_paragraphs?: string[]
          prev_chapter_title?: string | null
          prev_paragraphs?: string[] | null
          revision_number?: number
          revision_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chapter_revisions_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["chapter_id"]
          },
        ]
      }
      editable_content: {
        Row: {
          content: string
          created_at: string | null
          element_id: string
          id: string
          language: string
          original_content: string | null
          page_path: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          element_id: string
          id?: string
          language?: string
          original_content?: string | null
          page_path: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          element_id?: string
          id?: string
          language?: string
          original_content?: string | null
          page_path?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      feature_suggestions: {
        Row: {
          attachments: Json | null
          can_contact: boolean | null
          contact_method: string | null
          created_at: string | null
          description: string
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          telephone: string | null
          user_id: string | null
          visibility: Database["public"]["Enums"]["visibility_type"]
        }
        Insert: {
          attachments?: Json | null
          can_contact?: boolean | null
          contact_method?: string | null
          created_at?: string | null
          description: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          telephone?: string | null
          user_id?: string | null
          visibility: Database["public"]["Enums"]["visibility_type"]
        }
        Update: {
          attachments?: Json | null
          can_contact?: boolean | null
          contact_method?: string | null
          created_at?: string | null
          description?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          telephone?: string | null
          user_id?: string | null
          visibility?: Database["public"]["Enums"]["visibility_type"]
        }
        Relationships: []
      }
      paragraph_branches: {
        Row: {
          branch_text: string
          chapter_id: string
          created_at: string
          id: string
          language: string
          metadata: Json | null
          parent_paragraph_index: number
          parent_paragraph_text: string
          user_id: string
        }
        Insert: {
          branch_text: string
          chapter_id: string
          created_at?: string
          id?: string
          language?: string
          metadata?: Json | null
          parent_paragraph_index: number
          parent_paragraph_text: string
          user_id: string
        }
        Update: {
          branch_text?: string
          chapter_id?: string
          created_at?: string
          id?: string
          language?: string
          metadata?: Json | null
          parent_paragraph_index?: number
          parent_paragraph_text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paragraph_branches_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["chapter_id"]
          },
        ]
      }
      paragraph_revisions: {
        Row: {
          chapter_id: string
          created_at: string
          created_by: string
          id: string
          language: string | null
          new_paragraph: string
          paragraph_index: number
          prev_paragraph: string | null
          revision_number: number
          revision_reason: string | null
        }
        Insert: {
          chapter_id: string
          created_at?: string
          created_by: string
          id?: string
          language?: string | null
          new_paragraph: string
          paragraph_index: number
          prev_paragraph?: string | null
          revision_number?: number
          revision_reason?: string | null
        }
        Update: {
          chapter_id?: string
          created_at?: string
          created_by?: string
          id?: string
          language?: string | null
          new_paragraph?: string
          paragraph_index?: number
          prev_paragraph?: string | null
          revision_number?: number
          revision_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paragraph_revisions_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["chapter_id"]
          },
        ]
      }
      profiles: {
        Row: {
          about: string | null
          bio: string | null
          birthday: string | null
          created_at: string
          first_name: string | null
          id: string
          interests: string[] | null
          languages: string[] | null
          last_name: string | null
          nickname: string | null
          notify_app: boolean | null
          notify_email: boolean | null
          notify_phone: boolean | null
          profile_image_url: string | null
          social_facebook: string | null
          social_instagram: string | null
          social_other: string | null
          social_snapchat: string | null
          telephone: string | null
          updated_at: string
          username: string
        }
        Insert: {
          about?: string | null
          bio?: string | null
          birthday?: string | null
          created_at?: string
          first_name?: string | null
          id: string
          interests?: string[] | null
          languages?: string[] | null
          last_name?: string | null
          nickname?: string | null
          notify_app?: boolean | null
          notify_email?: boolean | null
          notify_phone?: boolean | null
          profile_image_url?: string | null
          social_facebook?: string | null
          social_instagram?: string | null
          social_other?: string | null
          social_snapchat?: string | null
          telephone?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          about?: string | null
          bio?: string | null
          birthday?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          interests?: string[] | null
          languages?: string[] | null
          last_name?: string | null
          nickname?: string | null
          notify_app?: boolean | null
          notify_email?: boolean | null
          notify_phone?: boolean | null
          profile_image_url?: string | null
          social_facebook?: string | null
          social_instagram?: string | null
          social_other?: string | null
          social_snapchat?: string | null
          telephone?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      stories: {
        Row: {
          chapter_id: string
          chapter_title: string
          contribution_status:
            | Database["public"]["Enums"]["contribution_status"]
            | null
          contributor_id: string | null
          created_at: string
          paragraphs: string[]
          story_title_id: string
          updated_at: string
        }
        Insert: {
          chapter_id?: string
          chapter_title: string
          contribution_status?:
            | Database["public"]["Enums"]["contribution_status"]
            | null
          contributor_id?: string | null
          created_at?: string
          paragraphs?: string[]
          story_title_id: string
          updated_at?: string
        }
        Update: {
          chapter_id?: string
          chapter_title?: string
          contribution_status?:
            | Database["public"]["Enums"]["contribution_status"]
            | null
          contributor_id?: string | null
          created_at?: string
          paragraphs?: string[]
          story_title_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stories_contributor_id_fkey"
            columns: ["contributor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stories_story_title_id_fkey"
            columns: ["story_title_id"]
            isOneToOne: false
            referencedRelation: "story_title"
            referencedColumns: ["story_title_id"]
          },
        ]
      }
      story_attributes: {
        Row: {
          created_at: string
          id: string
          most_active: string | null
          most_popular: string | null
          new: string
          story_contributors: string | null
          story_creator: string
          story_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          most_active?: string | null
          most_popular?: string | null
          new: string
          story_contributors?: string | null
          story_creator: string
          story_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          most_active?: string | null
          most_popular?: string | null
          new?: string
          story_contributors?: string | null
          story_creator?: string
          story_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      story_title: {
        Row: {
          created_at: string
          creator_id: string | null
          story_title_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator_id?: string | null
          story_title_id?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator_id?: string | null
          story_title_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      story_title_revisions: {
        Row: {
          created_at: string
          created_by: string
          id: string
          language: string | null
          new_title: string
          prev_title: string | null
          revision_number: number
          revision_reason: string | null
          story_title_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          language?: string | null
          new_title: string
          prev_title?: string | null
          revision_number?: number
          revision_reason?: string | null
          story_title_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          language?: string | null
          new_title?: string
          prev_title?: string | null
          revision_number?: number
          revision_reason?: string | null
          story_title_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_title_revisions_story_title_id_fkey"
            columns: ["story_title_id"]
            isOneToOne: false
            referencedRelation: "story_title"
            referencedColumns: ["story_title_id"]
          },
        ]
      }
      subscribers: {
        Row: {
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          first_name: string
          id?: string
          last_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _user_id: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "platform_admin"
        | "platform_supporter"
        | "consumer"
        | "author"
        | "editor"
        | "chief_editor"
        | "producer"
        | "contributor"
      contribution_status: "approved" | "rejected" | "undecided"
      visibility_type: "public" | "private" | "anonymous"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "platform_admin",
        "platform_supporter",
        "consumer",
        "author",
        "editor",
        "chief_editor",
        "producer",
        "contributor",
      ],
      contribution_status: ["approved", "rejected", "undecided"],
      visibility_type: ["public", "private", "anonymous"],
    },
  },
} as const
