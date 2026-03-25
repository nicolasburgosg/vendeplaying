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
      ai_seller_profiles: {
        Row: {
          channel_id: string | null
          company_description: string | null
          created_at: string
          forbidden_words: string[]
          human_handoff_message: string | null
          id: string
          is_active: boolean
          language_code: string
          message_length: string
          organization_id: string
          purchase_confirmation_message: string | null
          sales_style: string
          seller_name: string
          special_instructions: string | null
          target_audience: string | null
          tone: string | null
          updated_at: string
          use_emojis: boolean
          version: number
          welcome_message: string | null
        }
        Insert: {
          channel_id?: string | null
          company_description?: string | null
          created_at?: string
          forbidden_words?: string[]
          human_handoff_message?: string | null
          id?: string
          is_active?: boolean
          language_code?: string
          message_length?: string
          organization_id: string
          purchase_confirmation_message?: string | null
          sales_style?: string
          seller_name: string
          special_instructions?: string | null
          target_audience?: string | null
          tone?: string | null
          updated_at?: string
          use_emojis?: boolean
          version?: number
          welcome_message?: string | null
        }
        Update: {
          channel_id?: string | null
          company_description?: string | null
          created_at?: string
          forbidden_words?: string[]
          human_handoff_message?: string | null
          id?: string
          is_active?: boolean
          language_code?: string
          message_length?: string
          organization_id?: string
          purchase_confirmation_message?: string | null
          sales_style?: string
          seller_name?: string
          special_instructions?: string | null
          target_audience?: string | null
          tone?: string | null
          updated_at?: string
          use_emojis?: boolean
          version?: number
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_seller_profiles_channel_fk"
            columns: ["organization_id", "channel_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_channels"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "ai_seller_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_import_jobs: {
        Row: {
          content_type: string | null
          created_at: string
          error_count: number
          finished_at: string | null
          id: string
          initiated_by_user_id: string | null
          inserted_count: number
          mapping: Json
          options: Json
          organization_id: string
          original_filename: string | null
          processed_rows: number
          source_type: string
          started_at: string | null
          status: string
          storage_path: string | null
          summary: Json
          total_rows: number
          updated_at: string
          updated_count: number
          warning_count: number
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          error_count?: number
          finished_at?: string | null
          id?: string
          initiated_by_user_id?: string | null
          inserted_count?: number
          mapping?: Json
          options?: Json
          organization_id: string
          original_filename?: string | null
          processed_rows?: number
          source_type: string
          started_at?: string | null
          status: string
          storage_path?: string | null
          summary?: Json
          total_rows?: number
          updated_at?: string
          updated_count?: number
          warning_count?: number
        }
        Update: {
          content_type?: string | null
          created_at?: string
          error_count?: number
          finished_at?: string | null
          id?: string
          initiated_by_user_id?: string | null
          inserted_count?: number
          mapping?: Json
          options?: Json
          organization_id?: string
          original_filename?: string | null
          processed_rows?: number
          source_type?: string
          started_at?: string | null
          status?: string
          storage_path?: string | null
          summary?: Json
          total_rows?: number
          updated_at?: string
          updated_count?: number
          warning_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalog_import_jobs_initiated_by_user_membership_fk"
            columns: ["organization_id", "initiated_by_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "catalog_import_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_import_row_errors: {
        Row: {
          created_at: string
          error_code: string
          error_message: string
          field_name: string | null
          id: string
          import_job_id: string
          organization_id: string
          raw_row: Json
          row_number: number
          severity: string
        }
        Insert: {
          created_at?: string
          error_code: string
          error_message: string
          field_name?: string | null
          id?: string
          import_job_id: string
          organization_id: string
          raw_row?: Json
          row_number: number
          severity?: string
        }
        Update: {
          created_at?: string
          error_code?: string
          error_message?: string
          field_name?: string | null
          id?: string
          import_job_id?: string
          organization_id?: string
          raw_row?: Json
          row_number?: number
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_import_row_errors_import_job_fk"
            columns: ["organization_id", "import_job_id"]
            isOneToOne: false
            referencedRelation: "catalog_import_jobs"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "catalog_import_row_errors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          ai_paused: boolean
          ai_paused_at: string | null
          assigned_user_id: string | null
          channel_id: string
          closed_at: string | null
          created_at: string
          customer_id: string
          human_handoff_requested_at: string | null
          id: string
          last_agent_message_at: string | null
          last_customer_message_at: string | null
          last_message_at: string | null
          lead_temperature: Database["public"]["Enums"]["lead_temperature"]
          metadata: Json
          organization_id: string
          status: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          ai_paused?: boolean
          ai_paused_at?: string | null
          assigned_user_id?: string | null
          channel_id: string
          closed_at?: string | null
          created_at?: string
          customer_id: string
          human_handoff_requested_at?: string | null
          id?: string
          last_agent_message_at?: string | null
          last_customer_message_at?: string | null
          last_message_at?: string | null
          lead_temperature?: Database["public"]["Enums"]["lead_temperature"]
          metadata?: Json
          organization_id: string
          status?: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          ai_paused?: boolean
          ai_paused_at?: string | null
          assigned_user_id?: string | null
          channel_id?: string
          closed_at?: string | null
          created_at?: string
          customer_id?: string
          human_handoff_requested_at?: string | null
          id?: string
          last_agent_message_at?: string | null
          last_customer_message_at?: string | null
          last_message_at?: string | null
          lead_temperature?: Database["public"]["Enums"]["lead_temperature"]
          metadata?: Json
          organization_id?: string
          status?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assigned_user_membership_fk"
            columns: ["organization_id", "assigned_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "conversations_channel_fk"
            columns: ["organization_id", "channel_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_channels"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "conversations_customer_fk"
            columns: ["organization_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          first_name: string | null
          full_name: string | null
          id: string
          is_blocked: boolean
          last_name: string | null
          last_seen_at: string | null
          lead_temperature: Database["public"]["Enums"]["lead_temperature"]
          metadata: Json
          notes: string | null
          organization_id: string
          preferred_language: string
          updated_at: string
          whatsapp_e164: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          is_blocked?: boolean
          last_name?: string | null
          last_seen_at?: string | null
          lead_temperature?: Database["public"]["Enums"]["lead_temperature"]
          metadata?: Json
          notes?: string | null
          organization_id: string
          preferred_language?: string
          updated_at?: string
          whatsapp_e164: string
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          is_blocked?: boolean
          last_name?: string | null
          last_seen_at?: string | null
          lead_temperature?: Database["public"]["Enums"]["lead_temperature"]
          metadata?: Json
          notes?: string | null
          organization_id?: string
          preferred_language?: string
          updated_at?: string
          whatsapp_e164?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_requests: {
        Row: {
          business_name: string
          contact_name: string
          created_at: string
          email: string
          id: string
          status: string
          updated_at: string
          use_case: string
          whatsapp_e164: string
        }
        Insert: {
          business_name: string
          contact_name: string
          created_at?: string
          email: string
          id?: string
          status?: string
          updated_at?: string
          use_case: string
          whatsapp_e164: string
        }
        Update: {
          business_name?: string
          contact_name?: string
          created_at?: string
          email?: string
          id?: string
          status?: string
          updated_at?: string
          use_case?: string
          whatsapp_e164?: string
        }
        Relationships: []
      }
      follow_up_rules: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          delay_minutes: number
          freeform_body: string | null
          id: string
          is_active: boolean
          legacy_template_name: string | null
          max_executions: number
          name: string
          organization_id: string
          send_mode: string
          stop_conditions: Json
          target_type: string
          template_id: string | null
          trigger_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          delay_minutes: number
          freeform_body?: string | null
          id?: string
          is_active?: boolean
          legacy_template_name?: string | null
          max_executions?: number
          name: string
          organization_id: string
          send_mode?: string
          stop_conditions?: Json
          target_type: string
          template_id?: string | null
          trigger_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          delay_minutes?: number
          freeform_body?: string | null
          id?: string
          is_active?: boolean
          legacy_template_name?: string | null
          max_executions?: number
          name?: string
          organization_id?: string
          send_mode?: string
          stop_conditions?: Json
          target_type?: string
          template_id?: string | null
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_rules_created_by_user_membership_fk"
            columns: ["organization_id", "created_by_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "follow_up_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_rules_template_fk"
            columns: ["organization_id", "template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      knowledge_items: {
        Row: {
          answer: string
          category: string
          created_at: string
          created_by_user_id: string | null
          effective_from: string | null
          effective_to: string | null
          id: string
          is_active: boolean
          kind: string
          organization_id: string
          priority: number
          product_id: string | null
          question: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          answer: string
          category?: string
          created_at?: string
          created_by_user_id?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          organization_id: string
          priority?: number
          product_id?: string | null
          question?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          answer?: string
          category?: string
          created_at?: string
          created_by_user_id?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          organization_id?: string
          priority?: number
          product_id?: string | null
          question?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_items_created_by_user_membership_fk"
            columns: ["organization_id", "created_by_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "knowledge_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_items_product_fk"
            columns: ["organization_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      message_status_events: {
        Row: {
          canonical_status: string
          channel_id: string
          conversation_id: string
          created_at: string
          error_code: string | null
          error_payload: Json
          error_title: string | null
          id: string
          message_id: string
          metadata: Json
          occurred_at: string
          organization_id: string
          provider_event_id: string | null
          provider_message_id: string | null
          provider_status: string | null
        }
        Insert: {
          canonical_status: string
          channel_id: string
          conversation_id: string
          created_at?: string
          error_code?: string | null
          error_payload?: Json
          error_title?: string | null
          id?: string
          message_id: string
          metadata?: Json
          occurred_at?: string
          organization_id: string
          provider_event_id?: string | null
          provider_message_id?: string | null
          provider_status?: string | null
        }
        Update: {
          canonical_status?: string
          channel_id?: string
          conversation_id?: string
          created_at?: string
          error_code?: string | null
          error_payload?: Json
          error_title?: string | null
          id?: string
          message_id?: string
          metadata?: Json
          occurred_at?: string
          organization_id?: string
          provider_event_id?: string | null
          provider_message_id?: string | null
          provider_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_status_events_channel_fk"
            columns: ["organization_id", "channel_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_channels"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "message_status_events_conversation_fk"
            columns: ["organization_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "message_status_events_message_fk"
            columns: ["organization_id", "message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "message_status_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          channel_id: string
          conversation_id: string
          created_at: string
          current_status: string
          current_status_at: string | null
          customer_id: string | null
          delivered_at: string | null
          direction: Database["public"]["Enums"]["message_direction"]
          external_created_at: string | null
          failed_at: string | null
          id: string
          last_error_at: string | null
          last_error_code: string | null
          message_type: string
          order_id: string | null
          organization_id: string
          payload: Json
          provider_message_id: string | null
          read_at: string | null
          sender_type: Database["public"]["Enums"]["message_sender_type"]
          sent_at: string | null
          sent_by_user_id: string | null
        }
        Insert: {
          body?: string | null
          channel_id: string
          conversation_id: string
          created_at?: string
          current_status?: string
          current_status_at?: string | null
          customer_id?: string | null
          delivered_at?: string | null
          direction: Database["public"]["Enums"]["message_direction"]
          external_created_at?: string | null
          failed_at?: string | null
          id?: string
          last_error_at?: string | null
          last_error_code?: string | null
          message_type?: string
          order_id?: string | null
          organization_id: string
          payload?: Json
          provider_message_id?: string | null
          read_at?: string | null
          sender_type: Database["public"]["Enums"]["message_sender_type"]
          sent_at?: string | null
          sent_by_user_id?: string | null
        }
        Update: {
          body?: string | null
          channel_id?: string
          conversation_id?: string
          created_at?: string
          current_status?: string
          current_status_at?: string | null
          customer_id?: string | null
          delivered_at?: string | null
          direction?: Database["public"]["Enums"]["message_direction"]
          external_created_at?: string | null
          failed_at?: string | null
          id?: string
          last_error_at?: string | null
          last_error_code?: string | null
          message_type?: string
          order_id?: string | null
          organization_id?: string
          payload?: Json
          provider_message_id?: string | null
          read_at?: string | null
          sender_type?: Database["public"]["Enums"]["message_sender_type"]
          sent_at?: string | null
          sent_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_channel_fk"
            columns: ["organization_id", "channel_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_channels"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "messages_conversation_fk"
            columns: ["organization_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "messages_customer_fk"
            columns: ["organization_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "messages_order_fk"
            columns: ["organization_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sent_by_user_membership_fk"
            columns: ["organization_id", "sent_by_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          currency_code: string
          id: string
          line_total: number | null
          name: string
          order_id: string
          organization_id: string
          product_id: string | null
          quantity: number
          sku: string | null
          unit_price: number
          variant_id: string | null
          variant_name: string | null
        }
        Insert: {
          created_at?: string
          currency_code?: string
          id?: string
          line_total?: number | null
          name: string
          order_id: string
          organization_id: string
          product_id?: string | null
          quantity: number
          sku?: string | null
          unit_price: number
          variant_id?: string | null
          variant_name?: string | null
        }
        Update: {
          created_at?: string
          currency_code?: string
          id?: string
          line_total?: number | null
          name?: string
          order_id?: string
          organization_id?: string
          product_id?: string | null
          quantity?: number
          sku?: string | null
          unit_price?: number
          variant_id?: string | null
          variant_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_fk"
            columns: ["organization_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "order_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_fk"
            columns: ["organization_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "order_items_variant_fk"
            columns: ["organization_id", "variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      orders: {
        Row: {
          assigned_user_id: string | null
          channel_id: string | null
          closed_at: string | null
          conversation_id: string | null
          created_at: string
          currency_code: string
          customer_id: string
          delivery_notes: string | null
          discount_total: number
          fulfillment_status: string
          id: string
          metadata: Json
          order_number: number
          organization_id: string
          paid_at: string | null
          payment_status: string
          placed_at: string | null
          shipping_address_line1: string | null
          shipping_address_line2: string | null
          shipping_fee: number
          shipping_municipio: string | null
          shipping_name: string | null
          shipping_phone: string | null
          shipping_province: string | null
          shipping_sector: string | null
          shipping_zone_id: string | null
          status: string
          subtotal: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          assigned_user_id?: string | null
          channel_id?: string | null
          closed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          currency_code?: string
          customer_id: string
          delivery_notes?: string | null
          discount_total?: number
          fulfillment_status?: string
          id?: string
          metadata?: Json
          order_number?: never
          organization_id: string
          paid_at?: string | null
          payment_status?: string
          placed_at?: string | null
          shipping_address_line1?: string | null
          shipping_address_line2?: string | null
          shipping_fee?: number
          shipping_municipio?: string | null
          shipping_name?: string | null
          shipping_phone?: string | null
          shipping_province?: string | null
          shipping_sector?: string | null
          shipping_zone_id?: string | null
          status?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          assigned_user_id?: string | null
          channel_id?: string | null
          closed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          currency_code?: string
          customer_id?: string
          delivery_notes?: string | null
          discount_total?: number
          fulfillment_status?: string
          id?: string
          metadata?: Json
          order_number?: never
          organization_id?: string
          paid_at?: string | null
          payment_status?: string
          placed_at?: string | null
          shipping_address_line1?: string | null
          shipping_address_line2?: string | null
          shipping_fee?: number
          shipping_municipio?: string | null
          shipping_name?: string | null
          shipping_phone?: string | null
          shipping_province?: string | null
          shipping_sector?: string | null
          shipping_zone_id?: string | null
          status?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_assigned_user_membership_fk"
            columns: ["organization_id", "assigned_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "orders_channel_fk"
            columns: ["organization_id", "channel_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_channels"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "orders_conversation_fk"
            columns: ["organization_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "orders_customer_fk"
            columns: ["organization_id", "customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_shipping_zone_fk"
            columns: ["organization_id", "shipping_zone_id"]
            isOneToOne: false
            referencedRelation: "shipping_zones"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          created_at: string
          invited_email: string | null
          joined_at: string | null
          left_at: string | null
          organization_id: string
          role: Database["public"]["Enums"]["membership_role"]
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          invited_email?: string | null
          joined_at?: string | null
          left_at?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["membership_role"]
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          invited_email?: string | null
          joined_at?: string | null
          left_at?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["membership_role"]
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_payment_configs: {
        Row: {
          capture_mode_code: string
          config: Json
          created_at: string
          id: string
          is_default: boolean
          is_enabled: boolean
          method_type_code: string
          organization_id: string
          provider_code: string
          updated_at: string
          vault_secret_ref: string | null
        }
        Insert: {
          capture_mode_code?: string
          config?: Json
          created_at?: string
          id?: string
          is_default?: boolean
          is_enabled?: boolean
          method_type_code: string
          organization_id: string
          provider_code: string
          updated_at?: string
          vault_secret_ref?: string | null
        }
        Update: {
          capture_mode_code?: string
          config?: Json
          created_at?: string
          id?: string
          is_default?: boolean
          is_enabled?: boolean
          method_type_code?: string
          organization_id?: string
          provider_code?: string
          updated_at?: string
          vault_secret_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_payment_configs_capture_mode_code_fk"
            columns: ["capture_mode_code"]
            isOneToOne: false
            referencedRelation: "payment_capture_modes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "organization_payment_configs_method_type_code_fk"
            columns: ["method_type_code"]
            isOneToOne: false
            referencedRelation: "payment_method_types"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "organization_payment_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_payment_configs_provider_code_fk"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "payment_providers"
            referencedColumns: ["code"]
          },
        ]
      }
      organizations: {
        Row: {
          country_code: string
          created_at: string
          created_by: string
          currency_code: string
          default_locale: string
          id: string
          industry: string | null
          name: string
          plan_key: string
          slug: string
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          country_code?: string
          created_at?: string
          created_by: string
          currency_code?: string
          default_locale?: string
          id?: string
          industry?: string | null
          name: string
          plan_key?: string
          slug: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          country_code?: string
          created_at?: string
          created_by?: string
          currency_code?: string
          default_locale?: string
          id?: string
          industry?: string | null
          name?: string
          plan_key?: string
          slug?: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_attempts: {
        Row: {
          amount: number
          amount_authorized: number | null
          amount_captured: number | null
          authorized_at: string | null
          capture_mode_code: string
          captured_at: string | null
          completed_at: string | null
          conversation_id: string | null
          created_at: string
          currency_code: string
          expires_at: string | null
          failure_code: string | null
          failure_message: string | null
          id: string
          initiated_by_user_id: string | null
          method_type_code: string
          order_id: string
          organization_id: string
          provider_checkout_url: string | null
          provider_code: string
          provider_customer_ref: string | null
          provider_idempotency_key: string | null
          provider_metadata: Json
          provider_order_ref: string | null
          provider_payment_ref: string | null
          provider_session_id: string | null
          provider_status: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          amount_authorized?: number | null
          amount_captured?: number | null
          authorized_at?: string | null
          capture_mode_code?: string
          captured_at?: string | null
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          currency_code?: string
          expires_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          initiated_by_user_id?: string | null
          method_type_code: string
          order_id: string
          organization_id: string
          provider_checkout_url?: string | null
          provider_code: string
          provider_customer_ref?: string | null
          provider_idempotency_key?: string | null
          provider_metadata?: Json
          provider_order_ref?: string | null
          provider_payment_ref?: string | null
          provider_session_id?: string | null
          provider_status?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          amount_authorized?: number | null
          amount_captured?: number | null
          authorized_at?: string | null
          capture_mode_code?: string
          captured_at?: string | null
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          currency_code?: string
          expires_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          initiated_by_user_id?: string | null
          method_type_code?: string
          order_id?: string
          organization_id?: string
          provider_checkout_url?: string | null
          provider_code?: string
          provider_customer_ref?: string | null
          provider_idempotency_key?: string | null
          provider_metadata?: Json
          provider_order_ref?: string | null
          provider_payment_ref?: string | null
          provider_session_id?: string | null
          provider_status?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempts_capture_mode_code_fk"
            columns: ["capture_mode_code"]
            isOneToOne: false
            referencedRelation: "payment_capture_modes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "payment_attempts_conversation_fk"
            columns: ["organization_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "payment_attempts_initiated_by_user_membership_fk"
            columns: ["organization_id", "initiated_by_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "payment_attempts_method_type_code_fk"
            columns: ["method_type_code"]
            isOneToOne: false
            referencedRelation: "payment_method_types"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "payment_attempts_order_fk"
            columns: ["organization_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "payment_attempts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_attempts_provider_code_fk"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "payment_providers"
            referencedColumns: ["code"]
          },
        ]
      }
      payment_capture_modes: {
        Row: {
          code: string
          created_at: string
          display_name: string
          is_active: boolean
        }
        Insert: {
          code: string
          created_at?: string
          display_name: string
          is_active?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          display_name?: string
          is_active?: boolean
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          amount: number | null
          created_at: string
          currency_code: string | null
          event_at: string
          event_type: string
          id: string
          normalized_status: string | null
          order_id: string
          organization_id: string
          payload: Json
          payment_attempt_id: string
          provider_code: string
          provider_event_id: string | null
          provider_payment_ref: string | null
          provider_status: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          currency_code?: string | null
          event_at?: string
          event_type: string
          id?: string
          normalized_status?: string | null
          order_id: string
          organization_id: string
          payload?: Json
          payment_attempt_id: string
          provider_code: string
          provider_event_id?: string | null
          provider_payment_ref?: string | null
          provider_status?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          currency_code?: string | null
          event_at?: string
          event_type?: string
          id?: string
          normalized_status?: string | null
          order_id?: string
          organization_id?: string
          payload?: Json
          payment_attempt_id?: string
          provider_code?: string
          provider_event_id?: string | null
          provider_payment_ref?: string | null
          provider_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_attempt_fk"
            columns: ["organization_id", "payment_attempt_id"]
            isOneToOne: false
            referencedRelation: "payment_attempts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "payment_events_order_fk"
            columns: ["organization_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "payment_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_provider_code_fk"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "payment_providers"
            referencedColumns: ["code"]
          },
        ]
      }
      payment_method_types: {
        Row: {
          code: string
          created_at: string
          display_name: string
          is_active: boolean
        }
        Insert: {
          code: string
          created_at?: string
          display_name: string
          is_active?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          display_name?: string
          is_active?: boolean
        }
        Relationships: []
      }
      payment_providers: {
        Row: {
          code: string
          created_at: string
          display_name: string
          is_active: boolean
        }
        Insert: {
          code: string
          created_at?: string
          display_name: string
          is_active?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          display_name?: string
          is_active?: boolean
        }
        Relationships: []
      }
      product_media: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          media_type: string
          organization_id: string
          product_id: string
          public_url: string | null
          sort_order: number
          storage_path: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          media_type?: string
          organization_id: string
          product_id: string
          public_url?: string | null
          sort_order?: number
          storage_path?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          media_type?: string
          organization_id?: string
          product_id?: string
          public_url?: string | null
          sort_order?: number
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_media_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_media_product_fk"
            columns: ["organization_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      product_variants: {
        Row: {
          created_at: string
          id: string
          name: string
          option_values: Json
          organization_id: string
          price_override: number | null
          product_id: string
          sku: string | null
          status: string
          stock_quantity: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          option_values?: Json
          organization_id: string
          price_override?: number | null
          product_id: string
          sku?: string | null
          status?: string
          stock_quantity?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          option_values?: Json
          organization_id?: string
          price_override?: number | null
          product_id?: string
          sku?: string | null
          status?: string
          stock_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_fk"
            columns: ["organization_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      products: {
        Row: {
          allow_backorder: boolean
          compare_at_price: number | null
          created_at: string
          currency_code: string
          description: string | null
          external_ref: string | null
          id: string
          last_synced_at: string | null
          metadata: Json
          name: string
          organization_id: string
          price: number
          sku: string | null
          slug: string | null
          source_ref: string | null
          source_type: string
          status: string
          stock_quantity: number
          track_inventory: boolean
          updated_at: string
        }
        Insert: {
          allow_backorder?: boolean
          compare_at_price?: number | null
          created_at?: string
          currency_code?: string
          description?: string | null
          external_ref?: string | null
          id?: string
          last_synced_at?: string | null
          metadata?: Json
          name: string
          organization_id: string
          price: number
          sku?: string | null
          slug?: string | null
          source_ref?: string | null
          source_type?: string
          status?: string
          stock_quantity?: number
          track_inventory?: boolean
          updated_at?: string
        }
        Update: {
          allow_backorder?: boolean
          compare_at_price?: number | null
          created_at?: string
          currency_code?: string
          description?: string | null
          external_ref?: string | null
          id?: string
          last_synced_at?: string | null
          metadata?: Json
          name?: string
          organization_id?: string
          price?: number
          sku?: string | null
          slug?: string | null
          source_ref?: string | null
          source_type?: string
          status?: string
          stock_quantity?: number
          track_inventory?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_zones: {
        Row: {
          created_at: string
          delivery_available: boolean
          eta_max_minutes: number | null
          eta_min_minutes: number | null
          fee: number
          free_shipping_threshold: number | null
          id: string
          is_active: boolean
          municipio: string | null
          name: string
          organization_id: string
          pickup_available: boolean
          postal_code: string | null
          province: string
          same_day_eligible: boolean
          sector: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_available?: boolean
          eta_max_minutes?: number | null
          eta_min_minutes?: number | null
          fee?: number
          free_shipping_threshold?: number | null
          id?: string
          is_active?: boolean
          municipio?: string | null
          name: string
          organization_id: string
          pickup_available?: boolean
          postal_code?: string | null
          province: string
          same_day_eligible?: boolean
          sector?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_available?: boolean
          eta_max_minutes?: number | null
          eta_min_minutes?: number | null
          fee?: number
          free_shipping_threshold?: number | null
          id?: string
          is_active?: boolean
          municipio?: string | null
          name?: string
          organization_id?: string
          pickup_available?: boolean
          postal_code?: string | null
          province?: string
          same_day_eligible?: boolean
          sector?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_zones_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone_e164: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone_e164?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone_e164?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_channels: {
        Row: {
          connected_at: string | null
          created_at: string
          display_name: string | null
          id: string
          last_healthcheck_at: string | null
          last_inbound_message_at: string | null
          metadata: Json
          organization_id: string
          phone_e164: string
          provider: Database["public"]["Enums"]["channel_provider"]
          provider_business_account_id: string | null
          provider_phone_number_id: string | null
          quality_rating: string
          status: Database["public"]["Enums"]["channel_status"]
          updated_at: string
        }
        Insert: {
          connected_at?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          last_healthcheck_at?: string | null
          last_inbound_message_at?: string | null
          metadata?: Json
          organization_id: string
          phone_e164: string
          provider?: Database["public"]["Enums"]["channel_provider"]
          provider_business_account_id?: string | null
          provider_phone_number_id?: string | null
          quality_rating?: string
          status?: Database["public"]["Enums"]["channel_status"]
          updated_at?: string
        }
        Update: {
          connected_at?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          last_healthcheck_at?: string | null
          last_inbound_message_at?: string | null
          metadata?: Json
          organization_id?: string
          phone_e164?: string
          provider?: Database["public"]["Enums"]["channel_provider"]
          provider_business_account_id?: string | null
          provider_phone_number_id?: string | null
          quality_rating?: string
          status?: Database["public"]["Enums"]["channel_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_channels_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          category_code: string
          channel_id: string | null
          components: Json
          created_at: string
          created_by_user_id: string | null
          id: string
          language_code: string
          last_synced_at: string | null
          name: string
          organization_id: string
          provider_template_id: string | null
          quality_rating_code: string | null
          status_code: string
          updated_at: string
          variables_schema: Json
        }
        Insert: {
          category_code: string
          channel_id?: string | null
          components?: Json
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          language_code: string
          last_synced_at?: string | null
          name: string
          organization_id: string
          provider_template_id?: string | null
          quality_rating_code?: string | null
          status_code: string
          updated_at?: string
          variables_schema?: Json
        }
        Update: {
          category_code?: string
          channel_id?: string | null
          components?: Json
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          language_code?: string
          last_synced_at?: string | null
          name?: string
          organization_id?: string
          provider_template_id?: string | null
          quality_rating_code?: string | null
          status_code?: string
          updated_at?: string
          variables_schema?: Json
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_channel_fk"
            columns: ["organization_id", "channel_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_channels"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "whatsapp_templates_created_by_user_membership_fk"
            columns: ["organization_id", "created_by_user_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "whatsapp_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bootstrap_organization: {
        Args: {
          _country_code?: string
          _currency_code?: string
          _default_locale?: string
          _industry?: string
          _name: string
          _slug: string
          _timezone?: string
        }
        Returns: string
      }
      has_org_role: {
        Args: {
          _organization_id: string
          _roles: Database["public"]["Enums"]["membership_role"][]
        }
        Returns: boolean
      }
      is_org_member: { Args: { _organization_id: string }; Returns: boolean }
    }
    Enums: {
      channel_provider:
        | "meta_cloud_api"
        | "twilio_whatsapp"
        | "other"
        | "kapso_platform"
      channel_status:
        | "pending_verification"
        | "connected"
        | "disconnected"
        | "paused"
        | "error"
      job_status:
        | "queued"
        | "locked"
        | "succeeded"
        | "failed"
        | "cancelled"
        | "dead_letter"
      job_type:
        | "send_whatsapp_message"
        | "run_follow_up"
        | "payment_reconcile"
        | "refresh_catalog"
        | "recalc_lead_score"
        | "generic"
      lead_temperature: "cold" | "warm" | "hot"
      membership_role: "owner" | "admin" | "operator" | "analyst" | "read_only"
      message_direction: "inbound" | "outbound"
      message_sender_type: "customer" | "ai" | "human" | "system"
      payment_method_type:
        | "cardnet_button"
        | "cardnet_link"
        | "bank_transfer"
        | "cash_on_delivery"
        | "manual"
      payment_provider:
        | "cardnet"
        | "bank_transfer"
        | "cash_on_delivery"
        | "manual"
      webhook_provider: "whatsapp_meta" | "cardnet" | "other" | "whatsapp_kapso"
      webhook_status:
        | "received"
        | "validated"
        | "ignored"
        | "processed"
        | "failed"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      channel_provider: [
        "meta_cloud_api",
        "twilio_whatsapp",
        "other",
        "kapso_platform",
      ],
      channel_status: [
        "pending_verification",
        "connected",
        "disconnected",
        "paused",
        "error",
      ],
      job_status: [
        "queued",
        "locked",
        "succeeded",
        "failed",
        "cancelled",
        "dead_letter",
      ],
      job_type: [
        "send_whatsapp_message",
        "run_follow_up",
        "payment_reconcile",
        "refresh_catalog",
        "recalc_lead_score",
        "generic",
      ],
      lead_temperature: ["cold", "warm", "hot"],
      membership_role: ["owner", "admin", "operator", "analyst", "read_only"],
      message_direction: ["inbound", "outbound"],
      message_sender_type: ["customer", "ai", "human", "system"],
      payment_method_type: [
        "cardnet_button",
        "cardnet_link",
        "bank_transfer",
        "cash_on_delivery",
        "manual",
      ],
      payment_provider: [
        "cardnet",
        "bank_transfer",
        "cash_on_delivery",
        "manual",
      ],
      webhook_provider: ["whatsapp_meta", "cardnet", "other", "whatsapp_kapso"],
      webhook_status: [
        "received",
        "validated",
        "ignored",
        "processed",
        "failed",
      ],
    },
  },
} as const

