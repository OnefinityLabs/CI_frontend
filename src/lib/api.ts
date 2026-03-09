// src/lib/api.ts
import { supabase } from '@/lib/supabase'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL!
const API_SECRET  = process.env.NEXT_PUBLIC_API_SECRET!

export async function apiRequest<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  // Ask Supabase: "is anyone logged in right now, and if so, what's their token?"
  // getSession() returns the current auth session — null if not logged in
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token ?? null

  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-secret': API_SECRET,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })

  const data = await res.json()

  if (!res.ok || !data.success) {
    throw new Error(data?.error?.message || `Request failed: ${res.status}`)
  }

  return data
}