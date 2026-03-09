// src/hooks/useAgents.ts
// Custom hook that fetches the agent list from Supabase.
// Mirrors the loadAgents() logic from the old HTML file exactly:
//   - admin → all agents
//   - client → only agents in agent_access table for this user
//
// useQuery is TanStack Query's main hook. You give it:
//   - queryKey: a cache label (like a variable name for this data)
//   - queryFn: the async function that actually fetches
// It returns { data, isLoading, error } automatically.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Agent } from '@/types'

// Fetch the current user's profile from Supabase profiles table
async function fetchProfile() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single()

  if (error) throw new Error(error.message)
  return data
}

// Fetch agents based on role — same logic as old loadAgents()
async function fetchAgents() {
  const profile = await fetchProfile()

  if (profile.role === 'admin') {
    // Admins see all agents
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .order('created_at')
    if (error) throw new Error(error.message)
    return { agents: (data || []) as Agent[], role: profile.role as 'admin' | 'client', profile }
  } else {
    // Clients see only agents assigned to them via agent_access
    const { data, error } = await supabase
      .from('agent_access')
      .select('agents(*)')
      .eq('user_id', profile.id)
    if (error) throw new Error(error.message)
    const agents = (data || []).map((r: any) => r.agents).filter(Boolean) as Agent[]
    return { agents, role: profile.role as 'admin' | 'client', profile }
  }
}

// Fetch stats for a single agent from your backend
// Returns { totalCached, lastSyncedAt }
export async function fetchAgentStats(agentDbId: string) {
  const { apiRequest } = await import('@/lib/api')
  const data = await apiRequest<{ data: { totalCached: number; lastSyncedAt: string | null } }>(
    `/api/agents/${agentDbId}/stats`
  )
  return data.data
}

// ── The hook you'll actually call in components ──
export function useAgents() {
  return useQuery({
    queryKey: ['agents'],           // cache key — any component using this key shares data
    queryFn: fetchAgents,
    staleTime: 1000 * 60 * 2,      // treat data as fresh for 2 min (don't refetch on every click)
  })
}

// Separate hook for a single agent's stats
// queryKey includes the ID so each agent gets its own cache slot
export function useAgentStats(agentDbId: string) {
  return useQuery({
    queryKey: ['agent-stats', agentDbId],
    queryFn: () => fetchAgentStats(agentDbId),
    staleTime: 1000 * 60 * 5,
    retry: 1,
  })
}