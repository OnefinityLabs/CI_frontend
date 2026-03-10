'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import CILogo from '@/components/ui/CILogo'

interface Profile {
  id: string
  email: string
  full_name: string
  role: 'admin' | 'client'
}

function initials(name: string) {
  if (!name) return '?'
  const parts = name.trim().split(' ')
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
      setProfile(data)
    })
  }, [router])

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const isAdmin = profile?.role === 'admin'

  return (
    <>
      <style>{`
        .topbar-btn {
          padding: 7px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          font-family: var(--font-inter), sans-serif;
          transition: all 0.15s;
          white-space: nowrap;
        }
      `}</style>

      <div style={{
        minHeight: '100vh',
        background: '#0a0e1a',
        fontFamily: 'var(--font-inter), sans-serif',
      }}>

        {/* ── Topbar ── */}
        <nav style={{
          height: '58px',
          background: 'rgba(255,255,255,0.03)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 28px',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}>

          {/* Left: logo + wordmark */}
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
            onClick={() => router.push('/')}
          >
            <CILogo size={28} />
            <div>
              <div style={{ fontSize: '13px', fontWeight: '800', color: 'rgba(255,255,255,0.9)', letterSpacing: '-0.2px', lineHeight: 1.2 }}>
                Conversation Intelligence
              </div>
              <div style={{ fontSize: '10px', fontWeight: '500', color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-fira)', letterSpacing: '0.02em' }}>
                multi-agent dashboard
              </div>
            </div>
          </div>

          {/* Right: actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>



            {/* Admin Panel */}
            {isAdmin && (
              <button
                className="topbar-btn"
                onClick={() => router.push('/admin')}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  color: 'rgba(255,255,255,0.75)',
                  border: '1px solid rgba(255,255,255,0.12)',
                }}
                onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff' }}
                onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.75)' }}
              >
                🛡 Admin Panel
              </button>
            )}

            {/* User chip */}
            {profile && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '5px 12px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '50px',
              }}>
                <div style={{
                  width: '26px', height: '26px', borderRadius: '50%',
                  background: 'linear-gradient(135deg, #4B6CF7, #3451c7)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '10px', fontWeight: '800', color: '#fff', flexShrink: 0,
                }}>
                  {initials(profile.full_name || profile.email)}
                </div>
                <span style={{ fontSize: '13px', fontWeight: '700', color: 'rgba(255,255,255,0.8)' }}>
                  {profile.full_name || profile.email}
                </span>
                <span style={{
                  fontSize: '10px', fontWeight: '700',
                  padding: '2px 8px', borderRadius: '50px',
                  background: isAdmin ? 'rgba(75,108,247,0.15)' : 'rgba(255,255,255,0.08)',
                  color: isAdmin ? '#4B6CF7' : 'rgba(255,255,255,0.5)',
                  border: `1px solid ${isAdmin ? 'rgba(75,108,247,0.3)' : 'rgba(255,255,255,0.12)'}`,
                }}>
                  {isAdmin ? '🛡 Admin' : '👤 Client'}
                </span>
              </div>
            )}

            {/* Sign Out */}
            <button
              className="topbar-btn"
              onClick={handleSignOut}
              style={{
                background: 'rgba(244,63,114,0.1)',
                color: '#fda4af',
                border: '1px solid rgba(244,63,114,0.2)',
              }}
              onMouseOver={e => { e.currentTarget.style.background = '#f43f72'; e.currentTarget.style.color = '#fff' }}
              onMouseOut={e => { e.currentTarget.style.background = 'rgba(244,63,114,0.1)'; e.currentTarget.style.color = '#fda4af' }}
            >
              Sign Out
            </button>
          </div>
        </nav>

        {/* ── Page content ── */}
        <main style={{ padding: '36px 32px' }}>
          {children}
        </main>
      </div>
    </>
  )
}