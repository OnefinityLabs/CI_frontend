'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import CILogo from '@/components/ui/CILogo'
import type { Agent, AgentColor } from '@/types'

// ── Helpers ──────────────────────────────────────────────────
function fmtDate(ts: string) {
  if (!ts) return 'recently'
  const d = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
  if (d === 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 7) return `${d} days ago`
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// Maps your AgentColor to a visible accent on dark backgrounds
const ACCENT: Record<AgentColor, string> = {
  peach: '#ff8c6b',
  lav:   '#9b7ff4',
  mint:  '#34c98e',
  sky:   '#4aaff7',
  rose:  '#f76b8a',
  amber: '#f5a623',
}

// ── Stat pill ────────────────────────────────────────────────
function AgentStatPill({ agentDbId }: { agentDbId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['agent-stats', agentDbId],
    queryFn: async () => {
      const { apiRequest } = await import('@/lib/api')
      const res = await apiRequest<{ data: { totalCached: number; lastSyncedAt: string | null } }>(
        `/api/agents/${agentDbId}/stats`
      )
      return res.data
    },
    staleTime: 1000 * 60 * 5,
    retry: 1,
  })

  const pillStyle = {
    fontSize: '11px', fontWeight: '600',
    borderRadius: '50px', padding: '3px 10px',
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.05)',
    color: 'rgba(255,255,255,0.45)',
  }

  if (isLoading) return <span style={pillStyle}>Loading stats…</span>
  if (isError)   return <span style={pillStyle}>Backend offline</span>

  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      <span style={{ ...pillStyle, background: 'rgba(74,175,247,0.1)', color: '#4AAFF7', border: '1px solid rgba(74,175,247,0.2)' }}>
        💬 {data?.totalCached ?? 0} cached
      </span>
      <span style={pillStyle}>
        {data?.lastSyncedAt ? `Synced ${fmtDate(data.lastSyncedAt)}` : 'Never synced'}
      </span>
    </div>
  )
}

// ── Add/Edit Modal ───────────────────────────────────────────
const COLORS: AgentColor[] = ['lav', 'peach', 'mint', 'sky', 'rose', 'amber']
const EMOJIS = ['🤖', '🎙️', '💬', '🧠', '⚙️', '🏭', '📋', '🌐', '🔬', '📞']

