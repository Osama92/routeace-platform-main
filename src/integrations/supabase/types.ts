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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          city: string | null
          company_name: string
          contact_name: string
          country: string | null
          created_at: string
          created_by: string | null
          email: string
          email_delivery_updates: boolean | null
          email_invoice_reminders: boolean | null
          factory_address: string | null
          factory_lat: number | null
          factory_lng: number | null
          head_office_address: string | null
          head_office_lat: number | null
          head_office_lng: number | null
          id: string
          phone: string
          state: string | null
          tin_number: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          company_name: string
          contact_name: string
          country?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          email_delivery_updates?: boolean | null
          email_invoice_reminders?: boolean | null
          factory_address?: string | null
          factory_lat?: number | null
          factory_lng?: number | null
          head_office_address?: string | null
          head_office_lat?: number | null
          head_office_lng?: number | null
          id?: string
          phone: string
          state?: string | null
          tin_number?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          company_name?: string
          contact_name?: string
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          email_delivery_updates?: boolean | null
          email_invoice_reminders?: boolean | null
          factory_address?: string | null
          factory_lat?: number | null
          factory_lng?: number | null
          head_office_address?: string | null
          head_office_lat?: number | null
          head_office_lng?: number | null
          id?: string
          phone?: string
          state?: string | null
          tin_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      delivery_updates: {
        Row: {
          created_at: string
          dispatch_id: string
          email_sent: boolean | null
          id: string
          latitude: number | null
          location: string | null
          longitude: number | null
          notes: string | null
          photo_url: string | null
          status: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          dispatch_id: string
          email_sent?: boolean | null
          id?: string
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          notes?: string | null
          photo_url?: string | null
          status: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          dispatch_id?: string
          email_sent?: boolean | null
          id?: string
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          notes?: string | null
          photo_url?: string | null
          status?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_updates_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "dispatches"
            referencedColumns: ["id"]
          },
        ]
      }
      diesel_rate_config: {
        Row: {
          created_at: string
          created_by: string | null
          destination: string
          diesel_cost_per_liter: number | null
          diesel_liters_agreed: number
          distance_km: number | null
          id: string
          is_active: boolean | null
          notes: string | null
          origin: string
          route_id: string | null
          route_name: string
          truck_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          destination: string
          diesel_cost_per_liter?: number | null
          diesel_liters_agreed: number
          distance_km?: number | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          origin: string
          route_id?: string | null
          route_name: string
          truck_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          destination?: string
          diesel_cost_per_liter?: number | null
          diesel_liters_agreed?: number
          distance_km?: number | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          origin?: string
          route_id?: string | null
          route_name?: string
          truck_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "diesel_rate_config_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_dropoffs: {
        Row: {
          actual_arrival: string | null
          address: string
          completed_at: string | null
          created_at: string | null
          dispatch_id: string | null
          estimated_arrival: string | null
          id: string
          latitude: number | null
          longitude: number | null
          notes: string | null
          sequence_order: number
          status: string | null
          status_notes: string | null
          status_updated_at: string | null
        }
        Insert: {
          actual_arrival?: string | null
          address: string
          completed_at?: string | null
          created_at?: string | null
          dispatch_id?: string | null
          estimated_arrival?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          sequence_order: number
          status?: string | null
          status_notes?: string | null
          status_updated_at?: string | null
        }
        Update: {
          actual_arrival?: string | null
          address?: string
          completed_at?: string | null
          created_at?: string | null
          dispatch_id?: string | null
          estimated_arrival?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          sequence_order?: number
          status?: string | null
          status_notes?: string | null
          status_updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_dropoffs_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "dispatches"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatches: {
        Row: {
          actual_delivery: string | null
          actual_fuel_liters: number | null
          actual_pickup: string | null
          cargo_description: string | null
          cargo_weight_kg: number | null
          cost: number | null
          created_at: string
          created_by: string | null
          customer_id: string
          date_loaded: string | null
          delivery_address: string
          delivery_commenced_at: string | null
          delivery_lat: number | null
          delivery_lng: number | null
          dispatch_number: string
          distance_km: number | null
          driver_id: string | null
          fuel_variance: number | null
          id: string
          notes: string | null
          pickup_address: string
          pickup_lat: number | null
          pickup_lng: number | null
          priority: string | null
          return_distance_km: number | null
          route_id: string | null
          scheduled_delivery: string | null
          scheduled_pickup: string | null
          status: string | null
          suggested_fuel_liters: number | null
          total_distance_km: number | null
          updated_at: string
          vehicle_id: string | null
          approval_status: string | null
          created_by_role: string | null
          is_historical: boolean | null
          historical_transaction_id: string | null
          import_source: string | null
        }
        Insert: {
          actual_delivery?: string | null
          actual_fuel_liters?: number | null
          approval_status?: string | null
          created_by_role?: string | null
          actual_pickup?: string | null
          cargo_description?: string | null
          cargo_weight_kg?: number | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          date_loaded?: string | null
          delivery_address: string
          delivery_commenced_at?: string | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          dispatch_number: string
          distance_km?: number | null
          driver_id?: string | null
          fuel_variance?: number | null
          id?: string
          notes?: string | null
          pickup_address: string
          pickup_lat?: number | null
          pickup_lng?: number | null
          priority?: string | null
          return_distance_km?: number | null
          route_id?: string | null
          scheduled_delivery?: string | null
          scheduled_pickup?: string | null
          status?: string | null
          suggested_fuel_liters?: number | null
          total_distance_km?: number | null
          updated_at?: string
          vehicle_id?: string | null
          is_historical?: boolean | null
          historical_transaction_id?: string | null
          import_source?: string | null
        }
        Update: {
          actual_delivery?: string | null
          actual_fuel_liters?: number | null
          actual_pickup?: string | null
          cargo_description?: string | null
          cargo_weight_kg?: number | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          date_loaded?: string | null
          delivery_address?: string
          delivery_commenced_at?: string | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          dispatch_number?: string
          distance_km?: number | null
          driver_id?: string | null
          fuel_variance?: number | null
          id?: string
          notes?: string | null
          pickup_address?: string
          pickup_lat?: number | null
          pickup_lng?: number | null
          priority?: string | null
          return_distance_km?: number | null
          route_id?: string | null
          scheduled_delivery?: string | null
          scheduled_pickup?: string | null
          status?: string | null
          suggested_fuel_liters?: number | null
          total_distance_km?: number | null
          updated_at?: string
          vehicle_id?: string | null
          approval_status?: string | null
          created_by_role?: string | null
          is_historical?: boolean | null
          historical_transaction_id?: string | null
          import_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispatches_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatches_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatches_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatches_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_bonus_config: {
        Row: {
          bonus_amount: number
          bonus_type: string
          created_at: string | null
          id: string
          is_active: boolean | null
          metric: string
          threshold: number
          updated_at: string | null
        }
        Insert: {
          bonus_amount: number
          bonus_type: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          metric: string
          threshold: number
          updated_at?: string | null
        }
        Update: {
          bonus_amount?: number
          bonus_type?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          metric?: string
          threshold?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      driver_bonuses: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          bonus_type: string
          created_at: string | null
          driver_id: string | null
          id: string
          metrics: Json | null
          period_end: string | null
          period_start: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          bonus_type: string
          created_at?: string | null
          driver_id?: string | null
          id?: string
          metrics?: Json | null
          period_end?: string | null
          period_start?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          bonus_type?: string
          created_at?: string | null
          driver_id?: string | null
          id?: string
          metrics?: Json | null
          period_end?: string | null
          period_start?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_bonuses_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_documents: {
        Row: {
          created_at: string
          document_name: string
          document_type: string
          document_url: string | null
          driver_id: string
          expiry_date: string | null
          id: string
          is_verified: boolean | null
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          document_name: string
          document_type: string
          document_url?: string | null
          driver_id: string
          expiry_date?: string | null
          id?: string
          is_verified?: boolean | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          document_name?: string
          document_type?: string
          document_url?: string | null
          driver_id?: string
          expiry_date?: string | null
          id?: string
          is_verified?: boolean | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_documents_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_salaries: {
        Row: {
          approved_by: string | null
          created_at: string
          created_by: string | null
          dispatch_id: string | null
          driver_id: string
          gross_amount: number
          id: string
          net_amount: number | null
          notes: string | null
          period_end: string | null
          period_start: string | null
          salary_type: string
          status: string | null
          tax_amount: number | null
          taxable_income: number | null
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          dispatch_id?: string | null
          driver_id: string
          gross_amount?: number
          id?: string
          net_amount?: number | null
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          salary_type: string
          status?: string | null
          tax_amount?: number | null
          taxable_income?: number | null
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          dispatch_id?: string | null
          driver_id?: string
          gross_amount?: number
          id?: string
          net_amount?: number | null
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          salary_type?: string
          status?: string | null
          tax_amount?: number | null
          taxable_income?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_salaries_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "dispatches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_salaries_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          base_salary: number | null
          created_at: string
          documents_verified: boolean | null
          driver_type: string | null
          email: string | null
          full_name: string
          id: string
          license_expiry: string | null
          license_number: string | null
          partner_id: string | null
          phone: string
          rating: number | null
          salary_type: string | null
          status: string | null
          tax_id: string | null
          total_trips: number | null
          updated_at: string
          user_id: string | null
          approval_status: string | null
          created_by_role: string | null
        }
        Insert: {
          base_salary?: number | null
          created_at?: string
          documents_verified?: boolean | null
          driver_type?: string | null
          email?: string | null
          full_name: string
          id?: string
          license_expiry?: string | null
          license_number?: string | null
          partner_id?: string | null
          phone: string
          rating?: number | null
          salary_type?: string | null
          status?: string | null
          tax_id?: string | null
          total_trips?: number | null
          updated_at?: string
          user_id?: string | null
          approval_status?: string | null
          created_by_role?: string | null
        }
        Update: {
          base_salary?: number | null
          created_at?: string
          documents_verified?: boolean | null
          driver_type?: string | null
          email?: string | null
          full_name?: string
          id?: string
          license_expiry?: string | null
          license_number?: string | null
          partner_id?: string | null
          phone?: string
          rating?: number | null
          salary_type?: string | null
          status?: string | null
          tax_id?: string | null
          total_trips?: number | null
          updated_at?: string
          user_id?: string | null
          approval_status?: string | null
          created_by_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drivers_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      email_notifications: {
        Row: {
          body: string | null
          created_at: string
          dispatch_id: string | null
          error_message: string | null
          id: string
          notification_type: string | null
          recipient_email: string
          recipient_type: string
          sent_at: string | null
          sent_by: string | null
          sla_deadline: string | null
          sla_met: boolean | null
          sla_response_time_minutes: number | null
          status: string | null
          subject: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dispatch_id?: string | null
          error_message?: string | null
          id?: string
          notification_type?: string | null
          recipient_email: string
          recipient_type: string
          sent_at?: string | null
          sent_by?: string | null
          sla_deadline?: string | null
          sla_met?: boolean | null
          sla_response_time_minutes?: number | null
          status?: string | null
          subject: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dispatch_id?: string | null
          error_message?: string | null
          id?: string
          notification_type?: string | null
          recipient_email?: string
          recipient_type?: string
          sent_at?: string | null
          sent_by?: string | null
          sla_deadline?: string | null
          sla_met?: boolean | null
          sla_response_time_minutes?: number | null
          status?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_notifications_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "dispatches"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_template: string
          created_at: string | null
          id: string
          is_active: boolean | null
          subject_template: string
          template_name: string
          template_type: string
          updated_at: string | null
          updated_by: string | null
          variables: Json | null
        }
        Insert: {
          body_template: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          subject_template: string
          template_name: string
          template_type: string
          updated_at?: string | null
          updated_by?: string | null
          variables?: Json | null
        }
        Update: {
          body_template?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          subject_template?: string
          template_name?: string
          template_type?: string
          updated_at?: string | null
          updated_by?: string | null
          variables?: Json | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["expense_category"]
          cogs_vendor_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          description: string
          dispatch_id: string | null
          driver_id: string | null
          expense_date: string
          id: string
          is_cogs: boolean | null
          is_recurring: boolean | null
          notes: string | null
          receipt_url: string | null
          updated_at: string
          vehicle_id: string | null
          vendor_id: string | null
          zoho_expense_id: string | null
          zoho_synced_at: string | null
        }
        Insert: {
          amount: number
          category: Database["public"]["Enums"]["expense_category"]
          cogs_vendor_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description: string
          dispatch_id?: string | null
          driver_id?: string | null
          expense_date?: string
          id?: string
          is_cogs?: boolean | null
          is_recurring?: boolean | null
          notes?: string | null
          receipt_url?: string | null
          updated_at?: string
          vehicle_id?: string | null
          vendor_id?: string | null
          zoho_expense_id?: string | null
          zoho_synced_at?: string | null
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["expense_category"]
          cogs_vendor_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string
          dispatch_id?: string | null
          driver_id?: string | null
          expense_date?: string
          id?: string
          is_cogs?: boolean | null
          is_recurring?: boolean | null
          notes?: string | null
          receipt_url?: string | null
          updated_at?: string
          vehicle_id?: string | null
          vendor_id?: string | null
          zoho_expense_id?: string | null
          zoho_synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_cogs_vendor_id_fkey"
            columns: ["cogs_vendor_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "dispatches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_targets: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          cogs_input_type: string | null
          cogs_target: number
          created_at: string
          created_by: string | null
          expense_input_type: string | null
          expense_target: number
          id: string
          notes: string | null
          profit_input_type: string | null
          profit_target: number
          rejection_reason: string | null
          revenue_target: number
          status: string
          target_month: number | null
          target_type: string
          target_year: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          cogs_input_type?: string | null
          cogs_target?: number
          created_at?: string
          created_by?: string | null
          expense_input_type?: string | null
          expense_target?: number
          id?: string
          notes?: string | null
          profit_input_type?: string | null
          profit_target?: number
          rejection_reason?: string | null
          revenue_target?: number
          status?: string
          target_month?: number | null
          target_type: string
          target_year: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          cogs_input_type?: string | null
          cogs_target?: number
          created_at?: string
          created_by?: string | null
          expense_input_type?: string | null
          expense_target?: number
          id?: string
          notes?: string | null
          profit_input_type?: string | null
          profit_target?: number
          rejection_reason?: string | null
          revenue_target?: number
          status?: string
          target_month?: number | null
          target_type?: string
          target_year?: number
          updated_at?: string
        }
        Relationships: []
      }
      fuel_suggestions: {
        Row: {
          average_actual_fuel: number | null
          created_at: string | null
          delivery_address: string
          id: string
          pickup_address: string
          tonnage_category: string | null
          trip_count: number | null
          updated_at: string | null
          vehicle_type: string | null
        }
        Insert: {
          average_actual_fuel?: number | null
          created_at?: string | null
          delivery_address: string
          id?: string
          pickup_address: string
          tonnage_category?: string | null
          trip_count?: number | null
          updated_at?: string | null
          vehicle_type?: string | null
        }
        Update: {
          average_actual_fuel?: number | null
          created_at?: string | null
          delivery_address?: string
          id?: string
          pickup_address?: string
          tonnage_category?: string | null
          trip_count?: number | null
          updated_at?: string | null
          vehicle_type?: string | null
        }
        Relationships: []
      }
      historical_invoice_data: {
        Row: {
          amount_not_vatable: number | null
          amount_vatable: number | null
          balance_owed: number | null
          bank_debited: string | null
          bank_payment_received: string | null
          customer_id: string | null
          customer_name: string
          customer_payment_status: string | null
          daily_rate: number | null
          delivery_location: string | null
          dispatch_id: string | null
          driver_name: string | null
          drop_point: string | null
          due_date: string | null
          extra_dropoff_cost: number | null
          extra_dropoffs: number | null
          gap_in_payment: number | null
          gross_profit: number | null
          id: string
          imported_at: string
          imported_by: string | null
          interest_not_paid: number | null
          interest_paid: number | null
          invoice_age_for_interest: number | null
          invoice_ageing: number | null
          invoice_amount_paid: number | null
          invoice_date: string | null
          invoice_number: string | null
          invoice_paid_date: string | null
          invoice_status: string | null
          km_covered: number | null
          month_name: string | null
          notes: string | null
          num_deliveries: number | null
          payment_receipt_date: string | null
          payment_terms_days: number | null
          period_month: number
          period_year: number
          pick_off: string | null
          pickup_location: string | null
          profit_margin: number | null
          route: string | null
          route_cluster: string | null
          source_file: string | null
          sub_total: number | null
          tonnage: string | null
          tonnage_loaded: number | null
          total_amount: number | null
          total_cost: number | null
          total_revenue: number | null
          total_vendor_cost: number | null
          transaction_date: string | null
          transaction_type: string | null
          trips_count: number | null
          truck_number: string | null
          truck_type: string | null
          vat_amount: number | null
          vendor_bill_number: string | null
          vendor_id: string | null
          vendor_invoice_status: string | null
          vendor_invoice_submission_date: string | null
          vendor_name: string | null
          waybill_number: string | null
          waybill_numbers: string[] | null
          week_num: number | null
          wht_deducted: number | null
          wht_status: string | null
        }
        Insert: {
          amount_not_vatable?: number | null
          amount_vatable?: number | null
          balance_owed?: number | null
          bank_debited?: string | null
          bank_payment_received?: string | null
          customer_id?: string | null
          customer_name: string
          customer_payment_status?: string | null
          daily_rate?: number | null
          delivery_location?: string | null
          dispatch_id?: string | null
          driver_name?: string | null
          drop_point?: string | null
          due_date?: string | null
          extra_dropoff_cost?: number | null
          extra_dropoffs?: number | null
          gap_in_payment?: number | null
          gross_profit?: number | null
          id?: string
          imported_at?: string
          imported_by?: string | null
          interest_not_paid?: number | null
          interest_paid?: number | null
          invoice_age_for_interest?: number | null
          invoice_ageing?: number | null
          invoice_amount_paid?: number | null
          invoice_date?: string | null
          invoice_number?: string | null
          invoice_paid_date?: string | null
          invoice_status?: string | null
          km_covered?: number | null
          month_name?: string | null
          notes?: string | null
          num_deliveries?: number | null
          payment_receipt_date?: string | null
          payment_terms_days?: number | null
          period_month: number
          period_year: number
          pick_off?: string | null
          pickup_location?: string | null
          profit_margin?: number | null
          route?: string | null
          route_cluster?: string | null
          source_file?: string | null
          sub_total?: number | null
          tonnage?: string | null
          tonnage_loaded?: number | null
          total_amount?: number | null
          total_cost?: number | null
          total_revenue?: number | null
          total_vendor_cost?: number | null
          transaction_date?: string | null
          transaction_type?: string | null
          trips_count?: number | null
          truck_number?: string | null
          truck_type?: string | null
          vat_amount?: number | null
          vendor_bill_number?: string | null
          vendor_id?: string | null
          vendor_invoice_status?: string | null
          vendor_invoice_submission_date?: string | null
          vendor_name?: string | null
          waybill_number?: string | null
          waybill_numbers?: string[] | null
          week_num?: number | null
          wht_deducted?: number | null
          wht_status?: string | null
        }
        Update: {
          amount_not_vatable?: number | null
          amount_vatable?: number | null
          balance_owed?: number | null
          bank_debited?: string | null
          bank_payment_received?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_payment_status?: string | null
          daily_rate?: number | null
          delivery_location?: string | null
          dispatch_id?: string | null
          driver_name?: string | null
          drop_point?: string | null
          due_date?: string | null
          extra_dropoff_cost?: number | null
          extra_dropoffs?: number | null
          gap_in_payment?: number | null
          gross_profit?: number | null
          id?: string
          imported_at?: string
          imported_by?: string | null
          interest_not_paid?: number | null
          interest_paid?: number | null
          invoice_age_for_interest?: number | null
          invoice_ageing?: number | null
          invoice_amount_paid?: number | null
          invoice_date?: string | null
          invoice_number?: string | null
          invoice_paid_date?: string | null
          invoice_status?: string | null
          km_covered?: number | null
          month_name?: string | null
          notes?: string | null
          num_deliveries?: number | null
          payment_receipt_date?: string | null
          payment_terms_days?: number | null
          period_month?: number
          period_year?: number
          pick_off?: string | null
          pickup_location?: string | null
          profit_margin?: number | null
          route?: string | null
          route_cluster?: string | null
          source_file?: string | null
          sub_total?: number | null
          tonnage?: string | null
          tonnage_loaded?: number | null
          total_amount?: number | null
          total_cost?: number | null
          total_revenue?: number | null
          total_vendor_cost?: number | null
          transaction_date?: string | null
          transaction_type?: string | null
          trips_count?: number | null
          truck_number?: string | null
          truck_type?: string | null
          vat_amount?: number | null
          vendor_bill_number?: string | null
          vendor_id?: string | null
          vendor_invoice_status?: string | null
          vendor_invoice_submission_date?: string | null
          vendor_name?: string | null
          waybill_number?: string | null
          waybill_numbers?: string[] | null
          week_num?: number | null
          wht_deducted?: number | null
          wht_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historical_invoice_data_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_invoice_data_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          api_key: string | null
          api_secret: string | null
          config: Json | null
          created_at: string
          created_by: string | null
          id: string
          is_enabled: boolean | null
          last_sync_at: string | null
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          api_key?: string | null
          api_secret?: string | null
          config?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_enabled?: boolean | null
          last_sync_at?: string | null
          name: string
          type: string
          updated_at?: string
        }
        Update: {
          api_key?: string | null
          api_secret?: string | null
          config?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_enabled?: boolean | null
          last_sync_at?: string | null
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount: number
          approval_status: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          dispatch_id: string | null
          due_date: string | null
          first_approved_at: string | null
          first_approver_id: string | null
          id: string
          invoice_number: string
          notes: string | null
          paid_date: string | null
          rejection_reason: string | null
          second_approved_at: string | null
          second_approver_id: string | null
          status: string | null
          status_updated_at: string | null
          submitted_by: string | null
          tax_amount: number | null
          tax_type: string | null
          total_amount: number
          updated_at: string
          zoho_invoice_id: string | null
          zoho_synced_at: string | null
        }
        Insert: {
          amount: number
          approval_status?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          dispatch_id?: string | null
          due_date?: string | null
          first_approved_at?: string | null
          first_approver_id?: string | null
          id?: string
          invoice_number: string
          notes?: string | null
          paid_date?: string | null
          rejection_reason?: string | null
          second_approved_at?: string | null
          second_approver_id?: string | null
          status?: string | null
          status_updated_at?: string | null
          submitted_by?: string | null
          tax_amount?: number | null
          tax_type?: string | null
          total_amount: number
          updated_at?: string
          zoho_invoice_id?: string | null
          zoho_synced_at?: string | null
        }
        Update: {
          amount?: number
          approval_status?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          dispatch_id?: string | null
          due_date?: string | null
          first_approved_at?: string | null
          first_approver_id?: string | null
          id?: string
          invoice_number?: string
          notes?: string | null
          paid_date?: string | null
          rejection_reason?: string | null
          second_approved_at?: string | null
          second_approver_id?: string | null
          status?: string | null
          status_updated_at?: string | null
          submitted_by?: string | null
          tax_amount?: number | null
          tax_type?: string | null
          total_amount?: number
          updated_at?: string
          zoho_invoice_id?: string | null
          zoho_synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "dispatches"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          address: string | null
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_name: string | null
          cac_number: string | null
          city: string | null
          company_name: string
          contact_email: string
          contact_name: string
          contact_phone: string
          country: string | null
          created_at: string
          created_by: string | null
          director_name: string | null
          director_nin: string | null
          director_phone: string | null
          id: string
          is_verified: boolean | null
          notes: string | null
          partner_type: string
          rejection_reason: string | null
          state: string | null
          tin_number: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          cac_number?: string | null
          city?: string | null
          company_name: string
          contact_email: string
          contact_name: string
          contact_phone: string
          country?: string | null
          created_at?: string
          created_by?: string | null
          director_name?: string | null
          director_nin?: string | null
          director_phone?: string | null
          id?: string
          is_verified?: boolean | null
          notes?: string | null
          partner_type: string
          rejection_reason?: string | null
          state?: string | null
          tin_number?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          cac_number?: string | null
          city?: string | null
          company_name?: string
          contact_email?: string
          contact_name?: string
          contact_phone?: string
          country?: string | null
          created_at?: string
          created_by?: string | null
          director_name?: string | null
          director_nin?: string | null
          director_phone?: string | null
          id?: string
          is_verified?: boolean | null
          notes?: string | null
          partner_type?: string
          rejection_reason?: string | null
          state?: string | null
          tin_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      product_metrics: {
        Row: {
          api_calls: number | null
          average_session_duration_minutes: number | null
          created_at: string | null
          daily_active_users: number | null
          error_count: number | null
          feature_usage: Json | null
          id: string
          metric_date: string
          total_dispatches: number | null
          total_invoices_raised: number | null
          total_revenue: number | null
          updated_at: string | null
        }
        Insert: {
          api_calls?: number | null
          average_session_duration_minutes?: number | null
          created_at?: string | null
          daily_active_users?: number | null
          error_count?: number | null
          feature_usage?: Json | null
          id?: string
          metric_date: string
          total_dispatches?: number | null
          total_invoices_raised?: number | null
          total_revenue?: number | null
          updated_at?: string | null
        }
        Update: {
          api_calls?: number | null
          average_session_duration_minutes?: number | null
          created_at?: string | null
          daily_active_users?: number | null
          error_count?: number | null
          feature_usage?: Json | null
          id?: string
          metric_date?: string
          total_dispatches?: number | null
          total_invoices_raised?: number | null
          total_revenue?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean | null
          phone: string | null
          suspended_at: string | null
          suspended_by: string | null
          suspension_reason: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          is_active?: boolean | null
          phone?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean | null
          phone?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rate_change_recipients: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          id: string
          is_active: boolean | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          is_active?: boolean | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
        }
        Relationships: []
      }
      route_waypoints: {
        Row: {
          address: string
          created_at: string
          distance_from_previous_km: number | null
          duration_from_previous_hours: number | null
          id: string
          latitude: number | null
          location_name: string
          longitude: number | null
          route_id: string
          sequence_order: number
          sla_hours: number | null
          updated_at: string
        }
        Insert: {
          address: string
          created_at?: string
          distance_from_previous_km?: number | null
          duration_from_previous_hours?: number | null
          id?: string
          latitude?: number | null
          location_name: string
          longitude?: number | null
          route_id: string
          sequence_order?: number
          sla_hours?: number | null
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          distance_from_previous_km?: number | null
          duration_from_previous_hours?: number | null
          id?: string
          latitude?: number | null
          location_name?: string
          longitude?: number | null
          route_id?: string
          sequence_order?: number
          sla_hours?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_waypoints_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          created_at: string
          created_by: string | null
          destination: string
          destination_lat: number | null
          destination_lng: number | null
          distance_km: number | null
          estimated_duration_hours: number | null
          id: string
          is_active: boolean | null
          name: string
          origin: string
          origin_lat: number | null
          origin_lng: number | null
          updated_at: string
          waypoints: Json | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          destination: string
          destination_lat?: number | null
          destination_lng?: number | null
          distance_km?: number | null
          estimated_duration_hours?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          origin: string
          origin_lat?: number | null
          origin_lng?: number | null
          updated_at?: string
          waypoints?: Json | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          destination?: string
          destination_lat?: number | null
          destination_lng?: number | null
          distance_km?: number | null
          estimated_duration_hours?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          origin?: string
          origin_lat?: number | null
          origin_lng?: number | null
          updated_at?: string
          waypoints?: Json | null
        }
        Relationships: []
      }
      session_alerts: {
        Row: {
          alert_type: string
          created_at: string
          id: string
          is_read: boolean | null
          is_resolved: boolean | null
          message: string
          resolved_at: string | null
          resolved_by: string | null
          session_id: string | null
          user_id: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          is_resolved?: boolean | null
          message: string
          resolved_at?: string | null
          resolved_by?: string | null
          session_id?: string | null
          user_id: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          is_resolved?: boolean | null
          message?: string
          resolved_at?: string | null
          resolved_by?: string | null
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_alerts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "user_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_breach_alerts: {
        Row: {
          actual_time: string | null
          alert_sent: boolean | null
          breach_type: string
          created_at: string
          delay_hours: number | null
          dispatch_id: string
          expected_time: string | null
          id: string
          is_resolved: boolean | null
          notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          waypoint_id: string | null
        }
        Insert: {
          actual_time?: string | null
          alert_sent?: boolean | null
          breach_type: string
          created_at?: string
          delay_hours?: number | null
          dispatch_id: string
          expected_time?: string | null
          id?: string
          is_resolved?: boolean | null
          notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          waypoint_id?: string | null
        }
        Update: {
          actual_time?: string | null
          alert_sent?: boolean | null
          breach_type?: string
          created_at?: string
          delay_hours?: number | null
          dispatch_id?: string
          expected_time?: string | null
          id?: string
          is_resolved?: boolean | null
          notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          waypoint_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sla_breach_alerts_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "dispatches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_breach_alerts_waypoint_id_fkey"
            columns: ["waypoint_id"]
            isOneToOne: false
            referencedRelation: "route_waypoints"
            referencedColumns: ["id"]
          },
        ]
      }
      target_approvals: {
        Row: {
          approver_id: string
          comments: string | null
          created_at: string
          id: string
          status: string
          target_id: string
          updated_at: string
        }
        Insert: {
          approver_id: string
          comments?: string | null
          created_at?: string
          id?: string
          status?: string
          target_id: string
          updated_at?: string
        }
        Update: {
          approver_id?: string
          comments?: string | null
          created_at?: string
          id?: string
          status?: string
          target_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "target_approvals_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "financial_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_tokens: {
        Row: {
          created_at: string
          dispatch_id: string
          expires_at: string
          id: string
          token: string
        }
        Insert: {
          created_at?: string
          dispatch_id: string
          expires_at?: string
          id?: string
          token?: string
        }
        Update: {
          created_at?: string
          dispatch_id?: string
          expires_at?: string
          id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_tokens_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: true
            referencedRelation: "dispatches"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_rate_config: {
        Row: {
          created_at: string | null
          customer_id: string | null
          description: string | null
          driver_type: string | null
          id: string
          is_net: boolean | null
          partner_id: string | null
          pickup_location: string | null
          rate_amount: number
          route_id: string | null
          truck_type: string
          updated_at: string | null
          zone: string
        }
        Insert: {
          created_at?: string | null
          customer_id?: string | null
          description?: string | null
          driver_type?: string | null
          id?: string
          is_net?: boolean | null
          partner_id?: string | null
          pickup_location?: string | null
          rate_amount?: number
          route_id?: string | null
          truck_type: string
          updated_at?: string | null
          zone: string
        }
        Update: {
          created_at?: string | null
          customer_id?: string | null
          description?: string | null
          driver_type?: string | null
          id?: string
          is_net?: boolean | null
          partner_id?: string | null
          pickup_location?: string | null
          rate_amount?: number
          route_id?: string | null
          truck_type?: string
          updated_at?: string | null
          zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_rate_config_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_rate_config_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_rate_config_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_rate_history: {
        Row: {
          change_type: string
          changed_by: string | null
          changed_by_email: string | null
          created_at: string
          customer_id: string | null
          driver_type: string | null
          id: string
          new_rate_amount: number
          notes: string | null
          old_rate_amount: number | null
          partner_id: string | null
          rate_config_id: string | null
          truck_type: string
          zone: string
        }
        Insert: {
          change_type: string
          changed_by?: string | null
          changed_by_email?: string | null
          created_at?: string
          customer_id?: string | null
          driver_type?: string | null
          id?: string
          new_rate_amount: number
          notes?: string | null
          old_rate_amount?: number | null
          partner_id?: string | null
          rate_config_id?: string | null
          truck_type: string
          zone: string
        }
        Update: {
          change_type?: string
          changed_by?: string | null
          changed_by_email?: string | null
          created_at?: string
          customer_id?: string | null
          driver_type?: string | null
          id?: string
          new_rate_amount?: number
          notes?: string | null
          old_rate_amount?: number | null
          partner_id?: string | null
          rate_config_id?: string | null
          truck_type?: string
          zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_rate_history_rate_config_id_fkey"
            columns: ["rate_config_id"]
            isOneToOne: false
            referencedRelation: "trip_rate_config"
            referencedColumns: ["id"]
          },
        ]
      }
      user_access_log: {
        Row: {
          action: string
          created_at: string
          id: string
          new_role: string | null
          new_status: string | null
          performed_by: string
          previous_role: string | null
          previous_status: string | null
          reason: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_role?: string | null
          new_status?: string | null
          performed_by: string
          previous_role?: string | null
          previous_status?: string | null
          reason?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_role?: string | null
          new_status?: string | null
          performed_by?: string
          previous_role?: string | null
          previous_status?: string | null
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_presence: {
        Row: {
          current_page: string | null
          id: string
          last_active_at: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          current_page?: string | null
          id?: string
          last_active_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          current_page?: string | null
          id?: string
          last_active_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          id: string
          ip_address: string | null
          login_at: string | null
          logout_at: string | null
          session_duration_minutes: number | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          id?: string
          ip_address?: string | null
          login_at?: string | null
          logout_at?: string | null
          session_duration_minutes?: number | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          id?: string
          ip_address?: string | null
          login_at?: string | null
          logout_at?: string | null
          session_duration_minutes?: number | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      vehicle_documents: {
        Row: {
          alert_sent: boolean | null
          created_at: string
          document_name: string
          document_type: string
          document_url: string | null
          expiry_date: string | null
          id: string
          is_verified: boolean | null
          updated_at: string
          vehicle_id: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          alert_sent?: boolean | null
          created_at?: string
          document_name: string
          document_type: string
          document_url?: string | null
          expiry_date?: string | null
          id?: string
          is_verified?: boolean | null
          updated_at?: string
          vehicle_id: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          alert_sent?: boolean | null
          created_at?: string
          document_name?: string
          document_type?: string
          document_url?: string | null
          expiry_date?: string | null
          id?: string
          is_verified?: boolean | null
          updated_at?: string
          vehicle_id?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_documents_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          capacity_kg: number | null
          created_at: string
          current_fuel_level: number | null
          fuel_type: string | null
          id: string
          last_maintenance: string | null
          make: string | null
          model: string | null
          next_maintenance: string | null
          partner_id: string | null
          registration_number: string
          status: string | null
          truck_type: string | null
          updated_at: string
          vehicle_type: string
          year: number | null
          approval_status: string | null
          created_by_role: string | null
          current_location: string | null
          current_lat: number | null
          current_lng: number | null
          location_updated_at: string | null
          fleet_type: string | null
          vendor_id: string | null
        }
        Insert: {
          capacity_kg?: number | null
          created_at?: string
          current_fuel_level?: number | null
          fuel_type?: string | null
          id?: string
          last_maintenance?: string | null
          make?: string | null
          model?: string | null
          next_maintenance?: string | null
          partner_id?: string | null
          registration_number: string
          status?: string | null
          truck_type?: string | null
          updated_at?: string
          vehicle_type: string
          year?: number | null
          approval_status?: string | null
          created_by_role?: string | null
          current_location?: string | null
          current_lat?: number | null
          current_lng?: number | null
          location_updated_at?: string | null
          fleet_type?: string | null
          vendor_id?: string | null
        }
        Update: {
          capacity_kg?: number | null
          created_at?: string
          current_fuel_level?: number | null
          fuel_type?: string | null
          id?: string
          last_maintenance?: string | null
          make?: string | null
          model?: string | null
          next_maintenance?: string | null
          partner_id?: string | null
          registration_number?: string
          status?: string | null
          truck_type?: string | null
          updated_at?: string
          vehicle_type?: string
          year?: number | null
          approval_status?: string | null
          created_by_role?: string | null
          current_location?: string | null
          current_lat?: number | null
          current_lng?: number | null
          location_updated_at?: string | null
          fleet_type?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_payables: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          dispatch_id: string | null
          due_date: string | null
          expense_id: string | null
          id: string
          invoice_number: string | null
          notes: string | null
          paid_amount: number | null
          paid_date: string | null
          partner_id: string
          payment_reference: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          dispatch_id?: string | null
          due_date?: string | null
          expense_id?: string | null
          id?: string
          invoice_number?: string | null
          notes?: string | null
          paid_amount?: number | null
          paid_date?: string | null
          partner_id: string
          payment_reference?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          dispatch_id?: string | null
          due_date?: string | null
          expense_id?: string | null
          id?: string
          invoice_number?: string | null
          notes?: string | null
          paid_amount?: number | null
          paid_date?: string | null
          partner_id?: string
          payment_reference?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_payables_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "dispatches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payables_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payables_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_performance_snapshots: {
        Row: {
          actuals_summary: Json
          balance_summary: Json
          created_at: string | null
          email_sent: boolean | null
          email_sent_at: string | null
          id: string
          snapshot_month: number
          snapshot_week: number
          snapshot_year: number
          targets_summary: Json
          vendor_id: string
        }
        Insert: {
          actuals_summary?: Json
          balance_summary?: Json
          created_at?: string | null
          email_sent?: boolean | null
          email_sent_at?: string | null
          id?: string
          snapshot_month: number
          snapshot_week: number
          snapshot_year: number
          targets_summary?: Json
          vendor_id: string
        }
        Update: {
          actuals_summary?: Json
          balance_summary?: Json
          created_at?: string | null
          email_sent?: boolean | null
          email_sent_at?: string | null
          id?: string
          snapshot_month?: number
          snapshot_week?: number
          snapshot_year?: number
          targets_summary?: Json
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_performance_snapshots_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_truck_actuals: {
        Row: {
          created_at: string | null
          dispatch_id: string | null
          id: string
          target_id: string
          trips_count: number | null
          week_number: number
        }
        Insert: {
          created_at?: string | null
          dispatch_id?: string | null
          id?: string
          target_id: string
          trips_count?: number | null
          week_number: number
        }
        Update: {
          created_at?: string | null
          dispatch_id?: string | null
          id?: string
          target_id?: string
          trips_count?: number | null
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "vendor_truck_actuals_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "dispatches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_truck_actuals_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "vendor_truck_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_truck_targets: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          target_month: number
          target_trips: number
          target_year: number
          truck_type: string
          updated_at: string | null
          vendor_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          target_month: number
          target_trips?: number
          target_year: number
          truck_type: string
          updated_at?: string | null
          vendor_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          target_month?: number
          target_trips?: number
          target_year?: number
          truck_type?: string
          updated_at?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_truck_targets_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      zoho_sync_logs: {
        Row: {
          completed_at: string | null
          error_message: string | null
          id: string
          records_failed: number | null
          records_synced: number | null
          started_at: string
          status: string | null
          sync_type: string
          triggered_by: string | null
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          records_failed?: number | null
          records_synced?: number | null
          started_at?: string
          status?: string | null
          sync_type: string
          triggered_by?: string | null
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          records_failed?: number | null
          records_synced?: number | null
          started_at?: string
          status?: string | null
          sync_type?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      detect_sla_breaches: { Args: never; Returns: number }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_any_role: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      mark_overdue_invoices: { Args: never; Returns: number }
    }
    Enums: {
      app_role: "admin" | "operations" | "support" | "dispatcher" | "driver"
      expense_category:
        | "fuel"
        | "maintenance"
        | "driver_salary"
        | "insurance"
        | "tolls"
        | "parking"
        | "repairs"
        | "administrative"
        | "marketing"
        | "utilities"
        | "rent"
        | "equipment"
        | "other"
        | "cogs"
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
    Enums: {
      app_role: ["admin", "operations", "support", "dispatcher", "driver"],
      expense_category: [
        "fuel",
        "maintenance",
        "driver_salary",
        "insurance",
        "tolls",
        "parking",
        "repairs",
        "administrative",
        "marketing",
        "utilities",
        "rent",
        "equipment",
        "other",
        "cogs",
      ],
    },
  },
} as const
