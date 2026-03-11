'use client'

import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import CILogo from '@/components/ui/CILogo'
import type { Platform } from '@/types'

interface Profile {
  id: string
  email: string
  full_name: string
  role: 'admin' | 'client'
}

// ── Platform Context ──────────────────────────────────────────
interface PlatformContextValue {
  platform: Platform
  setPlatform: (p: Platform) => void
}

const PlatformContext = createContext<PlatformContextValue>({
  platform: 'elevenlabs',
  setPlatform: () => { },
})

export function usePlatform() {
  return useContext(PlatformContext)
}

// ── Platform config for dropdown ──────────────────────────────
const PLATFORMS: { value: Platform; label: string; icon: string; color: string }[] = [
  { value: 'elevenlabs', label: 'ElevenLabs', icon: '🔊', color: '#4AAFF7' },
  { value: 'vapi', label: 'Vapi', icon: '📞', color: '#22C55E' },
]

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
  const [platform, setPlatform] = useState<Platform>('elevenlabs')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
      setProfile(data)
    })
  }, [router])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const isAdmin = profile?.role === 'admin'
  const currentPlatform = PLATFORMS.find(p => p.value === platform) || PLATFORMS[0]

  return (
    <PlatformContext.Provider value={{ platform, setPlatform }}>
      <style>{`
        .topbar-btn {
          padding: 7px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          font-family: var(--font-nunito), sans-serif;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .platform-dropdown-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          cursor: pointer;
          transition: background 0.1s;
          font-size: 13px;
          font-weight: 600;
          color: rgba(255,255,255,0.8);
          border-radius: 6px;
          margin: 2px 4px;
        }
        .platform-dropdown-item:hover {
          background: rgba(255,255,255,0.1);
          color: #fff;
        }
        .platform-dropdown-item.active {
          background: rgba(74,175,247,0.15);
          color: #4AAFF7;
        }
      `}</style>

      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #091c2e 0%, #0d2137 50%, #091c2e 100%)',
        fontFamily: 'var(--font-nunito), sans-serif',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
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

            {/* ── Platform Selector Dropdown ── */}
            <div ref={dropdownRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  background: 'rgba(255,255,255,0.06)',
                  border: `1px solid ${dropdownOpen ? currentPlatform.color + '60' : 'rgba(255,255,255,0.12)'}`,
                  color: currentPlatform.color,
                  fontSize: '13px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-nunito), sans-serif',
                  transition: 'all 0.15s',
                }}
                onMouseOver={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                  e.currentTarget.style.borderColor = currentPlatform.color + '60'
                }}
                onMouseOut={e => {
                  if (!dropdownOpen) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
                  }
                }}
              >
                <span style={{ fontSize: '15px' }}>{currentPlatform.icon}</span>
                {currentPlatform.label}
                <span style={{
                  fontSize: '10px',
                  transition: 'transform 0.2s',
                  transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  opacity: 0.6,
                }}>▼</span>
              </button>

              {/* Dropdown menu */}
              {dropdownOpen && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0,
                  minWidth: '180px',
                  background: 'rgba(15, 27, 42, 0.98)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '10px',
                  padding: '4px 0',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                  zIndex: 200,
                }}>
                  {PLATFORMS.map(p => (
                    <div
                      key={p.value}
                      className={`platform-dropdown-item ${platform === p.value ? 'active' : ''}`}
                      onClick={() => {
                        setPlatform(p.value)
                        setDropdownOpen(false)
                      }}
                      style={platform === p.value ? { color: p.color, background: p.color + '18' } : {}}
                    >
                      <span style={{ fontSize: '16px' }}>{p.icon}</span>
                      <span>{p.label}</span>
                      {platform === p.value && (
                        <span style={{ marginLeft: 'auto', fontSize: '12px' }}>✓</span>
                      )}
                    </div>
                  ))}
                  <div style={{
                    borderTop: '1px solid rgba(255,255,255,0.08)',
                    margin: '4px 0',
                    padding: '6px 14px',
                    fontSize: '11px',
                    color: 'rgba(255,255,255,0.3)',
                    fontStyle: 'italic',
                  }}>
                    More platforms coming soon…
                  </div>
                </div>
              )}
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
                  background: 'linear-gradient(135deg, #4AAFF7, #1A6FBF)',
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
                  background: isAdmin ? 'rgba(74,175,247,0.15)' : 'rgba(255,255,255,0.08)',
                  color: isAdmin ? '#4AAFF7' : 'rgba(255,255,255,0.5)',
                  border: `1px solid ${isAdmin ? 'rgba(74,175,247,0.3)' : 'rgba(255,255,255,0.12)'}`,
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
                background: 'rgba(247,107,138,0.1)',
                color: '#f9a8bb',
                border: '1px solid rgba(247,107,138,0.2)',
              }}
              onMouseOver={e => { e.currentTarget.style.background = '#f76b8a'; e.currentTarget.style.color = '#fff' }}
              onMouseOut={e => { e.currentTarget.style.background = 'rgba(247,107,138,0.1)'; e.currentTarget.style.color = '#f9a8bb' }}
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
    </PlatformContext.Provider>
  )
}