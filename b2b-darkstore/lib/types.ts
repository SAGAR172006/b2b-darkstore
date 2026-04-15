export type BinStatus = 'ok' | 'ghosting_suspected'
export type PickerStatus = 'idle' | 'picking'

export interface Bin {
  id: string
  label: string
  aisle_id: string
  x: number
  y: number
  status: BinStatus
  last_audit: string | null
}

export interface Picker {
  id: string
  name: string
  current_aisle: string | null
  status: PickerStatus
}

export interface Task {
  id: string
  picker_id: string
  bin_id: string
  sku_name: string
  assigned_at: string
  completed_at: string | null
}

export interface AgentResponse {
  status: 'ASSIGNED' | 'RE_ROUTE' | 'GHOSTING_FLAGGED' | 'ERROR'
  message: string
  task?: Task
  alternative_bin?: Bin
}

export interface LogEntry {
  id: string
  timestamp: string
  message: string
  level: 'info' | 'warn' | 'alert'
}

export interface Database {
  public: {
    Tables: {
      bins: {
        Row: Bin
        Insert: Omit<Bin, 'id'> & { id?: string }
        Update: Partial<Bin>
      }
      pickers: {
        Row: Picker
        Insert: Omit<Picker, 'id'> & { id?: string }
        Update: Partial<Picker>
      }
      tasks: {
        Row: Task
        Insert: Omit<Task, 'id'> & { id?: string }
        Update: Partial<Task>
      }
    }
    // YOU MUST INCLUDE THESE THREE KEYS TO PREVENT 'NEVER' ERRORS
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
  }
}