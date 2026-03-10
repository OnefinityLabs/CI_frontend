'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────
interface Profile { id: string; email: string; full_name: string; role: 'admin' | 'client'; created_at: string }
interface Agent   { id: string; name: string; agent_id: string; emoji: string; api_key: string; image_url: string | null }
interface SubData { tier?: string; status?: string; character_count?: number; character_limit?: number; next_character_count_reset_unix?: number | null }

// ── Helpers ───────────────────────────────────────────────────
const initials = (n: string) => { if (!n) return '?'; const p=n.trim().split(' '); return p.length>=2?(p[0][0]+p[p.length-1][0]).toUpperCase():n.slice(0,2).toUpperCase() }
const fmtN = (n: number) => n>=1_000_000?(n/1_000_000).toFixed(2)+'M':n>=1_000?(n/1_000).toFixed(1)+'K':String(n)
const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})

// ── Sub Card ─────────────────────────────────────────────────
function SubCard({ apiKey, agents, sub, error }: { apiKey: string; agents: Agent[]; sub: SubData | null; error: string | null }) {
  const masked = apiKey.length > 12 ? apiKey.slice(0,6)+'••••••'+apiKey.slice(-4) : '••••••••'

  const cardBorder = error ? 'rgba(244,63,114,0.3)' : 'rgba(255,255,255,0.08)'
  const cardBg     = error ? 'rgba(244,63,114,0.06)' : 'rgba(255,255,255,0.03)'

  if (error) return (
    <div style={{ background:cardBg, border:`1px solid ${cardBorder}`, borderRadius:'14px', overflow:'hidden' }}>
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',padding:'14px 16px 10px' }}>
        <div>
          <div style={{ fontSize:'9px',fontWeight:'800',color:'rgba(255,255,255,0.3)',textTransform:'uppercase',letterSpacing:'.1em',marginBottom:'3px' }}>API Key</div>
          <div style={{ fontFamily:'var(--font-fira)',fontSize:'11px',color:'rgba(255,255,255,0.4)' }}>{masked}</div>
        </div>
        <span style={{ padding:'3px 10px',borderRadius:'50px',fontSize:'10px',fontWeight:'800',background:'rgba(244,63,114,0.1)',color:'#f43f72',border:'1px solid rgba(244,63,114,0.3)' }}>Error</span>
      </div>
      <div style={{ padding:'10px 16px',fontSize:'12px',color:'#fda4af',display:'flex',alignItems:'center',gap:'6px' }}>⚠️ {error}</div>
      <div style={{ padding:'8px 16px 12px',display:'flex',flexWrap:'wrap',gap:'6px',borderTop:'1px solid rgba(255,255,255,0.06)' }}>
        {agents.map(a=><span key={a.id} style={{ display:'inline-flex',alignItems:'center',gap:'4px',padding:'2px 9px',borderRadius:'50px',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)',fontSize:'10px',fontWeight:'700',color:'rgba(255,255,255,0.5)' }}>{a.emoji||'🤖'} {a.name}</span>)}
      </div>
    </div>
  )

  const { tier='unknown', status='—', character_count=0, character_limit=0, next_character_count_reset_unix=null } = sub!
  const usedPct   = character_limit>0 ? Math.min(100,Math.round(character_count/character_limit*100)) : 0
  const remaining = Math.max(0, character_limit-character_count)
  const barColor  = usedPct>=90?'#f43f72':usedPct>=70?'#fb923c':'#818cf8'

  const nowSec   = Math.floor(Date.now()/1000)
  const secsLeft = next_character_count_reset_unix ? Math.max(0,next_character_count_reset_unix-nowSec) : null
  const daysLeft = secsLeft!==null ? Math.ceil(secsLeft/86400) : null
  const resetDate = next_character_count_reset_unix ? new Date(next_character_count_reset_unix*1000).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '—'

  const isUrgent  = daysLeft!==null && daysLeft<=3
  const isWarning = daysLeft!==null && daysLeft<=7 && !isUrgent
  const cdColor   = isUrgent?'#f43f72':isWarning?'#fb923c':'#2dd4a0'
  const cdBg      = isUrgent?'rgba(244,63,114,0.1)':isWarning?'rgba(251,146,60,0.1)':'rgba(45,212,160,0.1)'
  const cdBorder  = isUrgent?'rgba(244,63,114,0.3)':isWarning?'rgba(251,146,60,0.3)':'rgba(45,212,160,0.3)'
  const cdLabel   = daysLeft===null?'—':daysLeft===0?'Today':daysLeft===1?'1 day':`${daysLeft} days`

  const tierColor = ({free:'rgba(255,255,255,0.4)',starter:'#4B6CF7',creator:'#818cf8',pro:'#4B6CF7',scale:'#2dd4a0'} as any)[tier] || '#818cf8'
  const tierBg    = ({free:'rgba(255,255,255,0.05)',starter:'rgba(75,108,247,0.1)',creator:'rgba(129,140,248,0.1)',pro:'rgba(75,108,247,0.1)',scale:'rgba(45,212,160,0.1)'} as any)[tier] || 'rgba(129,140,248,0.1)'

  const borderColor = isUrgent?'rgba(244,63,114,0.3)':isWarning?'rgba(251,146,60,0.3)':'rgba(255,255,255,0.08)'
  const bgColor     = isUrgent?'rgba(244,63,114,0.04)':isWarning?'rgba(251,146,60,0.04)':'rgba(255,255,255,0.03)'

  return (
    <div style={{ background:bgColor,border:`1px solid ${borderColor}`,borderRadius:'14px',overflow:'hidden' }}>
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',padding:'14px 16px 10px' }}>
        <div>
          <div style={{ fontSize:'9px',fontWeight:'800',color:'rgba(255,255,255,0.3)',textTransform:'uppercase',letterSpacing:'.1em',marginBottom:'3px' }}>API Key</div>
          <div style={{ fontFamily:'var(--font-fira)',fontSize:'11px',color:'rgba(255,255,255,0.4)' }}>{masked}</div>
        </div>
        <span style={{ padding:'3px 10px',borderRadius:'50px',fontSize:'10px',fontWeight:'800',background:tierBg,color:tierColor,border:`1px solid ${tierColor}40`,textTransform:'capitalize' }}>{tier}</span>
      </div>

      <div style={{ height:'1px',background:'rgba(255,255,255,0.06)',margin:'0 16px' }}/>

      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',padding:'12px 16px 4px',gap:'8px' }}>
        {[['Used',fmtN(character_count)],['Limit',fmtN(character_limit)],['Remaining',fmtN(remaining)],['Status',status]].map(([l,v])=>(
          <div key={l} style={{ padding:'4px 0' }}>
            <div style={{ fontSize:'9px',fontWeight:'800',color:'rgba(255,255,255,0.3)',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:'3px' }}>{l}</div>
            <div style={{ fontSize:'14px',fontWeight:'900',color:remaining===0&&l==='Remaining'?'rgba(255,255,255,0.3)':'#fff',letterSpacing:'-.02em',textTransform:'capitalize' }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ padding:'6px 16px 12px' }}>
        <div style={{ display:'flex',justifyContent:'space-between',marginBottom:'5px' }}>
          <span style={{ fontSize:'9px',fontWeight:'800',color:'rgba(255,255,255,0.3)',textTransform:'uppercase',letterSpacing:'.08em' }}>Usage</span>
          <span style={{ fontSize:'10px',fontWeight:'800',color:'rgba(255,255,255,0.5)' }}>{usedPct}%</span>
        </div>
        <div style={{ height:'6px',background:'rgba(255,255,255,0.08)',borderRadius:'50px',overflow:'hidden' }}>
          <div style={{ height:'100%',width:`${usedPct}%`,background:barColor,borderRadius:'50px',transition:'width .4s ease' }}/>
        </div>
      </div>

      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 16px',borderTop:'1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display:'flex',alignItems:'center',gap:'7px' }}>
          <span style={{ fontSize:'14px' }}>🔄</span>
          <div>
            <div style={{ fontSize:'11px',fontWeight:'700',color:'rgba(255,255,255,0.6)' }}>Resets {resetDate}</div>
            <div style={{ fontSize:'10px',color:'rgba(255,255,255,0.3)',fontWeight:'600',marginTop:'1px' }}>Characters refill at reset</div>
          </div>
        </div>
        <div style={{ fontSize:'12px',fontWeight:'900',padding:'3px 10px',borderRadius:'50px',border:`1px solid ${cdBorder}`,background:cdBg,color:cdColor }}>{cdLabel}</div>
      </div>

      <div style={{ padding:'8px 16px 12px',display:'flex',flexWrap:'wrap',gap:'6px',borderTop:'1px solid rgba(255,255,255,0.06)' }}>
        {agents.map(a=><span key={a.id} style={{ display:'inline-flex',alignItems:'center',gap:'4px',padding:'2px 9px',borderRadius:'50px',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)',fontSize:'10px',fontWeight:'700',color:'rgba(255,255,255,0.5)' }}>{a.emoji||'🤖'} {a.name}</span>)}
      </div>
    </div>
  )
}

// ── Main Admin Page ───────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter()

  const [users,       setUsers]       = useState<Profile[]>([])
  const [agents,      setAgents]      = useState<Agent[]>([])
  const [accessMap,   setAccessMap]   = useState<Record<string,string[]>>({})
  const [subResults,  setSubResults]  = useState<{apiKey:string;agents:Agent[];sub:SubData|null;error:string|null}[]>([])
  const [subLoading,  setSubLoading]  = useState(true)
  const [loading,     setLoading]     = useState(true)
  const [toast,       setToast]       = useState('')
  const [toastVis,    setToastVis]    = useState(false)

  // Modals
  const [inviteOpen,  setInviteOpen]  = useState(false)
  const [roleOpen,    setRoleOpen]    = useState(false)
  const [assignOpen,  setAssignOpen]  = useState(false)

  // Invite form
  const [invEmail,    setInvEmail]    = useState('')
  const [invRole,     setInvRole]     = useState<'client'|'admin'>('client')
  const [invErr,      setInvErr]      = useState('')
  const [invOk,       setInvOk]       = useState('')
  const [invSaving,   setInvSaving]   = useState(false)

  // Role edit
  const [editUserId,  setEditUserId]  = useState('')
  const [roleEmail,   setRoleEmail]   = useState('')
  const [roleVal,     setRoleVal]     = useState<'client'|'admin'>('client')
  const [roleErr,     setRoleErr]     = useState('')
  const [roleSaving,  setRoleSaving]  = useState(false)

  // Assign
  const [assignUserId,   setAssignUserId]   = useState('')
  const [assignEmail,    setAssignEmail]    = useState('')
  const [assignChecked,  setAssignChecked]  = useState<Set<string>>(new Set())
  const [assignErr,      setAssignErr]      = useState('')
  const [assignSaving,   setAssignSaving]   = useState(false)

  // ── Auth guard ────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
      if (profile?.role !== 'admin') { router.replace('/'); return }
      loadAll()
    })
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key==='Escape') closeAll() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── Data loading ──────────────────────────────────────────
  async function loadAll() {
    setLoading(true)
    const [usersRes, agentsRes, accessRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at'),
      supabase.from('agents').select('*').order('created_at'),
      supabase.from('agent_access').select('user_id, agent_id'),
    ])
    const u = usersRes.data  || []
    const a = agentsRes.data || []
    const ac = accessRes.data || []
    const amap: Record<string,string[]> = {}
    for (const row of ac) {
      if (!amap[row.user_id]) amap[row.user_id] = []
      amap[row.user_id].push(row.agent_id)
    }
    setUsers(u); setAgents(a); setAccessMap(amap)
    setLoading(false)
    loadSubscriptions(a)
  }

  async function loadSubscriptions(agentList?: Agent[]) {
    const list = agentList || agents
    setSubLoading(true)
    const groups: Record<string,Agent[]> = {}
    for (const ag of list) {
      const key = ag.api_key
      if (!key) continue
      if (!groups[key]) groups[key] = []
      groups[key].push(ag)
    }
    const keys = Object.keys(groups)
    if (!keys.length) { setSubResults([]); setSubLoading(false); return }
    const results = await Promise.all(keys.map(async key => {
      try {
        const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': key } })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const sub = await res.json()
        return { apiKey: key, agents: groups[key], sub, error: null }
      } catch (err: any) {
        return { apiKey: key, agents: groups[key], sub: null, error: err.message }
      }
    }))
    setSubResults(results); setSubLoading(false)
  }

  // ── Toast ─────────────────────────────────────────────────
  function showToast(msg: string) {
    setToast(msg); setToastVis(true)
    setTimeout(() => setToastVis(false), 2800)
  }

  function closeAll() {
    setInviteOpen(false); setRoleOpen(false); setAssignOpen(false)
    setInvErr(''); setInvOk(''); setRoleErr(''); setAssignErr('')
  }

  // ── Invite ────────────────────────────────────────────────
  async function inviteUser() {
    if (!invEmail.trim()) { setInvErr('Please enter an email'); return }
    setInvSaving(true); setInvErr('')
    try {
      const { error } = await supabase.from('pending_invites').insert({ email: invEmail.trim(), role: invRole })
      if (error) throw new Error(error.message)
      setInvOk(`✓ Invite recorded for ${invEmail}`)
      setTimeout(() => { closeAll(); showToast(`Invite sent to ${invEmail}`) }, 1800)
      await loadAll()
    } catch (err: any) { setInvErr(err.message) }
    finally { setInvSaving(false) }
  }

  // ── Role ─────────────────────────────────────────────────
  async function saveRole() {
    setRoleSaving(true); setRoleErr('')
    const { error } = await supabase.from('profiles').update({ role: roleVal }).eq('id', editUserId)
    if (error) { setRoleErr(error.message); setRoleSaving(false); return }
    closeAll(); showToast('Role updated ✓'); await loadAll()
    setRoleSaving(false)
  }

  // ── Assign ────────────────────────────────────────────────
  async function openAssignModal(userId: string, email: string) {
    setAssignUserId(userId); setAssignEmail(email); setAssignErr('')
    setAssignChecked(new Set(accessMap[userId] || []))
    setAssignOpen(true)
  }

  async function saveAssign() {
    setAssignSaving(true); setAssignErr('')
    await supabase.from('agent_access').delete().eq('user_id', assignUserId)
    if (assignChecked.size > 0) {
      const rows = [...assignChecked].map(agent_id => ({ user_id: assignUserId, agent_id }))
      const { error } = await supabase.from('agent_access').insert(rows)
      if (error) { setAssignErr(error.message); setAssignSaving(false); return }
    }
    closeAll(); showToast('Agent access updated ✓'); await loadAll()
    setAssignSaving(false)
  }

  // ── Delete user ───────────────────────────────────────────
  async function deleteUser(id: string) {
    if (!confirm('Remove this user? They will lose access to the dashboard.')) return
    await supabase.from('agent_access').delete().eq('user_id', id)
    await supabase.from('profiles').delete().eq('id', id)
    showToast('User removed'); await loadAll()
  }

  const clients = users.filter(u => u.role === 'client')

  // ── Shared styles ─────────────────────────────────────────
  const sectionStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '18px',
    marginBottom: '22px',
    overflow: 'hidden',
  }
  const sectionHdStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)',
  }
  const thStyle: React.CSSProperties = {
    padding: '11px 20px', textAlign: 'left', fontSize: '10px', fontWeight: 800,
    color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '.08em',
    borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)',
  }
  const tdStyle: React.CSSProperties = {
    padding: '13px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)',
    fontSize: '13px', fontWeight: 600, verticalAlign: 'middle', color: 'rgba(255,255,255,0.8)',
  }

  function ActBtn({ label, type, onClick }: { label: string; type: 'edit'|'danger'|'assign'|'mint'; onClick: () => void }) {
    const colors = {
      edit:   { bg:'rgba(129,140,248,0.1)', color:'#818cf8', border:'rgba(129,140,248,0.3)', hover:'#818cf8' },
      danger: { bg:'rgba(244,63,114,0.1)', color:'#f43f72', border:'rgba(244,63,114,0.3)', hover:'#f43f72' },
      assign: { bg:'rgba(45,212,160,0.1)',  color:'#2dd4a0', border:'rgba(45,212,160,0.3)',  hover:'#2dd4a0' },
      mint:   { bg:'rgba(75,108,247,0.1)',  color:'#4B6CF7', border:'rgba(75,108,247,0.3)',  hover:'#4B6CF7' },
    }[type]
    return (
      <button onClick={onClick} style={{ padding:'5px 12px',borderRadius:'50px',fontSize:'11px',fontWeight:'700',cursor:'pointer',border:`1px solid ${colors.border}`,background:colors.bg,color:colors.color,fontFamily:'var(--font-inter), sans-serif',transition:'all .15s' }}
        onMouseOver={e=>{e.currentTarget.style.background=colors.hover;e.currentTarget.style.color='#fff'}}
        onMouseOut={e=>{e.currentTarget.style.background=colors.bg;e.currentTarget.style.color=colors.color}}>
        {label}
      </button>
    )
  }

  const inputStyle: React.CSSProperties = {
    width:'100%', padding:'11px 14px', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)',
    borderRadius:'10px', color:'rgba(255,255,255,0.9)', fontFamily:'var(--font-inter), sans-serif',
    fontSize:'14px', fontWeight:'600', outline:'none', boxSizing:'border-box',
  }
  const labelStyle: React.CSSProperties = {
    display:'block', fontSize:'10px', fontWeight:'800', color:'rgba(255,255,255,0.4)',
    textTransform:'uppercase', letterSpacing:'.08em', marginBottom:'7px',
  }

  return (
    <>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        @keyframes modalIn{from{opacity:0;transform:scale(.93) translateY(10px)}to{opacity:1;transform:none}}
        .tbl-row:hover td{background:rgba(255,255,255,0.02)!important;}
        .check-item-dark{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);cursor:pointer;transition:all .15s;user-select:none;}
        .check-item-dark:hover{border-color:rgba(75,108,247,0.3);background:rgba(75,108,247,0.06);}
        .check-item-dark.checked{border-color:rgba(75,108,247,0.4);background:rgba(75,108,247,0.1);}
        select option{background:#0f1524;color:#fff;}
      `}</style>

      {/* Page header */}
      <div style={{ marginBottom:'28px', animation:'fadeUp .3s ease' }}>
        <h1 style={{ fontSize:'22px',fontWeight:'900',color:'#fff',letterSpacing:'-.04em',marginBottom:'5px' }}>
          Admin <span style={{ color:'#818cf8' }}>Panel</span>
        </h1>
        <p style={{ fontSize:'13px',color:'rgba(255,255,255,0.35)',fontWeight:'500' }}>Manage users, roles, and agent access</p>
      </div>

      {/* ── SUBSCRIPTIONS ── */}
      <div style={sectionStyle}>
        <div style={sectionHdStyle}>
          <div>
            <div style={{ fontSize:'13px',fontWeight:'900',color:'#fff' }}>📊 ElevenLabs Subscriptions</div>
            <div style={{ fontSize:'11px',color:'rgba(255,255,255,0.35)',marginTop:'2px' }}>Character usage and reset dates, grouped by API key</div>
          </div>
          <button onClick={()=>loadSubscriptions()} style={{ display:'flex',alignItems:'center',gap:'6px',padding:'8px 18px',background:'rgba(45,212,160,0.15)',border:'1px solid rgba(45,212,160,0.3)',borderRadius:'50px',color:'#2dd4a0',fontFamily:'var(--font-inter), sans-serif',fontWeight:'800',fontSize:'12px',cursor:'pointer',transition:'all .15s' }}
            onMouseOver={e=>{e.currentTarget.style.background='#2dd4a0';e.currentTarget.style.color='#fff'}} onMouseOut={e=>{e.currentTarget.style.background='rgba(45,212,160,0.15)';e.currentTarget.style.color='#2dd4a0'}}>
            🔄 Refresh
          </button>
        </div>
        <div style={{ padding:'20px 24px' }}>
          {subLoading ? (
            <div style={{ textAlign:'center',padding:'32px',color:'rgba(255,255,255,0.25)',fontSize:'13px' }}>Loading subscriptions…</div>
          ) : subResults.length === 0 ? (
            <div style={{ textAlign:'center',padding:'32px',color:'rgba(255,255,255,0.25)',fontSize:'13px' }}>🔑 No API keys found on agents.</div>
          ) : (
            <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(290px,1fr))',gap:'16px' }}>
              {subResults.map(r=><SubCard key={r.apiKey} apiKey={r.apiKey} agents={r.agents} sub={r.sub} error={r.error}/>)}
            </div>
          )}
        </div>
      </div>

      {/* ── USERS ── */}
      <div style={sectionStyle}>
        <div style={sectionHdStyle}>
          <div>
            <div style={{ fontSize:'13px',fontWeight:'900',color:'#fff' }}>👥 Users</div>
            <div style={{ fontSize:'11px',color:'rgba(255,255,255,0.35)',marginTop:'2px' }}>All registered users and their roles</div>
          </div>
          <button onClick={()=>{ setInvEmail(''); setInvRole('client'); setInvErr(''); setInvOk(''); setInviteOpen(true) }}
            style={{ display:'flex',alignItems:'center',gap:'6px',padding:'8px 18px',background:'linear-gradient(135deg,#4B6CF7,#818cf8)',border:'none',borderRadius:'50px',color:'#fff',fontFamily:'var(--font-inter), sans-serif',fontWeight:'800',fontSize:'12px',cursor:'pointer',transition:'all .15s',boxShadow:'0 2px 8px rgba(129,140,248,.3)' }}>
            ✉️ Invite User
          </button>
        </div>
        {loading ? (
          <div style={{ textAlign:'center',padding:'32px',color:'rgba(255,255,255,0.25)',fontSize:'13px' }}>Loading users…</div>
        ) : users.length === 0 ? (
          <div style={{ textAlign:'center',padding:'48px',color:'rgba(255,255,255,0.25)',fontSize:'13px' }}>👥<br/>No users yet</div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%',borderCollapse:'collapse' }}>
              <thead>
                <tr><th style={thStyle}>User</th><th style={thStyle}>Email</th><th style={thStyle}>Role</th><th style={thStyle}>Joined</th><th style={thStyle}>Actions</th></tr>
              </thead>
              <tbody>
                {users.map(u=>(
                  <tr key={u.id} className="tbl-row">
                    <td style={tdStyle}>
                      <div style={{ display:'flex',alignItems:'center',gap:'9px' }}>
                        <div style={{ width:'30px',height:'30px',borderRadius:'50%',background:'linear-gradient(135deg,rgba(75,108,247,0.3),rgba(129,140,248,0.3))',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11px',fontWeight:'800',color:'#818cf8',flexShrink:0 }}>{initials(u.full_name||u.email)}</div>
                        <span style={{ fontWeight:'700' }}>{u.full_name||'—'}</span>
                      </div>
                    </td>
                    <td style={{ ...tdStyle,fontFamily:'var(--font-fira)',fontSize:'11px',color:'rgba(255,255,255,0.5)' }}>{u.email}</td>
                    <td style={tdStyle}>
                      <span style={{ display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 10px',borderRadius:'50px',fontSize:'10px',fontWeight:'800',border:'1px solid',background:u.role==='admin'?'rgba(129,140,248,0.1)':'rgba(75,108,247,0.1)',color:u.role==='admin'?'#818cf8':'#4B6CF7',borderColor:u.role==='admin'?'rgba(129,140,248,0.3)':'rgba(75,108,247,0.3)' }}>
                        {u.role==='admin'?'🛡️ Admin':'👤 Client'}
                      </span>
                    </td>
                    <td style={{ ...tdStyle,color:'rgba(255,255,255,0.35)',fontSize:'12px' }}>{fmtDate(u.created_at)}</td>
                    <td style={tdStyle}>
                      <div style={{ display:'flex',gap:'6px',alignItems:'center' }}>
                        <ActBtn label="Edit Role" type="edit" onClick={()=>{ setEditUserId(u.id); setRoleEmail(u.email); setRoleVal(u.role); setRoleErr(''); setRoleOpen(true) }}/>
                        {u.role==='client'&&<ActBtn label="Assign Agents" type="assign" onClick={()=>openAssignModal(u.id,u.email)}/>}
                        {/* Can't delete yourself */}
                        <ActBtn label="Remove" type="danger" onClick={()=>deleteUser(u.id)}/>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── AGENT ACCESS ── */}
      <div style={sectionStyle}>
        <div style={sectionHdStyle}>
          <div>
            <div style={{ fontSize:'13px',fontWeight:'900',color:'#fff' }}>🤖 Agent Access</div>
            <div style={{ fontSize:'11px',color:'rgba(255,255,255,0.35)',marginTop:'2px' }}>Control which clients can see which agents</div>
          </div>
        </div>
        {loading ? (
          <div style={{ textAlign:'center',padding:'32px',color:'rgba(255,255,255,0.25)',fontSize:'13px' }}>Loading…</div>
        ) : clients.length === 0 ? (
          <div style={{ textAlign:'center',padding:'48px',color:'rgba(255,255,255,0.25)',fontSize:'13px' }}>👤<br/>No client users yet. Invite clients to assign agents.</div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%',borderCollapse:'collapse' }}>
              <thead>
                <tr><th style={thStyle}>Client</th><th style={thStyle}>Assigned Agents</th><th style={thStyle}>Actions</th></tr>
              </thead>
              <tbody>
                {clients.map(u=>{
                  const assigned = accessMap[u.id] || []
                  return (
                    <tr key={u.id} className="tbl-row">
                      <td style={tdStyle}>
                        <div style={{ display:'flex',alignItems:'center',gap:'9px' }}>
                          <div style={{ width:'28px',height:'28px',borderRadius:'50%',background:'rgba(75,108,247,0.15)',border:'1px solid rgba(75,108,247,0.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'10px',fontWeight:'800',color:'#4B6CF7',flexShrink:0 }}>{initials(u.full_name||u.email)}</div>
                          <div>
                            <div style={{ fontWeight:'700',fontSize:'13px' }}>{u.full_name||u.email}</div>
                            <div style={{ fontFamily:'var(--font-fira)',fontSize:'10px',color:'rgba(255,255,255,0.3)' }}>{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={tdStyle}>
                        {assigned.length === 0 ? (
                          <span style={{ color:'rgba(255,255,255,0.25)',fontSize:'12px' }}>No agents assigned</span>
                        ) : (
                          <div style={{ display:'flex',flexWrap:'wrap',gap:'5px' }}>
                            {assigned.map(aid=>{ const ag=agents.find(a=>a.id===aid); return ag ? <span key={aid} style={{ display:'inline-flex',alignItems:'center',gap:'4px',padding:'2px 9px',borderRadius:'50px',background:'rgba(129,140,248,0.1)',color:'#818cf8',border:'1px solid rgba(129,140,248,0.3)',fontSize:'10px',fontWeight:'700' }}>{ag.emoji||'🤖'} {ag.name}</span> : null })}
                          </div>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <ActBtn label="Manage Access" type="assign" onClick={()=>openAssignModal(u.id,u.email)}/>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── INVITE MODAL ── */}
      {inviteOpen && (
        <div onClick={closeAll} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',backdropFilter:'blur(6px)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px' }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'#0f1524',border:'1px solid rgba(255,255,255,0.1)',borderRadius:'22px',padding:'30px 28px',width:'100%',maxWidth:'440px',boxShadow:'0 24px 64px rgba(0,0,0,0.5)',animation:'modalIn .22s cubic-bezier(.34,1.56,.64,1) both' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'24px' }}>
              <div style={{ fontSize:'17px',fontWeight:'900',color:'#fff' }}>✉️ Invite User</div>
              <button onClick={closeAll} style={{ width:'30px',height:'30px',borderRadius:'50%',border:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.05)',cursor:'pointer',fontSize:'13px',color:'rgba(255,255,255,0.5)',display:'flex',alignItems:'center',justifyContent:'center' }}>✕</button>
            </div>
            <div style={{ marginBottom:'16px' }}>
              <label style={labelStyle}>Email</label>
              <input style={inputStyle} type="email" value={invEmail} onChange={e=>setInvEmail(e.target.value)} placeholder="user@company.com"
                onFocus={e=>e.target.style.borderColor='#4B6CF7'} onBlur={e=>e.target.style.borderColor='rgba(255,255,255,0.1)'}/>
            </div>
            <div style={{ marginBottom:'16px' }}>
              <label style={labelStyle}>Role</label>
              <select style={{ ...inputStyle, cursor:'pointer' }} value={invRole} onChange={e=>setInvRole(e.target.value as any)}>
                <option value="client">👤 Client — view assigned agents only</option>
                <option value="admin">🛡️ Admin — full access</option>
              </select>
            </div>
            {invErr&&<div style={{ padding:'9px 12px',background:'rgba(244,63,114,0.1)',border:'1px solid rgba(244,63,114,0.2)',borderRadius:'8px',fontSize:'12px',color:'#fda4af',marginBottom:'14px' }}>{invErr}</div>}
            {invOk &&<div style={{ padding:'9px 12px',background:'rgba(45,212,160,0.1)',border:'1px solid rgba(45,212,160,0.2)',borderRadius:'8px',fontSize:'12px',color:'#2dd4a0',marginBottom:'14px' }}>{invOk}</div>}
            <div style={{ display:'flex',gap:'10px' }}>
              <button onClick={closeAll} style={{ flex:1,padding:'11px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:'10px',color:'rgba(255,255,255,0.6)',fontFamily:'var(--font-inter), sans-serif',fontWeight:'700',fontSize:'13px',cursor:'pointer' }}>Cancel</button>
              <button onClick={inviteUser} disabled={invSaving} style={{ flex:2,padding:'11px',background:'linear-gradient(135deg,#4B6CF7,#818cf8)',border:'none',borderRadius:'10px',color:'#fff',fontFamily:'var(--font-inter), sans-serif',fontWeight:'800',fontSize:'13px',cursor:invSaving?'not-allowed':'pointer',opacity:invSaving?.7:1 }}>
                {invSaving?'Sending…':'Send Invite ✉️'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ROLE MODAL ── */}
      {roleOpen && (
        <div onClick={closeAll} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',backdropFilter:'blur(6px)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px' }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'#0f1524',border:'1px solid rgba(255,255,255,0.1)',borderRadius:'22px',padding:'30px 28px',width:'100%',maxWidth:'440px',boxShadow:'0 24px 64px rgba(0,0,0,0.5)',animation:'modalIn .22s cubic-bezier(.34,1.56,.64,1) both' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'24px' }}>
              <div style={{ fontSize:'17px',fontWeight:'900',color:'#fff' }}>✏️ Edit User Role</div>
              <button onClick={closeAll} style={{ width:'30px',height:'30px',borderRadius:'50%',border:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.05)',cursor:'pointer',fontSize:'13px',color:'rgba(255,255,255,0.5)',display:'flex',alignItems:'center',justifyContent:'center' }}>✕</button>
            </div>
            <div style={{ marginBottom:'16px' }}>
              <label style={labelStyle}>User</label>
              <input style={{ ...inputStyle,opacity:.6,cursor:'default' }} readOnly value={roleEmail}/>
            </div>
            <div style={{ marginBottom:'16px' }}>
              <label style={labelStyle}>Role</label>
              <select style={{ ...inputStyle,cursor:'pointer' }} value={roleVal} onChange={e=>setRoleVal(e.target.value as any)}>
                <option value="client">👤 Client — view assigned agents only</option>
                <option value="admin">🛡️ Admin — full access</option>
              </select>
            </div>
            {roleErr&&<div style={{ padding:'9px 12px',background:'rgba(244,63,114,0.1)',border:'1px solid rgba(244,63,114,0.2)',borderRadius:'8px',fontSize:'12px',color:'#fda4af',marginBottom:'14px' }}>{roleErr}</div>}
            <div style={{ display:'flex',gap:'10px' }}>
              <button onClick={closeAll} style={{ flex:1,padding:'11px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:'10px',color:'rgba(255,255,255,0.6)',fontFamily:'var(--font-inter), sans-serif',fontWeight:'700',fontSize:'13px',cursor:'pointer' }}>Cancel</button>
              <button onClick={saveRole} disabled={roleSaving} style={{ flex:2,padding:'11px',background:'linear-gradient(135deg,#4B6CF7,#818cf8)',border:'none',borderRadius:'10px',color:'#fff',fontFamily:'var(--font-inter), sans-serif',fontWeight:'800',fontSize:'13px',cursor:roleSaving?'not-allowed':'pointer',opacity:roleSaving?.7:1 }}>
                {roleSaving?'Saving…':'Save Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ASSIGN MODAL ── */}
      {assignOpen && (
        <div onClick={closeAll} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',backdropFilter:'blur(6px)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px' }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'#0f1524',border:'1px solid rgba(255,255,255,0.1)',borderRadius:'22px',padding:'30px 28px',width:'100%',maxWidth:'440px',boxShadow:'0 24px 64px rgba(0,0,0,0.5)',animation:'modalIn .22s cubic-bezier(.34,1.56,.64,1) both' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'24px' }}>
              <div style={{ fontSize:'17px',fontWeight:'900',color:'#fff' }}>🤖 Assign Agents</div>
              <button onClick={closeAll} style={{ width:'30px',height:'30px',borderRadius:'50%',border:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.05)',cursor:'pointer',fontSize:'13px',color:'rgba(255,255,255,0.5)',display:'flex',alignItems:'center',justifyContent:'center' }}>✕</button>
            </div>
            <div style={{ marginBottom:'16px' }}>
              <label style={labelStyle}>User</label>
              <input style={{ ...inputStyle,opacity:.6,cursor:'default' }} readOnly value={assignEmail}/>
            </div>
            <div style={{ marginBottom:'16px' }}>
              <label style={labelStyle}>Agents — select which ones this user can access</label>
              {agents.length === 0 ? (
                <div style={{ color:'rgba(255,255,255,0.3)',fontSize:'13px',padding:'8px' }}>No agents added yet.</div>
              ) : (
                <div style={{ display:'flex',flexDirection:'column',gap:'7px',maxHeight:'240px',overflowY:'auto' }}>
                  {agents.map(ag=>{
                    const checked = assignChecked.has(ag.id)
                    return (
                      <div key={ag.id} className={`check-item-dark${checked?' checked':''}`}
                        onClick={()=>{ const s=new Set(assignChecked); checked?s.delete(ag.id):s.add(ag.id); setAssignChecked(s) }}>
                        <div style={{ width:'16px',height:'16px',borderRadius:'4px',border:`2px solid ${checked?'#4B6CF7':'rgba(255,255,255,0.2)'}`,background:checked?'#4B6CF7':'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all .12s' }}>
                          {checked&&<span style={{ color:'#fff',fontSize:'9px',lineHeight:1 }}>✓</span>}
                        </div>
                        <span style={{ fontSize:'16px' }}>{ag.emoji||'🤖'}</span>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:'13px',fontWeight:'700',color:'rgba(255,255,255,0.85)' }}>{ag.name}</div>
                          <div style={{ fontFamily:'var(--font-fira)',fontSize:'10px',color:'rgba(255,255,255,0.3)' }}>{ag.agent_id||'—'}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            {assignErr&&<div style={{ padding:'9px 12px',background:'rgba(244,63,114,0.1)',border:'1px solid rgba(244,63,114,0.2)',borderRadius:'8px',fontSize:'12px',color:'#fda4af',marginBottom:'14px' }}>{assignErr}</div>}
            <div style={{ display:'flex',gap:'10px' }}>
              <button onClick={closeAll} style={{ flex:1,padding:'11px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:'10px',color:'rgba(255,255,255,0.6)',fontFamily:'var(--font-inter), sans-serif',fontWeight:'700',fontSize:'13px',cursor:'pointer' }}>Cancel</button>
              <button onClick={saveAssign} disabled={assignSaving} style={{ flex:2,padding:'11px',background:'linear-gradient(135deg,#4B6CF7,#818cf8)',border:'none',borderRadius:'10px',color:'#fff',fontFamily:'var(--font-inter), sans-serif',fontWeight:'800',fontSize:'13px',cursor:assignSaving?'not-allowed':'pointer',opacity:assignSaving?.7:1 }}>
                {assignSaving?'Saving…':'Save Access'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      <div style={{ position:'fixed',bottom:'28px',left:'50%',transform:`translateX(-50%) translateY(${toastVis?'0':'80px'})`,background:'rgba(255,255,255,0.1)',backdropFilter:'blur(12px)',border:'1px solid rgba(255,255,255,0.15)',color:'#fff',padding:'11px 22px',borderRadius:'50px',fontSize:'13px',fontWeight:'700',boxShadow:'0 8px 32px rgba(0,0,0,0.4)',transition:'transform .3s cubic-bezier(.34,1.56,.64,1)',zIndex:999,pointerEvents:'none',whiteSpace:'nowrap' }}>
        {toast}
      </div>
    </>
  )
}