'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import CILogo from '@/components/ui/CILogo'

// Animated canvas background — floating blue particles + connecting lines
function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let W = 0, H = 0

    // Each particle: position, velocity, size, opacity
    type Particle = { x: number; y: number; vx: number; vy: number; r: number; alpha: number }
    const particles: Particle[] = []
    const COUNT = 55

    function resize() {
      W = canvas!.width  = window.innerWidth
      H = canvas!.height = window.innerHeight
    }

    function init() {
      particles.length = 0
      for (let i = 0; i < COUNT; i++) {
        particles.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          r: Math.random() * 2 + 1,
          alpha: Math.random() * 0.5 + 0.15,
        })
      }
    }

    function draw() {
      ctx!.clearRect(0, 0, W, H)

      // Move particles
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        // Wrap around edges
        if (p.x < 0) p.x = W
        if (p.x > W) p.x = 0
        if (p.y < 0) p.y = H
        if (p.y > H) p.y = 0
      }

      // Draw connecting lines between nearby particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          const maxDist = 130
          if (dist < maxDist) {
            const lineAlpha = (1 - dist / maxDist) * 0.12
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.strokeStyle = `rgba(75, 108, 247, ${lineAlpha})`
            ctx.lineWidth = 1
            ctx.stroke()
          }
        }
      }

      // Draw particles
      for (const p of particles) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(75, 108, 247, ${p.alpha})`
        ctx.fill()
      }

      animId = requestAnimationFrame(draw)
    }

    resize()
    init()
    draw()

    window.addEventListener('resize', () => { resize(); init() })
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', () => { resize(); init() })
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  )
}

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode]                   = useState<'signin' | 'signup'>('signin')
  const [email, setEmail]                 = useState('')
  const [password, setPassword]           = useState('')
  const [confirmPassword, setConfirmPass] = useState('')
  const [fullName, setFullName]           = useState('')
  const [error, setError]                 = useState('')
  const [success, setSuccess]             = useState('')
  const [loading, setLoading]             = useState(false)
  const [mounted, setMounted]             = useState(false)

  useEffect(() => {
    setMounted(true)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/')
    })
  }, [router])

  function switchMode(m: 'signin' | 'signup') {
    setMode(m)
    setError('')
    setSuccess('')
    setPassword('')
    setConfirmPass('')
  }

  async function handleSubmit() {
    setError('')
    setSuccess('')
    if (!email || !password) { setError('Please fill in all fields.'); return }
    if (mode === 'signup') {
      if (password !== confirmPassword) { setError('Passwords do not match.'); return }
      if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    }
    setLoading(true)
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
      // Full page reload so the browser sets the Supabase session cookie
      // before the middleware tries to read it. router.replace() is too fast.
      window.location.href = '/'
    } else {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: fullName } },
      })
      if (error) { setError(error.message); setLoading(false); return }
      setSuccess('Check your email to confirm your account.')
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        @keyframes cardIn {
          from { opacity: 0; transform: translateY(24px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .ci-input {
          width: 100%;
          padding: 12px 15px;
          border-radius: 9px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.06);
          font-size: 14px;
          color: #f0eee9;
          outline: none;
          font-family: var(--font-inter), sans-serif;
          transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
        }
        .ci-input:focus {
          border-color: rgba(75,108,247,0.6);
          background: rgba(255,255,255,0.09);
          box-shadow: 0 0 0 3px rgba(75,108,247,0.1);
        }
        .ci-input::placeholder { color: rgba(255,255,255,0.25); }

        .ci-label {
          display: block;
          font-size: 11px;
          font-weight: 700;
          color: rgba(255,255,255,0.45);
          margin-bottom: 7px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-family: var(--font-inter), sans-serif;
        }

        .ci-tab {
          flex: 1;
          padding: 10px 0 12px;
          border: none;
          background: transparent;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          font-family: var(--font-inter), sans-serif;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          transition: color 0.15s, border-color 0.15s;
        }

        .ci-btn {
          width: 100%;
          padding: 13px;
          border-radius: 9px;
          border: none;
          background: #4B6CF7;
          color: #fff;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          font-family: var(--font-inter), sans-serif;
          letter-spacing: 0.02em;
          transition: background 0.15s, transform 0.12s, box-shadow 0.15s;
        }
        .ci-btn:hover:not(:disabled) {
          background: #6b82f8;
          transform: translateY(-2px);
          box-shadow: 0 6px 24px rgba(75,108,247,0.35);
        }
        .ci-btn:active:not(:disabled) { transform: translateY(0); box-shadow: none; }
        .ci-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }

        /* Subtle noise texture overlay on the background */
        .ci-noise {
          position: fixed;
          inset: 0;
          opacity: 0.03;
          pointer-events: none;
          z-index: 1;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
          background-size: 200px 200px;
        }
      `}</style>

      {/* Dark navy background */}
      <div style={{
        minHeight: '100vh',
        background: '#0a0e1a',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
        fontFamily: 'var(--font-inter), sans-serif',
      }}>

        {/* Animated particle canvas */}
        <ParticleBackground />

        {/* Noise texture */}
        <div className="ci-noise" />

        {/* Subtle vignette glow in center */}
        <div style={{
          position: 'fixed',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '800px', height: '600px',
          background: 'radial-gradient(ellipse, rgba(75,108,247,0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 1,
        }} />

        {/* ── Card ── */}
        <div style={{
          position: 'relative',
          zIndex: 10,
          width: '100%',
          maxWidth: '500px',
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '18px',
          border: '1px solid rgba(255,255,255,0.09)',
          padding: '44px 48px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
          animation: mounted ? 'cardIn 0.5s cubic-bezier(0.22,1,0.36,1) both' : 'none',
        }}>

          {/* Top row: logo + wordmark */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            marginBottom: '28px',
            paddingBottom: '24px',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
          }}>
            <CILogo size={56} animate={mounted} />
            <span style={{
              fontSize: '22px',
              fontWeight: '800',
              color: 'rgba(255,255,255,0.75)',
              letterSpacing: '-0.2px',
              fontFamily: 'var(--font-inter), sans-serif',
            }}>
              Conversation Intelligence
            </span>
          </div>

          {/* Big heading — fills card width */}
          <h1 style={{
            fontSize: 'clamp(28px, 5vw, 36px)',
            fontWeight: '800',
            color: '#f0eee9',
            letterSpacing: '-0.8px',
            marginBottom: '8px',
            lineHeight: 1.15,
          }}>
            {mode === 'signin' ? 'Welcome back.' : 'Create account.'}
          </h1>
          <p style={{
            fontSize: '15px',
            color: 'rgba(255,255,255,0.38)',
            marginBottom: '32px',
            lineHeight: 1.5,
          }}>
            {mode === 'signin'
              ? 'Sign in to access your dashboard.'
              : 'Get started with your workspace.'}
          </p>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '24px' }}>
            {(['signin', 'signup'] as const).map(m => (
              <button
                key={m}
                className="ci-tab"
                onClick={() => switchMode(m)}
                style={{
                  color: mode === m ? '#f0eee9' : 'rgba(255,255,255,0.3)',
                  borderBottomColor: mode === m ? '#4B6CF7' : 'transparent',
                }}
              >
                {m === 'signin' ? 'Sign in' : 'Sign up'}
              </button>
            ))}
          </div>

          {/* Fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

            {mode === 'signup' && (
              <div style={{ animation: 'fadeUp 0.2s ease both' }}>
                <label className="ci-label">Full name</label>
                <input className="ci-input" type="text" value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Jane Smith"
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
              </div>
            )}

            <div style={{ animation: 'fadeUp 0.2s ease 0.04s both' }}>
              <label className="ci-label">Email</label>
              <input className="ci-input" type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
            </div>

            <div style={{ animation: 'fadeUp 0.2s ease 0.08s both' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '7px' }}>
                <label className="ci-label" style={{ marginBottom: 0 }}>Password</label>
                {mode === 'signin' && (
                  <button style={{
                    background: 'none', border: 'none', fontSize: '11px',
                    color: 'rgba(75,108,247,0.8)', cursor: 'pointer',
                    fontWeight: '600', fontFamily: 'var(--font-inter), sans-serif', padding: 0,
                  }}>
                    Forgot?
                  </button>
                )}
              </div>
              <input className="ci-input" type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
            </div>

            {mode === 'signup' && (
              <div style={{ animation: 'fadeUp 0.2s ease 0.12s both' }}>
                <label className="ci-label">Confirm password</label>
                <input className="ci-input" type="password" value={confirmPassword}
                  onChange={e => setConfirmPass(e.target.value)}
                  placeholder="••••••••"
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
              </div>
            )}
          </div>

          {/* Error / Success */}
          {error && (
            <div style={{
              marginTop: '14px',
              display: 'flex', alignItems: 'flex-start', gap: '9px',
              background: 'rgba(244,63,114,0.1)',
              border: '1px solid rgba(244,63,114,0.25)',
              borderLeft: '3px solid #f43f72',
              borderRadius: '9px',
              padding: '10px 13px',
              fontSize: '13px',
              color: '#fda4af',
              fontFamily: 'var(--font-inter), sans-serif',
              animation: 'fadeUp 0.18s ease both',
            }}>
              <span style={{ flexShrink: 0 }}>⚠</span> {error}
            </div>
          )}
          {success && (
            <div style={{
              marginTop: '14px',
              display: 'flex', alignItems: 'flex-start', gap: '9px',
              background: 'rgba(45,212,160,0.1)',
              border: '1px solid rgba(45,212,160,0.25)',
              borderLeft: '3px solid #2dd4a0',
              borderRadius: '9px',
              padding: '10px 13px',
              fontSize: '13px',
              color: '#5eead4',
              fontFamily: 'var(--font-inter), sans-serif',
              animation: 'fadeUp 0.18s ease both',
            }}>
              <span style={{ flexShrink: 0 }}>✓</span> {success}
            </div>
          )}

          {/* Submit */}
          <button className="ci-btn" onClick={handleSubmit} disabled={loading}
            style={{ marginTop: '20px' }}>
            {loading
              ? (mode === 'signin' ? 'Signing in…' : 'Creating account…')
              : (mode === 'signin' ? 'Sign in →' : 'Create account →')}
          </button>

          {/* Security note */}
          <p style={{
            marginTop: '14px',
            fontSize: '11px',
            color: 'rgba(255,255,255,0.2)',
            textAlign: 'center',
            fontFamily: 'var(--font-inter), sans-serif',
            letterSpacing: '0.02em',
          }}>
            Secured via Supabase Auth
          </p>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '18px 0 16px' }}>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', fontWeight: '600', letterSpacing: '0.06em', textTransform: 'uppercase' }}>or</span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
          </div>

          {/* Switch mode */}
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.32)', textAlign: 'center', fontFamily: 'var(--font-inter), sans-serif' }}>
            {mode === 'signin'
              ? <>No account?{' '}
                  <button onClick={() => switchMode('signup')} style={{ background: 'none', border: 'none', color: '#4B6CF7', cursor: 'pointer', fontWeight: '700', fontSize: '13px', padding: 0, fontFamily: 'var(--font-inter), sans-serif' }}>
                    Create one →
                  </button>
                </>
              : <>Have an account?{' '}
                  <button onClick={() => switchMode('signin')} style={{ background: 'none', border: 'none', color: '#4B6CF7', cursor: 'pointer', fontWeight: '700', fontSize: '13px', padding: 0, fontFamily: 'var(--font-inter), sans-serif' }}>
                    Sign in →
                  </button>
                </>
            }
          </p>

        </div>
      </div>
    </>
  )
}