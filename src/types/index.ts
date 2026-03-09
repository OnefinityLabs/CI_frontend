// ── User ─────────────────────────────────────────────────────
export interface User {
  id: string
  email: string
  full_name: string
  role: 'admin' | 'client'
  created_at: string
}

// ── Agent ────────────────────────────────────────────────────
export type AgentColor = 'peach' | 'lav' | 'mint' | 'sky' | 'rose' | 'amber'

export interface Agent {
  id: string
  name: string
  agent_id: string
  api_key?: string
  emoji: string
  color: AgentColor
  image_url?: string
  created_by?: string
  created_at: string
  last_synced_at?: string
}

// ── Conversation ─────────────────────────────────────────────
export interface TranscriptMessage {
  role: 'user' | 'agent'
  message: string
  time_in_call_secs?: number
}

export interface Conversation {
  conversation_id: string
  agent_db_id: string
  agent_el_id?: string
  status: 'done' | 'failed' | 'processing' | 'in-progress'
  start_time_unix: number
  duration_secs: number
  user_name?: string
  transcript: TranscriptMessage[]
  metadata?: Record<string, unknown>
  transcript_summary?: string
  primary_question?: string
  kb_question_list?: string[]
  non_kb_question_list?: string[]
  cost?: number
  llm_cost?: number
  synced_at: string
}

// ── API Responses ────────────────────────────────────────────
export interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
}

export interface PaginatedResponse<T> extends ApiResponse<T> {
  total: number
  limit: number
  offset: number
}