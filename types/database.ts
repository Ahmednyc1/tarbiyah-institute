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
      admins: {
        Row: {
          created_at: string
          id: string
          person_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          person_id: string
        }
        Update: {
          created_at?: string
          id?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admins_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          class_id: string
          created_at: string
          description: string | null
          due_date: string | null
          grade_category_id: string
          id: string
          is_published: boolean
          max_score: number
          name: string
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          grade_category_id: string
          id?: string
          is_published?: boolean
          max_score: number
          name: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          grade_category_id?: string
          id?: string
          is_published?: boolean
          max_score?: number
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_category_same_class_fk"
            columns: ["grade_category_id", "class_id"]
            isOneToOne: false
            referencedRelation: "grade_categories"
            referencedColumns: ["id", "class_id"]
          },
          {
            foreignKeyName: "assignments_class_fk"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "class_availability"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "assignments_class_fk"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          class_date: string
          created_at: string
          enrollment_id: string
          id: string
          note: string | null
          recorded_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          class_date: string
          created_at?: string
          enrollment_id: string
          id?: string
          note?: string | null
          recorded_by?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          class_date?: string
          created_at?: string
          enrollment_id?: string
          id?: string
          note?: string | null
          recorded_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      certificates: {
        Row: {
          certificate_number: string
          created_at: string
          enrollment_id: string
          final_score: number
          id: string
          issued_at: string
          issued_by: string | null
          revoked_at: string | null
          revoked_reason: string | null
          updated_at: string
        }
        Insert: {
          certificate_number?: string
          created_at?: string
          enrollment_id: string
          final_score: number
          id?: string
          issued_at?: string
          issued_by?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          updated_at?: string
        }
        Update: {
          certificate_number?: string
          created_at?: string
          enrollment_id?: string
          final_score?: number
          id?: string
          issued_at?: string
          issued_by?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: true
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          attendance_grace: number
          capacity: number | null
          course_id: string
          created_at: string
          end_date: string | null
          gender_restriction: string
          id: string
          location: string | null
          meeting_schedule: string | null
          passing_score: number
          registration_fee: number
          section: string | null
          start_date: string | null
          status: string
          teacher_id: string
          term: string
          updated_at: string
        }
        Insert: {
          attendance_grace?: number
          capacity?: number | null
          course_id: string
          created_at?: string
          end_date?: string | null
          gender_restriction?: string
          id?: string
          location?: string | null
          meeting_schedule?: string | null
          passing_score?: number
          registration_fee?: number
          section?: string | null
          start_date?: string | null
          status?: string
          teacher_id: string
          term: string
          updated_at?: string
        }
        Update: {
          attendance_grace?: number
          capacity?: number | null
          course_id?: string
          created_at?: string
          end_date?: string | null
          gender_restriction?: string
          id?: string
          location?: string | null
          meeting_schedule?: string | null
          passing_score?: number
          registration_fee?: number
          section?: string | null
          start_date?: string | null
          status?: string
          teacher_id?: string
          term?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teacher_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          title: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          amount_due: number
          amount_paid: number
          class_id: string
          completed_at: string | null
          created_at: string
          enrolled_at: string
          final_score: number | null
          id: string
          payment_status: string
          status: string
          student_id: string
          updated_at: string
          waiver_note: string | null
        }
        Insert: {
          amount_due?: number
          amount_paid?: number
          class_id: string
          completed_at?: string | null
          created_at?: string
          enrolled_at?: string
          final_score?: number | null
          id?: string
          payment_status?: string
          status?: string
          student_id: string
          updated_at?: string
          waiver_note?: string | null
        }
        Update: {
          amount_due?: number
          amount_paid?: number
          class_id?: string
          completed_at?: string | null
          created_at?: string
          enrolled_at?: string
          final_score?: number | null
          id?: string
          payment_status?: string
          status?: string
          student_id?: string
          updated_at?: string
          waiver_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "class_availability"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_categories: {
        Row: {
          class_id: string
          created_at: string
          id: string
          name: string
          position: number
          source: string
          updated_at: string
          weight: number
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          name: string
          position?: number
          source?: string
          updated_at?: string
          weight: number
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
          source?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "grade_categories_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "class_availability"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "grade_categories_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          enrollment_id: string
          id: string
          method: string
          note: string | null
          paid_at: string
          recorded_by: string | null
          reference: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          enrollment_id: string
          id?: string
          method: string
          note?: string | null
          paid_at?: string
          recorded_by?: string | null
          reference?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          enrollment_id?: string
          id?: string
          method?: string
          note?: string | null
          paid_at?: string
          recorded_by?: string | null
          reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          auth_user_id: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string
          phone: string | null
          sex: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          phone?: string | null
          sex?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          phone?: string | null
          sex?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      seat_holds: {
        Row: {
          class_id: string
          created_at: string
          enrollment_id: string | null
          expires_at: string
          id: string
          person_id: string
          release_reason: string | null
          released_at: string | null
          stripe_session_id: string | null
          stripe_status: string | null
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          enrollment_id?: string | null
          expires_at: string
          id?: string
          person_id: string
          release_reason?: string | null
          released_at?: string | null
          stripe_session_id?: string | null
          stripe_status?: string | null
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          enrollment_id?: string | null
          expires_at?: string
          id?: string
          person_id?: string
          release_reason?: string | null
          released_at?: string | null
          stripe_session_id?: string | null
          stripe_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seat_holds_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "class_availability"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "seat_holds_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_holds_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_holds_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      student_grades: {
        Row: {
          assignment_id: string
          class_id: string
          created_at: string
          enrollment_id: string
          feedback: string | null
          graded_at: string | null
          graded_by: string | null
          id: string
          score: number | null
          updated_at: string
        }
        Insert: {
          assignment_id: string
          class_id: string
          created_at?: string
          enrollment_id: string
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          score?: number | null
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          class_id?: string
          created_at?: string
          enrollment_id?: string
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          score?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_grades_assignment_fk"
            columns: ["assignment_id", "class_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id", "class_id"]
          },
          {
            foreignKeyName: "student_grades_enrollment_fk"
            columns: ["enrollment_id", "class_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id", "class_id"]
          },
          {
            foreignKeyName: "student_grades_graded_by_fkey"
            columns: ["graded_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          created_at: string
          enrolled_since: string
          guardian_name: string | null
          guardian_phone: string | null
          id: string
          is_active: boolean
          notes: string | null
          person_id: string
          student_number: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enrolled_since?: string
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          person_id: string
          student_number?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enrolled_since?: string
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          person_id?: string
          student_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      teachers: {
        Row: {
          bio: string | null
          created_at: string
          id: string
          is_active: boolean
          person_id: string
          photo_path: string | null
          updated_at: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          person_id: string
          photo_path?: string | null
          updated_at?: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          person_id?: string
          photo_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teachers_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      class_availability: {
        Row: {
          capacity: number | null
          class_id: string | null
          is_full: boolean | null
          remaining: number | null
          taken: number | null
        }
        Insert: {
          capacity?: number | null
          class_id?: string | null
          is_full?: never
          remaining?: never
          taken?: never
        }
        Update: {
          capacity?: number | null
          class_id?: string | null
          is_full?: never
          remaining?: never
          taken?: never
        }
        Relationships: []
      }
      enrollment_category_scores: {
        Row: {
          class_id: string | null
          earned: number | null
          enrollment_id: string | null
          grade_category_id: string | null
          name: string | null
          position: number | null
          possible: number | null
          source: string | null
          weight: number | null
        }
        Relationships: []
      }
      enrollment_grades: {
        Row: {
          class_id: string | null
          current_score: number | null
          enrollment_id: string | null
          weight_graded_so_far: number | null
        }
        Relationships: []
      }
      my_roles: {
        Row: {
          is_admin: boolean | null
          person_id: string | null
          student_id: string | null
          teacher_id: string | null
        }
        Relationships: []
      }
      teacher_directory: {
        Row: {
          bio: string | null
          full_name: string | null
          id: string | null
          person_id: string | null
          photo_path: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teachers_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      delete_course: { Args: { p_course_id: string }; Returns: undefined }
      enrol_person: {
        Args: {
          p_class_id: string
          p_email?: string
          p_first_name?: string
          p_last_name?: string
          p_person_id?: string
          p_phone?: string
        }
        Returns: string
      }
      hold_seat: {
        Args: { p_class_id: string; p_minutes?: number }
        Returns: string
      }
      payments_report: {
        Args: { p_from: string; p_to: string }
        Returns: {
          amount: number
          course_code: string
          course_title: string
          local_date: string
          method: string
          note: string
          paid_at: string
          payment_id: string
          recorded_by: string
          reference: string
          student_name: string
          student_number: string
          term: string
        }[]
      }
      redeem_hold: {
        Args: { p_amount_paid?: number; p_hold_id: string }
        Returns: string
      }
      release_hold: {
        Args: { p_hold_id: string; p_reason?: string }
        Returns: undefined
      }
      save_course: {
        Args: {
          p_capacity?: number
          p_class_id?: string
          p_code: string
          p_course_id?: string
          p_description?: string
          p_end?: string
          p_fee?: number
          p_is_active?: boolean
          p_location?: string
          p_schedule?: string
          p_start?: string
          p_teacher_id: string
          p_term: string
          p_title: string
        }
        Returns: string
      }
      save_teacher: {
        Args: {
          p_bio?: string
          p_email?: string
          p_first_name?: string
          p_is_active?: boolean
          p_last_name?: string
          p_teacher_id?: string
          p_title?: string
        }
        Returns: string
      }
      set_grade_categories: {
        Args: { p_categories: Json; p_class_id: string }
        Returns: undefined
      }
      waived_fees: {
        Args: never
        Returns: {
          amount_due: number
          amount_paid: number
          course_code: string
          course_title: string
          enrollment_id: string
          student_name: string
          student_number: string
          term: string
          waiver_note: string
        }[]
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
    Enums: {},
  },
} as const