function AgentModal({ onClose, editAgent }: { onClose: () => void; editAgent: Agent | null }) {
  const qc = useQueryClient()
  const [name, setName]           = useState(editAgent?.name || '')
  const [agentId, setAgentId]     = useState(editAgent?.agent_id || '')
  const [apiKey, setApiKey]       = useState(editAgent?.api_key || '')
  const [color, setColor]         = useState<AgentColor>(editAgent?.color || 'lav')
  const [emoji, setEmoji]         = useState(editAgent?.emoji || '🤖')
  const [avatarTab, setAvatarTab] = useState<'icon' | 'image'>(editAgent?.image_url ? 'image' : 'icon')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string>(editAgent?.image_url || '')
  const [error, setError]         = useState('')
  const [saving, setSaving]       = useState(false)

  function handleFile(file: File) {
    if (file.size > 2 * 1024 * 1024) { setError('Image must be under 2 MB'); return }
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = e => setImagePreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function uploadImage(id: string, file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const { error } = await supabase.storage.from('agent-avatars').upload(`${id}/avatar.${ext}`, file, { upsert: true, contentType: file.type })
    if (error) throw new Error('Upload failed: ' + error.message)
    const { data } = supabase.storage.from('agent-avatars').getPublicUrl(`${id}/avatar.${ext}`)
    return data.publicUrl + `?t=${Date.now()}`
  }

  async function handleSave() {
    if (!name.trim()) { setError('Please enter a name'); return }
    setSaving(true); setError('')
    try {
      let imgUrl: string | null = avatarTab === 'image'
        ? (imageFile ? '__PENDING__' : (editAgent?.image_url || null))
        : null

      if (editAgent) {
        if (imageFile) imgUrl = await uploadImage(editAgent.id, imageFile)
        const { error } = await supabase.from('agents').update({ name: name.trim(), agent_id: agentId.trim(), api_key: apiKey.trim(), emoji, color, image_url: imgUrl }).eq('id', editAgent.id)
        if (error) throw new Error(error.message)
      } else {
        const { data: ins, error } = await supabase.from('agents')
          .insert({ name: name.trim(), agent_id: agentId.trim(), api_key: apiKey.trim(), emoji, color, image_url: null })
          .select('id').single()
        if (error) throw new Error(error.message)
        if (imageFile) {
          const url = await uploadImage(ins.id, imageFile)
          await supabase.from('agents').update({ image_url: url }).eq('id', ins.id)
        }
      }
      await qc.invalidateQueries({ queryKey: ['agents'] })
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <style>{`
        .m-input {
          width: 100%; padding: 11px 14px; border-radius: 9px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.05);
          font-size: 14px; color: rgba(255,255,255,0.9);
          outline: none; font-family: var(--font-nunito), sans-serif;
          transition: border-color 0.15s, box-shadow 0.15s;
          box-sizing: border-box;
        }
        .m-input:focus { border-color: #4AAFF7; box-shadow: 0 0 0 3px rgba(74,175,247,0.12); }
        .m-input::placeholder { color: rgba(255,255,255,0.2); }
        .m-label {
          display: block; font-size: 11px; font-weight: 700;
          color: rgba(255,255,255,0.4); margin-bottom: 7px;
          text-transform: uppercase; letter-spacing: 0.08em;
          font-family: var(--font-nunito), sans-serif;
        }
      `}</style>

      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
        <div onClick={e => e.stopPropagation()} style={{
          background: '#0d2137',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '18px',
          padding: '32px 28px',
          width: '100%', maxWidth: '460px',
          maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#fff', letterSpacing: '-0.3px' }}>
              {editAgent ? '✏️ Edit Agent' : '✨ Add New Agent'}
            </h2>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>✕</button>
          </div>

          {/* Fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
            <div>
              <label className="m-label">Agent Name</label>
              <input className="m-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Indoo HR Bot, Sales Agent…" />
            </div>
            <div>
              <label className="m-label">Agent ID</label>
              <input className="m-input" value={agentId} onChange={e => setAgentId(e.target.value)} placeholder="agent_xxxxxxxxxxxxxxxx" style={{ fontFamily: 'var(--font-fira)', fontSize: '13px' }} />
            </div>
            <div>
              <label className="m-label">API Key</label>
              <input className="m-input" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-…" style={{ fontFamily: 'var(--font-fira)', fontSize: '13px' }} />
            </div>
          </div>

          <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)', marginBottom: '20px' }} />

          {/* Avatar */}
          <div style={{ marginBottom: '20px' }}>
            <label className="m-label">Agent Avatar</label>
            <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', overflow: 'hidden', marginBottom: '14px' }}>
              {(['icon', 'image'] as const).map(t => (
                <button key={t} onClick={() => setAvatarTab(t)} style={{
                  flex: 1, padding: '9px 0', border: 'none', cursor: 'pointer',
                  fontSize: '12px', fontWeight: '700', fontFamily: 'var(--font-nunito), sans-serif',
                  background: avatarTab === t ? '#4AAFF7' : 'transparent',
                  color: avatarTab === t ? '#fff' : 'rgba(255,255,255,0.4)',
                  transition: 'all 0.15s',
                }}>
                  {t === 'icon' ? '🎭 Icon' : '🖼️ Upload Photo'}
                </button>
              ))}
            </div>

            {avatarTab === 'icon' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {EMOJIS.map(e => (
                  <button key={e} onClick={() => setEmoji(e)} style={{
                    width: '42px', height: '42px', borderRadius: '9px', cursor: 'pointer',
                    border: `2px solid ${emoji === e ? '#4AAFF7' : 'rgba(255,255,255,0.1)'}`,
                    background: emoji === e ? 'rgba(74,175,247,0.15)' : 'rgba(255,255,255,0.04)',
                    fontSize: '18px', transition: 'all 0.12s',
                  }}>{e}</button>
                ))}
              </div>
            )}

            {avatarTab === 'image' && (
              <div>
                <label style={{
                  display: 'block', border: '2px dashed rgba(255,255,255,0.12)', borderRadius: '12px',
                  padding: '20px', textAlign: 'center', cursor: 'pointer', background: 'rgba(255,255,255,0.03)',
                }}>
                  <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }}
                    onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
                  {imagePreview ? (
                    <div>
                      <img src={imagePreview} alt="preview" style={{ width: '72px', height: '72px', borderRadius: '12px', objectFit: 'cover', margin: '0 auto 8px', display: 'block' }} />
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>Click to change</div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: '28px', marginBottom: '6px', opacity: 0.3 }}>📸</div>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', fontWeight: '600' }}>
                        Drop an image or <span style={{ color: '#4AAFF7' }}>browse</span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', marginTop: '3px' }}>PNG, JPG, WEBP · max 2 MB</div>
                    </div>
                  )}
                </label>
                {imagePreview && (
                  <button onClick={() => { setImageFile(null); setImagePreview('') }} style={{
                    marginTop: '8px', padding: '4px 12px', borderRadius: '50px',
                    background: 'rgba(247,107,138,0.12)', color: '#f9a8bb',
                    border: '1px solid rgba(247,107,138,0.2)',
                    fontSize: '11px', fontWeight: '700', cursor: 'pointer', fontFamily: 'var(--font-nunito), sans-serif',
                  }}>✕ Remove image</button>
                )}
              </div>
            )}
          </div>

          {/* Color picker */}
          <div style={{ marginBottom: '24px' }}>
            <label className="m-label">Card Colour</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              {COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)} style={{
                  width: '28px', height: '28px', borderRadius: '50%', cursor: 'pointer',
                  background: ACCENT[c],
                  border: `3px solid ${color === c ? '#fff' : 'transparent'}`,
                  outline: color === c ? `2px solid ${ACCENT[c]}` : 'none',
                  outlineOffset: '2px',
                  transition: 'border-color 0.12s',
                }} />
              ))}
            </div>
          </div>

          {error && (
            <div style={{ marginBottom: '16px', padding: '10px 13px', background: 'rgba(247,107,138,0.1)', border: '1px solid rgba(247,107,138,0.2)', borderRadius: '8px', fontSize: '13px', color: '#f9a8bb' }}>
              ⚠ {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={onClose} style={{
              flex: 1, padding: '12px', borderRadius: '9px', cursor: 'pointer',
              border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)',
              fontSize: '14px', fontWeight: '700', color: 'rgba(255,255,255,0.6)',
              fontFamily: 'var(--font-nunito), sans-serif',
            }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{
              flex: 2, padding: '12px', borderRadius: '9px', border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
              background: saving ? 'rgba(74,175,247,0.4)' : '#4AAFF7',
              color: '#fff', fontSize: '14px', fontWeight: '700',
              fontFamily: 'var(--font-nunito), sans-serif',
              transition: 'background 0.15s',
            }}>
              {saving ? 'Saving…' : (editAgent ? 'Save Changes' : 'Add Agent ✨')}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function AgentsPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editAgent, setEditAgent] = useState<Agent | null>(null)
  const [menuOpen, setMenuOpen]   = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
      if (!profile) throw new Error('No profile')
      if (profile.role === 'admin') {
        const { data: agents } = await supabase.from('agents').select('*').order('created_at')
        return { agents: (agents || []) as Agent[], role: profile.role as 'admin' | 'client' }
      } else {
        const { data: access } = await supabase.from('agent_access').select('agents(*)').eq('user_id', profile.id)
        return { agents: ((access || []).map((r: any) => r.agents).filter(Boolean)) as Agent[], role: 'client' as const }
      }
    },
  })

  const agents  = data?.agents || []
  const isAdmin = data?.role === 'admin'

  useEffect(() => {
    const handler = () => { setEditAgent(null); setModalOpen(true) }
    window.addEventListener('open-add-agent', handler)
    return () => window.removeEventListener('open-add-agent', handler)
  }, [])

  useEffect(() => {
    const handler = () => setMenuOpen(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  async function handleRemove(id: string) {
    if (!confirm('Remove this agent?')) return
    await supabase.storage.from('agent-avatars').remove([`${id}/avatar.jpg`, `${id}/avatar.png`, `${id}/avatar.webp`])
    await supabase.from('agent_access').delete().eq('agent_id', id)
    await supabase.from('agents').delete().eq('id', id)
    qc.invalidateQueries({ queryKey: ['agents'] })
  }

  if (isLoading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '16px' }}>
      <CILogo size={44} animate />
      <div style={{ fontSize: '13px', fontWeight: '600', color: 'rgba(255,255,255,0.4)' }}>Loading your agents…</div>
    </div>
  )

  if (error) return (
    <div style={{ textAlign: 'center', padding: '60px', color: '#f9a8bb', fontSize: '14px' }}>
      Failed to load agents. Please refresh.
    </div>
  )

  return (
    <>
      <style>{`
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .agent-card { transition: transform 0.18s, box-shadow 0.18s; }
        .agent-card:hover { transform: translateY(-3px); box-shadow: 0 12px 40px rgba(0,0,0,0.35) !important; }
        .agent-card:hover .open-btn { opacity: 1 !important; }
        .add-card:hover { border-color: #4AAFF7 !important; background: rgba(74,175,247,0.06) !important; }
      `}</style>

      {/* Section header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#fff', letterSpacing: '-0.5px', marginBottom: '5px' }}>
            Your <span style={{ color: '#4AAFF7' }}>Agents</span>
          </h1>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.38)', fontWeight: '500' }}>
            {isAdmin
              ? 'Click any card to open its full analytics & chat dashboard'
              : 'Agents assigned to you — click any card to open its dashboard'}
          </p>
        </div>
        <div style={{
          fontSize: '12px', fontWeight: '700', color: '#4AAFF7',
          background: 'rgba(74,175,247,0.1)', border: '1px solid rgba(74,175,247,0.2)',
          borderRadius: '50px', padding: '5px 16px',
        }}>
          {agents.length} agent{agents.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Client notice */}
      {!isAdmin && (
        <div style={{
          background: 'rgba(74,175,247,0.08)', border: '1px solid rgba(74,175,247,0.18)',
          borderRadius: '12px', padding: '12px 18px', marginBottom: '24px',
          display: 'flex', alignItems: 'center', gap: '10px',
          fontSize: '13px', fontWeight: '600', color: '#4AAFF7',
        }}>
          ℹ️ You're viewing as a <strong>Client</strong>. Contact your admin to get access to more agents.
        </div>
      )}

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>

        {agents.map((ag, i) => {
          const accent = ACCENT[ag.color || 'lav']
          return (
            <div
              key={ag.id}
              className="agent-card"
              onClick={() => router.push(`/dashboard/${ag.id}`)}
              style={{
                background: 'rgba(255,255,255,0.04)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderTop: `2px solid ${accent}`,
                borderRadius: '14px',
                padding: '22px',
                cursor: 'pointer',
                position: 'relative',
                animation: `cardIn 0.4s ease ${i * 60}ms both`,
              }}
            >
              {/* Top: avatar + menu */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div style={{
                  width: '56px', height: '56px', borderRadius: '14px',
                  background: ag.image_url ? 'transparent' : `rgba(${accent === '#4aaff7' ? '74,175,247' : '155,127,244'},0.15)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '26px', overflow: 'hidden', flexShrink: 0,
                  border: `1px solid rgba(255,255,255,0.08)`,
                }}>
                  {ag.image_url
                    ? <img src={ag.image_url} alt={ag.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : ag.emoji || '🤖'}
                </div>

                {isAdmin && (
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === ag.id ? null : ag.id) }}
                      style={{
                        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '7px', width: '30px', height: '30px', cursor: 'pointer',
                        fontSize: '16px', color: 'rgba(255,255,255,0.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >⋯</button>
                    {menuOpen === ag.id && (
                      <div style={{
                        position: 'absolute', right: 0, top: '36px',
                        background: '#0d2137', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                        zIndex: 50, minWidth: '140px', overflow: 'hidden',
                      }}>
                        {[
                          { label: '✏️ Edit', action: () => { setEditAgent(ag); setModalOpen(true); setMenuOpen(null) }, color: 'rgba(255,255,255,0.8)' },
                          { label: '🗑 Remove', action: () => { handleRemove(ag.id); setMenuOpen(null) }, color: '#f9a8bb' },
                        ].map(item => (
                          <button key={item.label}
                            onClick={e => { e.stopPropagation(); item.action() }}
                            style={{
                              width: '100%', padding: '10px 14px', border: 'none',
                              background: 'transparent', textAlign: 'left',
                              fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                              color: item.color, fontFamily: 'var(--font-nunito), sans-serif',
                              transition: 'background 0.12s',
                            }}
                            onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                          >{item.label}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Name + ID */}
              <div style={{ fontSize: '17px', fontWeight: '800', color: '#fff', marginBottom: '4px', letterSpacing: '-0.2px' }}>
                {ag.name}
              </div>
              <div style={{ fontSize: '11px', fontWeight: '500', color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-fira)', marginBottom: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ag.agent_id || 'No agent ID'}
              </div>

              {/* Stats */}
              <div style={{ marginBottom: '18px' }}>
                <AgentStatPill agentDbId={ag.id} />
              </div>

              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', fontWeight: '500' }}>
                  Added {fmtDate(ag.created_at)}
                </span>
                <button
                  className="open-btn"
                  onClick={e => { e.stopPropagation(); router.push(`/dashboard/${ag.id}`) }}
                  style={{
                    padding: '6px 14px', borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.7)', fontSize: '12px',
                    fontWeight: '700', cursor: 'pointer',
                    fontFamily: 'var(--font-nunito), sans-serif',
                    opacity: 0.7, transition: 'opacity 0.15s, background 0.15s',
                  }}
                  onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#fff' }}
                  onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
                >
                  Open →
                </button>
              </div>
            </div>
          )
        })}

        {/* Add New Agent card */}
        {isAdmin && (
          <div
            className="add-card"
            onClick={() => { setEditAgent(null); setModalOpen(true) }}
            style={{
              border: '2px dashed rgba(255,255,255,0.12)', borderRadius: '14px',
              padding: '22px', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: '12px', minHeight: '200px',
              transition: 'border-color 0.15s, background 0.15s',
              animation: `cardIn 0.4s ease ${agents.length * 60}ms both`,
            }}
          >
            <div style={{
              width: '48px', height: '48px', borderRadius: '50%',
              background: 'rgba(74,175,247,0.1)', border: '1px solid rgba(74,175,247,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '22px', color: '#4AAFF7',
            }}>+</div>
            <div style={{ fontSize: '15px', fontWeight: '800', color: 'rgba(255,255,255,0.8)', textAlign: 'center' }}>
              Add New Agent
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', textAlign: 'center', lineHeight: 1.6 }}>
              Connect an ElevenLabs<br />Conversational AI agent
            </div>
          </div>
        )}
      </div>

      {modalOpen && (
        <AgentModal onClose={() => { setModalOpen(false); setEditAgent(null) }} editAgent={editAgent} />
      )}
    </>
  )
}