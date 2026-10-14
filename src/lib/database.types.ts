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
    PostgrestVersion: "14.18"
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
      accessory_types: {
        Row: {
          id: number
          is_active: boolean
          name: string
          stock_item_id: number | null
        }
        Insert: {
          id?: never
          is_active?: boolean
          name: string
          stock_item_id?: number | null
        }
        Update: {
          id?: never
          is_active?: boolean
          name?: string
          stock_item_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "accessory_types_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_accessories: {
        Row: {
          accessory_type_id: number
          asset_id: string
        }
        Insert: {
          accessory_type_id: number
          asset_id: string
        }
        Update: {
          accessory_type_id?: number
          asset_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_accessories_accessory_type_id_fkey"
            columns: ["accessory_type_id"]
            isOneToOne: false
            referencedRelation: "accessory_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_accessories_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_accessories_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_employee_holdings"
            referencedColumns: ["asset_id"]
          },
        ]
      }
      assets: {
        Row: {
          accessories_note: string | null
          asset_tag: string
          assigned_employee_id: string | null
          category_id: number
          condition: string
          created_at: string
          created_by: string | null
          custom_values: Json
          date_assigned: string | null
          department_id: number | null
          id: string
          invoice_no: string | null
          label_printed_at: string | null
          location_id: number | null
          make: string | null
          model: string | null
          notes: string | null
          purchase_date: string | null
          purchase_price: number | null
          serial_number: string | null
          specification: string | null
          status: string
          supplier_id: number | null
          updated_at: string | null
          updated_by: string | null
          warranty_until: string | null
        }
        Insert: {
          accessories_note?: string | null
          asset_tag: string
          assigned_employee_id?: string | null
          category_id: number
          condition?: string
          created_at?: string
          created_by?: string | null
          custom_values?: Json
          date_assigned?: string | null
          department_id?: number | null
          id?: string
          invoice_no?: string | null
          label_printed_at?: string | null
          location_id?: number | null
          make?: string | null
          model?: string | null
          notes?: string | null
          purchase_date?: string | null
          purchase_price?: number | null
          serial_number?: string | null
          specification?: string | null
          status?: string
          supplier_id?: number | null
          updated_at?: string | null
          updated_by?: string | null
          warranty_until?: string | null
        }
        Update: {
          accessories_note?: string | null
          asset_tag?: string
          assigned_employee_id?: string | null
          category_id?: number
          condition?: string
          created_at?: string
          created_by?: string | null
          custom_values?: Json
          date_assigned?: string | null
          department_id?: number | null
          id?: string
          invoice_no?: string | null
          label_printed_at?: string | null
          location_id?: number | null
          make?: string | null
          model?: string | null
          notes?: string | null
          purchase_date?: string | null
          purchase_price?: number | null
          serial_number?: string | null
          specification?: string | null
          status?: string
          supplier_id?: number | null
          updated_at?: string | null
          updated_by?: string | null
          warranty_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_assigned_employee_id_fkey"
            columns: ["assigned_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_assigned_employee_id_fkey"
            columns: ["assigned_employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_holdings"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "assets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_category_summary"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "assets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_department_summary"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "assets_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "v_department_summary"
            referencedColumns: ["department_id"]
          },
          {
            foreignKeyName: "assets_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          at: string
          id: number
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          at?: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          at?: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          category_group: string
          custom_fields: Json
          id: number
          is_active: boolean
          min_spares: number
          name: string
          next_tag_number: number
          service_interval_days: number | null
          tag_prefix: string
          typical_replacement_cost: number | null
        }
        Insert: {
          category_group?: string
          custom_fields?: Json
          id?: never
          is_active?: boolean
          min_spares?: number
          name: string
          next_tag_number?: number
          service_interval_days?: number | null
          tag_prefix: string
          typical_replacement_cost?: number | null
        }
        Update: {
          category_group?: string
          custom_fields?: Json
          id?: never
          is_active?: boolean
          min_spares?: number
          name?: string
          next_tag_number?: number
          service_interval_days?: number | null
          tag_prefix?: string
          typical_replacement_cost?: number | null
        }
        Relationships: []
      }
      change_log: {
        Row: {
          accessories: string[]
          accessories_missing: string[]
          asset_id: string
          change_date: string
          change_no: string
          change_type: string
          condition: string | null
          created_at: string
          created_by: string | null
          from_employee_id: string | null
          from_location_id: number | null
          from_text: string | null
          handover_form_id: number | null
          id: number
          reason: string | null
          to_employee_id: string | null
          to_location_id: number | null
          to_text: string | null
        }
        Insert: {
          accessories?: string[]
          accessories_missing?: string[]
          asset_id: string
          change_date?: string
          change_no?: string
          change_type: string
          condition?: string | null
          created_at?: string
          created_by?: string | null
          from_employee_id?: string | null
          from_location_id?: number | null
          from_text?: string | null
          handover_form_id?: number | null
          id?: never
          reason?: string | null
          to_employee_id?: string | null
          to_location_id?: number | null
          to_text?: string | null
        }
        Update: {
          accessories?: string[]
          accessories_missing?: string[]
          asset_id?: string
          change_date?: string
          change_no?: string
          change_type?: string
          condition?: string | null
          created_at?: string
          created_by?: string | null
          from_employee_id?: string | null
          from_location_id?: number | null
          from_text?: string | null
          handover_form_id?: number | null
          id?: never
          reason?: string | null
          to_employee_id?: string | null
          to_location_id?: number | null
          to_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "change_log_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_log_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_employee_holdings"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "change_log_from_employee_id_fkey"
            columns: ["from_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_log_from_employee_id_fkey"
            columns: ["from_employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_holdings"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "change_log_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_log_handover_form_id_fkey"
            columns: ["handover_form_id"]
            isOneToOne: false
            referencedRelation: "handover_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_log_to_employee_id_fkey"
            columns: ["to_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_log_to_employee_id_fkey"
            columns: ["to_employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_holdings"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "change_log_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          id: number
          is_active: boolean
          name: string
        }
        Insert: {
          id?: never
          is_active?: boolean
          name: string
        }
        Update: {
          id?: never
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          contact_no: string | null
          created_at: string
          created_by: string | null
          default_location_id: number | null
          department_id: number | null
          designation: string | null
          full_name: string
          id: string
          joined_on: string | null
          left_on: string | null
          nid: string
          notes: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          contact_no?: string | null
          created_at?: string
          created_by?: string | null
          default_location_id?: number | null
          department_id?: number | null
          designation?: string | null
          full_name: string
          id?: string
          joined_on?: string | null
          left_on?: string | null
          nid: string
          notes?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          contact_no?: string | null
          created_at?: string
          created_by?: string | null
          default_location_id?: number | null
          department_id?: number | null
          designation?: string | null
          full_name?: string
          id?: string
          joined_on?: string | null
          left_on?: string | null
          nid?: string
          notes?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_default_location_id_fkey"
            columns: ["default_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "v_department_summary"
            referencedColumns: ["department_id"]
          },
        ]
      }
      fault_log: {
        Row: {
          action_taken: string | null
          asset_id: string
          cause: string | null
          cost: number
          created_at: string
          created_by: string | null
          date_closed: string | null
          date_reported: string
          description: string
          fault_no: string
          finding_notes: string | null
          holder_employee_id: string | null
          id: number
          remarks: string | null
          reported_by_employee_id: string | null
          reported_by_name: string | null
          responsible_employee_id: string | null
          service_line_id: number | null
          source: string
          status: string
          under_warranty: boolean
          updated_at: string | null
          vendor_id: number | null
        }
        Insert: {
          action_taken?: string | null
          asset_id: string
          cause?: string | null
          cost?: number
          created_at?: string
          created_by?: string | null
          date_closed?: string | null
          date_reported?: string
          description: string
          fault_no?: string
          finding_notes?: string | null
          holder_employee_id?: string | null
          id?: never
          remarks?: string | null
          reported_by_employee_id?: string | null
          reported_by_name?: string | null
          responsible_employee_id?: string | null
          service_line_id?: number | null
          source?: string
          status?: string
          under_warranty?: boolean
          updated_at?: string | null
          vendor_id?: number | null
        }
        Update: {
          action_taken?: string | null
          asset_id?: string
          cause?: string | null
          cost?: number
          created_at?: string
          created_by?: string | null
          date_closed?: string | null
          date_reported?: string
          description?: string
          fault_no?: string
          finding_notes?: string | null
          holder_employee_id?: string | null
          id?: never
          remarks?: string | null
          reported_by_employee_id?: string | null
          reported_by_name?: string | null
          responsible_employee_id?: string | null
          service_line_id?: number | null
          source?: string
          status?: string
          under_warranty?: boolean
          updated_at?: string | null
          vendor_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fault_log_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fault_log_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_employee_holdings"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "fault_log_holder_employee_id_fkey"
            columns: ["holder_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fault_log_holder_employee_id_fkey"
            columns: ["holder_employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_holdings"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "fault_log_reported_by_employee_id_fkey"
            columns: ["reported_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fault_log_reported_by_employee_id_fkey"
            columns: ["reported_by_employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_holdings"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "fault_log_responsible_employee_id_fkey"
            columns: ["responsible_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fault_log_responsible_employee_id_fkey"
            columns: ["responsible_employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_holdings"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "fault_log_service_line_id_fkey"
            columns: ["service_line_id"]
            isOneToOne: false
            referencedRelation: "service_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fault_log_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      handover_forms: {
        Row: {
          created_at: string
          created_by: string | null
          data_backed_up: string | null
          employee_id: string
          form_date: string
          form_no: string
          from_employee_id: string | null
          id: number
          purpose: string
          remarks: string | null
          return_condition: string | null
          signed_copy_path: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data_backed_up?: string | null
          employee_id: string
          form_date?: string
          form_no?: string
          from_employee_id?: string | null
          id?: never
          purpose: string
          remarks?: string | null
          return_condition?: string | null
          signed_copy_path?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data_backed_up?: string | null
          employee_id?: string
          form_date?: string
          form_no?: string
          from_employee_id?: string | null
          id?: never
          purpose?: string
          remarks?: string | null
          return_condition?: string | null
          signed_copy_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "handover_forms_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handover_forms_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_holdings"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "handover_forms_from_employee_id_fkey"
            columns: ["from_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handover_forms_from_employee_id_fkey"
            columns: ["from_employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_holdings"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      locations: {
        Row: {
          id: number
          is_active: boolean
          kind: string
          name: string
        }
        Insert: {
          id?: never
          is_active?: boolean
          kind?: string
          name: string
        }
        Update: {
          id?: never
          is_active?: boolean
          kind?: string
          name?: string
        }
        Relationships: []
      }
      photos: {
        Row: {
          created_at: string
          created_by: string | null
          entity_id: string
          entity_type: string
          id: number
          kind: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_type: string
          id?: never
          kind: string
          storage_path: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_type?: string
          id?: never
          kind?: string
          storage_path?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          employee_id: string | null
          full_name: string
          id: string
          role: string
        }
        Insert: {
          created_at?: string
          employee_id?: string | null
          full_name: string
          id: string
          role: string
        }
        Update: {
          created_at?: string
          employee_id?: string | null
          full_name?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_holdings"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      service_jobs: {
        Row: {
          created_at: string
          created_by: string | null
          id: number
          invoice_no: string | null
          invoice_total: number | null
          job_no: string
          job_type: string
          notes: string | null
          service_date: string
          vendor_id: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: never
          invoice_no?: string | null
          invoice_total?: number | null
          job_no?: string
          job_type: string
          notes?: string | null
          service_date?: string
          vendor_id?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: never
          invoice_no?: string | null
          invoice_total?: number | null
          job_no?: string
          job_type?: string
          notes?: string | null
          service_date?: string
          vendor_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_jobs_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      service_lines: {
        Row: {
          asset_id: string
          cost: number
          id: number
          job_id: number
          next_due_date: string | null
          notes: string | null
          work_done: string
        }
        Insert: {
          asset_id: string
          cost?: number
          id?: never
          job_id: number
          next_due_date?: string | null
          notes?: string | null
          work_done: string
        }
        Update: {
          asset_id?: string
          cost?: number
          id?: never
          job_id?: number
          next_due_date?: string | null
          notes?: string | null
          work_done?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_lines_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_lines_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_employee_holdings"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "service_lines_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "service_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          key: string
          value: Json
        }
        Insert: {
          key: string
          value: Json
        }
        Update: {
          key?: string
          value?: Json
        }
        Relationships: []
      }
      stock_items: {
        Row: {
          id: number
          is_active: boolean
          item_code: string
          location_id: number | null
          name: string
          notes: string | null
          qty_on_hand: number
          reorder_level: number
          unit: string
        }
        Insert: {
          id?: never
          is_active?: boolean
          item_code?: string
          location_id?: number | null
          name: string
          notes?: string | null
          qty_on_hand?: number
          reorder_level?: number
          unit?: string
        }
        Update: {
          id?: never
          is_active?: boolean
          item_code?: string
          location_id?: number | null
          name?: string
          notes?: string | null
          qty_on_hand?: number
          reorder_level?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          change_log_id: number | null
          created_at: string
          created_by: string | null
          department_id: number | null
          employee_id: string | null
          id: number
          movement_date: string
          movement_type: string
          notes: string | null
          qty_change: number
          reference: string | null
          stock_item_id: number
          unit_cost: number | null
          vendor_id: number | null
        }
        Insert: {
          change_log_id?: number | null
          created_at?: string
          created_by?: string | null
          department_id?: number | null
          employee_id?: string | null
          id?: never
          movement_date?: string
          movement_type: string
          notes?: string | null
          qty_change: number
          reference?: string | null
          stock_item_id: number
          unit_cost?: number | null
          vendor_id?: number | null
        }
        Update: {
          change_log_id?: number | null
          created_at?: string
          created_by?: string | null
          department_id?: number | null
          employee_id?: string | null
          id?: never
          movement_date?: string
          movement_type?: string
          notes?: string | null
          qty_change?: number
          reference?: string | null
          stock_item_id?: number
          unit_cost?: number | null
          vendor_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_change_log_id_fkey"
            columns: ["change_log_id"]
            isOneToOne: false
            referencedRelation: "change_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "v_department_summary"
            referencedColumns: ["department_id"]
          },
          {
            foreignKeyName: "stock_movements_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "v_employee_holdings"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "stock_movements_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          contact_person: string | null
          created_at: string
          email: string | null
          id: number
          is_active: boolean
          kind: string
          name: string
          notes: string | null
          phone: string | null
        }
        Insert: {
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: never
          is_active?: boolean
          kind?: string
          name: string
          notes?: string | null
          phone?: string | null
        }
        Update: {
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: never
          is_active?: boolean
          kind?: string
          name?: string
          notes?: string | null
          phone?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      v_asset_costs: {
        Row: {
          asset_id: string | null
          asset_tag: string | null
          basis_source: string | null
          category: string | null
          category_id: number | null
          faults_last_12m: number | null
          flag_faults: boolean | null
          flag_spend: boolean | null
          flagged: boolean | null
          make: string | null
          model: string | null
          no_basis: boolean | null
          repair_spend: number | null
          replacement_basis: number | null
          spend_pct: number | null
          status: string | null
        }
        Relationships: []
      }
      v_category_summary: {
        Row: {
          active_total: number | null
          below_min: boolean | null
          category: string | null
          category_group: string | null
          category_id: number | null
          faulty: number | null
          in_use: number | null
          lost_stolen: number | null
          min_spares: number | null
          spare: number | null
          tag_prefix: string | null
          under_repair: number | null
        }
        Relationships: []
      }
      v_dashboard: {
        Row: {
          active_total: number | null
          categories_below_min: number | null
          due_soon: number | null
          faulty_or_repair: number | null
          flagged_assets: number | null
          in_use: number | null
          in_use_without_holder: number | null
          lost_stolen: number | null
          open_faults: number | null
          open_qr_faults: number | null
          overdue: number | null
          spare_total: number | null
          stock_to_reorder: number | null
        }
        Relationships: []
      }
      v_department_summary: {
        Row: {
          active_total: number | null
          category: string | null
          category_id: number | null
          department: string | null
          department_id: number | null
        }
        Relationships: []
      }
      v_due_soon: {
        Row: {
          asset_id: string | null
          asset_tag: string | null
          category: string | null
          days_left: number | null
          detail: string | null
          due_date: string | null
          kind: string | null
          location: string | null
          make: string | null
          model: string | null
          overdue: boolean | null
        }
        Relationships: []
      }
      v_employee_holdings: {
        Row: {
          accessories: string[] | null
          asset_id: string | null
          asset_tag: string | null
          category: string | null
          condition: string | null
          date_assigned: string | null
          employee_id: string | null
          employee_status: string | null
          full_name: string | null
          location: string | null
          make: string | null
          model: string | null
          serial_number: string | null
        }
        Relationships: []
      }
      v_open_faults: {
        Row: {
          age_days: number | null
          asset_tag: string | null
          category: string | null
          date_reported: string | null
          description: string | null
          fault_id: number | null
          fault_no: string | null
          holder: string | null
          make: string | null
          model: string | null
          source: string | null
          status: string | null
          vendor: string | null
        }
        Relationships: []
      }
      v_spend_monthly: {
        Row: {
          amount: number | null
          department: string | null
          department_id: number | null
          month: string | null
          source: string | null
        }
        Relationships: []
      }
      v_stock_levels: {
        Row: {
          is_active: boolean | null
          item_code: string | null
          name: string | null
          needs_reorder: boolean | null
          qty_on_hand: number | null
          reorder_level: number | null
          stock_item_id: number | null
          unit: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _accessory_names: { Args: { p_ids: number[] }; Returns: string[] }
      _accessory_stock_back: {
        Args: {
          p_accessory_type_id: number
          p_change_log_id: number
          p_date: string
          p_employee_id: string
          p_reference: string
        }
        Returns: undefined
      }
      _accessory_stock_out: {
        Args: {
          p_accessory_type_id: number
          p_change_log_id: number
          p_date: string
          p_department_id: number
          p_employee_id: string
          p_reference: string
        }
        Returns: undefined
      }
      _allow_asset_moves: { Args: never; Returns: string }
      _clean_tag: { Args: { p_tag: string }; Returns: string }
      _end_of_life: {
        Args: {
          p_asset_id: string
          p_date: string
          p_reason: string
          p_to: string
        }
        Returns: undefined
      }
      _int_setting: {
        Args: { p_default: number; p_key: string }
        Returns: number
      }
      _it_store_id: { Args: never; Returns: number }
      _require_admin: { Args: never; Returns: undefined }
      _restore_asset_moves: { Args: { p_previous: string }; Returns: undefined }
      _smallint_array: { Args: { p: Json }; Returns: number[] }
      add_assets: {
        Args: {
          p_category_id: number
          p_fields?: Json
          p_qty: number
          p_serials?: string[]
        }
        Returns: string[]
      }
      back_from_repair: {
        Args: {
          p_asset_id: string
          p_condition: string
          p_date?: string
          p_next_status?: string
          p_reason?: string
        }
        Returns: undefined
      }
      dispose_asset: {
        Args: { p_asset_id: string; p_date?: string; p_reason: string }
        Returns: undefined
      }
      get_public_asset: {
        Args: { p_tag: string }
        Returns: {
          asset_tag: string
          category: string
          make: string
          model: string
        }[]
      }
      import_workbook: { Args: { p_payload: Json }; Returns: Json }
      is_admin: { Args: never; Returns: boolean }
      is_viewer_or_admin: { Args: never; Returns: boolean }
      issue_assets: {
        Args: {
          p_employee_id: string
          p_issue_date?: string
          p_items: Json
          p_location_id?: number
          p_make_form?: boolean
          p_reason?: string
        }
        Returns: string
      }
      move_asset: {
        Args: {
          p_asset_id: string
          p_department_id: number
          p_location_id: number
          p_move_date?: string
          p_reason?: string
        }
        Returns: undefined
      }
      next_asset_tag: { Args: { p_category_id: number }; Returns: string }
      ping: { Args: never; Returns: number }
      record_service_job: {
        Args: { p_header: Json; p_lines: Json }
        Returns: string
      }
      retire_asset: {
        Args: { p_asset_id: string; p_date?: string; p_reason: string }
        Returns: undefined
      }
      return_assets: {
        Args: {
          p_data_backed_up?: string
          p_items: Json
          p_location_id?: number
          p_make_form?: boolean
          p_remarks?: string
          p_return_condition?: string
          p_return_date?: string
        }
        Returns: string
      }
      send_for_repair: {
        Args: {
          p_asset_id: string
          p_date?: string
          p_fault_id?: number
          p_reason?: string
          p_vendor_id?: number
        }
        Returns: undefined
      }
      submit_fault_report: {
        Args: {
          p_description: string
          p_photo_path?: string
          p_reporter_name: string
          p_tag: string
        }
        Returns: string
      }
      swap_asset: {
        Args: {
          p_fault_description?: string
          p_fault_id?: number
          p_faulty_asset_id: string
          p_spare_asset_id: string
          p_swap_date?: string
        }
        Returns: string
      }
      transfer_assets: {
        Args: {
          p_asset_ids: string[]
          p_from_employee_id: string
          p_make_form?: boolean
          p_reason?: string
          p_to_employee_id: string
          p_transfer_date?: string
        }
        Returns: string
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
