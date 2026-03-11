'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import CILogo from '@/components/ui/CILogo'

// ── Types ─────────────────────────────────────────────────────
interface TranscriptTurn { role: 'user' | 'agent'; message?: string; text?: string; time_in_call_secs?: number }
interface Conversation {
  conversation_id: string; start_time_unix: number | null; duration_secs: number | null
  status: string; transcript: TranscriptTurn[] | null; metadata: any
  user_name: string | null; transcript_summary: string | null
  kb_question_list: string[] | string | null; non_kb_question_list: string[] | string | null
  primary_question: string | null; llm_cost: number | null; cost: number | null
  end_reason?: string | null; success_evaluation?: boolean | null
  cost_breakdown?: any; recording_url?: string | null
}
interface Agent { id: string; name: string; agent_id: string; api_key: string; emoji: string; color: string; image_url: string | null; platform?: string }

// ── Helpers ───────────────────────────────────────────────────
const fmtDur = (s: number | null) => { if (!s) return '—'; if (s < 60) return s + 's'; return `${Math.floor(s / 60)}m ${s % 60}s` }
const fmtTime = (u: number | null) => u ? new Date(u * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'
const fmtDate = (u: number | null) => u ? new Date(u * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const daySort = (u: number | null) => u ? new Date(u * 1000).toISOString().slice(0, 10) : '0000-00-00'
const initials = (n: string) => { if (!n || n === 'Unknown User') return '?'; const p = n.trim().split(' '); return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : n.slice(0, 2).toUpperCase() }
const stColor = (s: string) => ({ done: '#34c98e', failed: '#f76b8a', processing: '#f5a623' }[s] || '#4aaff7')

function dayLabel(u: number | null) {
  if (!u) return 'Unknown Date'
  const d = new Date(u * 1000), t = new Date(), y = new Date(); y.setDate(t.getDate() - 1)
  if (d.toDateString() === t.toDateString()) return '🌟 Today'
  if (d.toDateString() === y.toDateString()) return '🌙 Yesterday'
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long' })
}
function dayLabelShort(u: number | null) {
  if (!u) return '?'
  const d = new Date(u * 1000), t = new Date(), y = new Date(); y.setDate(t.getDate() - 1)
  if (d.toDateString() === t.toDateString()) return 'Today'
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
function rowToTranscript(row: Conversation): TranscriptTurn[] {
  if (!row?.transcript) return []
  return Array.isArray(row.transcript) ? row.transcript : []
}
function rowToTokens(row: Conversation) {
  if (!row?.metadata) return null
  try {
    const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
    const irrevModel = Object.values((meta?.charging?.llm_usage?.irreversible_generation?.model_usage) || {})[0] as any || {}
    const input = irrevModel?.input?.tokens || 0
    const output = irrevModel?.output_total?.tokens || 0
    if (!input && !output) return null
    return { input, output, total: input + output }
  } catch { return null }
}
function extractUserName(row: Conversation): string | null {
  if (row.user_name) return row.user_name
  if (row.metadata) {
    try {
      const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
      const dv = meta?.conversation_initiation_client_data?.dynamic_variables
      if (dv?.user_name) return dv.user_name
      if (dv) for (const k of Object.keys(dv)) {
        if (k.toLowerCase().includes('name') || k.toLowerCase().includes('user')) {
          const v = dv[k]; if (v && typeof v === 'string' && v.length < 40) return v
        }
      }
    } catch { }
  }
  const tr = rowToTranscript(row)
  for (const t of tr.slice(0, 20)) {
    if (t.role === 'agent' && t.message) {
      const m = t.message.match(/\b(?:hey|hello|hi)\s+([A-Z][a-z]{1,30})\b/i)
      if (m) return m[1]
    }
  }
  return null
}
const fmtTokens = (n: number) => { if (!n && n !== 0) return '—'; if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'; if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'; return String(n) }
const fmtList = (v: any) => { if (!v) return ''; if (Array.isArray(v)) return v.join('; '); if (typeof v === 'string') return v; try { return JSON.parse(v).join('; ') } catch { return String(v) } }

function buildUserMap(convs: Conversation[]) {
  const userMap: Record<string, Conversation[]> = {}
  const userLatest: Record<string, number> = {}
  for (const row of convs) {
    const name = extractUserName(row) || 'Unknown User'
    if (!userMap[name]) userMap[name] = []
    userMap[name].push(row)
    const t = row.start_time_unix || 0
    if (!userLatest[name] || t > userLatest[name]) userLatest[name] = t
  }
  return { userMap, userLatest }
}

function syncLabel(lastSyncedAt: string | null) {
  if (!lastSyncedAt) return { text: 'Never synced', color: '#f76b8a' }
  const mins = Math.floor((Date.now() - new Date(lastSyncedAt).getTime()) / 60000)
  const color = mins > 60 ? '#f5a623' : '#34c98e'
  const text = mins < 1 ? 'Synced just now' : mins < 60 ? `Synced ${mins}m ago` : `Synced ${Math.floor(mins / 60)}h ago`
  return { text, color }
}

// ── Chart component (Canvas-based, no lib needed) ────────────
function CallsChart({ convs, range, onRangeChange }: { convs: Conversation[]; range: number | 'all' | 'custom'; onRangeChange: (r: any) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [customFrom, setCustomFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10) })
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().slice(0, 10))

  function getFiltered() {
    if (range === 'all') return convs
    const now = Math.floor(Date.now() / 1000)
    if (typeof range === 'number') return convs.filter(r => (r.start_time_unix || 0) >= now - (range * 86400))
    if (range === 'custom') {
      const f = Math.floor(new Date(customFrom).getTime() / 1000), t = Math.floor(new Date(customTo + 'T23:59:59').getTime() / 1000)
      return convs.filter(r => { const u = r.start_time_unix; return u != null && u >= f && u <= t })
    }
    return convs
  }

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const filtered = getFiltered()
    const buckets: Record<string, { lbl: string; n: number; durSum: number; durCount: number }> = {}
    for (const row of filtered) {
      const u = row.start_time_unix
      const sk = u ? new Date(u * 1000).toISOString().slice(0, 10) : '0000'
      const lb = u ? new Date(u * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '?'
      if (!buckets[sk]) buckets[sk] = { lbl: lb, n: 0, durSum: 0, durCount: 0 }
      buckets[sk].n++
      if (row.duration_secs) { buckets[sk].durSum += row.duration_secs; buckets[sk].durCount++ }
    }
    const keys = Object.keys(buckets).sort()
    const labels = keys.map(k => buckets[k].lbl)
    const counts = keys.map(k => buckets[k].n)
    const avgDurs = keys.map(k => buckets[k].durCount ? Math.round(buckets[k].durSum / buckets[k].durCount) : 0)

    const dpr = window.devicePixelRatio || 1
    const W = canvas.parentElement!.clientWidth
    const H = 220
    canvas.width = W * dpr; canvas.height = H * dpr
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, W, H)

    if (!keys.length) {
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.font = '600 13px Nunito,sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('No data for this range', W / 2, H / 2); return
    }

    const PAD = { top: 16, right: 48, bottom: 36, left: 36 }
    const cW = W - PAD.left - PAD.right, cH = H - PAD.top - PAD.bottom
    const maxN = Math.max(...counts, 1), maxD = Math.max(...avgDurs, 1)
    const xStep = cW / (keys.length - 1 || 1)

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = PAD.top + cH * (1 - i / 4)
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke()
    }

    // Avg Duration fill+line (peach)
    ctx.beginPath()
    avgDurs.forEach((v, i) => { const x = PAD.left + i * xStep, y = PAD.top + cH * (1 - v / maxD); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y) })
    ctx.strokeStyle = '#ff8c6b'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([])
    ctx.lineTo(PAD.left + (keys.length - 1) * xStep, PAD.top + cH); ctx.lineTo(PAD.left, PAD.top + cH); ctx.closePath()
    ctx.fillStyle = 'rgba(255,140,107,0.06)'; ctx.fill()

    // Sessions fill+line (lav)
    ctx.beginPath()
    counts.forEach((v, i) => { const x = PAD.left + i * xStep, y = PAD.top + cH * (1 - v / maxN); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y) })
    ctx.strokeStyle = '#9b7ff4'; ctx.lineWidth = 2.5; ctx.stroke()
    ctx.lineTo(PAD.left + (keys.length - 1) * xStep, PAD.top + cH); ctx.lineTo(PAD.left, PAD.top + cH); ctx.closePath()
    ctx.fillStyle = 'rgba(155,127,244,0.1)'; ctx.fill()

    // Points
    counts.forEach((v, i) => {
      const x = PAD.left + i * xStep, y = PAD.top + cH * (1 - v / maxN)
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fillStyle = '#9b7ff4'; ctx.fill()
    })

    // X labels (show max 7)
    const step = Math.max(1, Math.ceil(keys.length / 7))
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '600 10px Nunito,sans-serif'; ctx.textAlign = 'center'
    labels.forEach((l, i) => { if (i % step === 0) { const x = PAD.left + i * xStep; ctx.fillText(l, x, H - 6) } })

    // Y labels left (sessions)
    ctx.fillStyle = 'rgba(155,127,244,0.7)'; ctx.font = '600 10px Nunito,sans-serif'; ctx.textAlign = 'right'
    for (let i = 0; i <= 4; i++) { const v = Math.round(maxN * i / 4); ctx.fillText(String(v), PAD.left - 5, PAD.top + cH * (1 - i / 4) + 4) }

    // Y labels right (duration)
    ctx.fillStyle = 'rgba(255,140,107,0.7)'; ctx.textAlign = 'left'
    for (let i = 0; i <= 4; i++) { const v = Math.round(maxD * i / 4); ctx.fillText(v + 's', W - PAD.right + 5, PAD.top + cH * (1 - i / 4) + 4) }

  }, [convs, range, customFrom, customTo])

  const RANGES = [{ v: 7, l: '7d' }, { v: 30, l: '30d' }, { v: 90, l: '90d' }, { v: 'all', l: 'All' }, { v: 'custom', l: 'Custom' }]

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '22px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: '800', color: '#fff', marginBottom: '3px' }}>Calls over time</div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontWeight: '500' }}>Sessions & avg duration per day</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'rgba(155,127,244,0.8)', fontWeight: '600' }}><span style={{ width: '10px', height: '2px', background: '#9b7ff4', display: 'inline-block', borderRadius: '2px' }} />Sessions</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'rgba(255,140,107,0.8)', fontWeight: '600' }}><span style={{ width: '10px', height: '0', borderTop: '2px dashed #ff8c6b', display: 'inline-block' }} />Avg Duration</span>
          </div>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {RANGES.map(r => (
              <button key={r.v} onClick={() => onRangeChange(r.v)} style={{
                padding: '4px 11px', borderRadius: '50px', border: '1px solid',
                fontSize: '11px', fontWeight: '700', cursor: 'pointer',
                fontFamily: 'var(--font-nunito),sans-serif',
                background: range === r.v ? '#4AAFF7' : 'transparent',
                color: range === r.v ? '#fff' : 'rgba(255,255,255,0.45)',
                borderColor: range === r.v ? '#4AAFF7' : 'rgba(255,255,255,0.15)',
                transition: 'all .15s',
              }}>{r.l}</button>
            ))}
          </div>
          {range === 'custom' && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                style={{ padding: '4px 8px', borderRadius: '7px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.8)', fontSize: '11px', fontFamily: 'var(--font-nunito),sans-serif', outline: 'none' }} />
              <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px' }}>→</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                style={{ padding: '4px 8px', borderRadius: '7px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.8)', fontSize: '11px', fontFamily: 'var(--font-nunito),sans-serif', outline: 'none' }} />
            </div>
          )}
        </div>
      </div>
      <div style={{ position: 'relative', width: '100%' }}>
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%' }} />
      </div>
    </div>
  )
}

// ── Export Modal ──────────────────────────────────────────────
function ExportModal({ convs, onClose }: { convs: Conversation[]; onClose: () => void }) {
  const [range, setRange] = useState<'week' | 'month' | 'custom'>('week')
  const [fromDate, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10) })
  const [toDate, setTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [fields, setFields] = useState({ name: true, date: true, summary: true, duration: true, cost: true, endReason: true, kb: true, nonkb: true, chat: false })

  function getBounds() {
    const now = new Date()
    if (range === 'week') { const f = new Date(now); f.setDate(now.getDate() - 7); return { f: Math.floor(f.getTime() / 1000), t: Math.floor(now.getTime() / 1000) } }
    if (range === 'month') { const f = new Date(now); f.setDate(now.getDate() - 30); return { f: Math.floor(f.getTime() / 1000), t: Math.floor(now.getTime() / 1000) } }
    return { f: Math.floor(new Date(fromDate).getTime() / 1000), t: Math.floor(new Date(toDate + 'T23:59:59').getTime() / 1000) }
  }
  function getFiltered() { const b = getBounds(); return convs.filter(r => { const t = r.start_time_unix; return t != null && t >= b.f && t <= b.t }) }

  function download() {
    const rows = getFiltered()
    if (!rows.length) { alert('No conversations in this range.'); return }
    // Dynamic import XLSX
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    script.onload = () => doDownload(rows)
    if ((window as any).XLSX) { doDownload(rows); return }
    document.head.appendChild(script)
  }

  function doDownload(rows: Conversation[]) {
    const XLSX = (window as any).XLSX
    const wb = XLSX.utils.book_new()

    const header = [...(fields.name ? ['User Name'] : []), ...(fields.date ? ['Date'] : []), ...(fields.duration ? ['Duration'] : []), ...(fields.cost ? ['Cost ($)'] : []), ...(fields.summary ? ['Transcript Summary'] : []), ...(fields.endReason ? ['End Reason'] : []), ...(fields.kb ? ['KB Questions'] : []), ...(fields.nonkb ? ['Non-KB Questions'] : [])]
    if (header.length) {
      const data = rows.map(r => ({
        ...(fields.name ? { 'User Name': extractUserName(r) || '' } : {}),
        ...(fields.date ? { 'Date': r.start_time_unix ? new Date(r.start_time_unix * 1000).toLocaleString('en-IN') : '' } : {}),
        ...(fields.duration ? { 'Duration': r.duration_secs ? fmtDur(r.duration_secs) : '' } : {}),
        ...(fields.cost ? { 'Cost ($)': r.cost != null ? r.cost.toFixed(4) : '' } : {}),
        ...(fields.summary ? { 'Transcript Summary': r.transcript_summary || '' } : {}),
        ...(fields.endReason ? { 'End Reason': (r as any).end_reason || '' } : {}),
        ...(fields.kb ? { 'KB Questions': fmtList(r.kb_question_list) } : {}),
        ...(fields.nonkb ? { 'Non-KB Questions': fmtList(r.non_kb_question_list) } : {}),
      }))
      const ws = XLSX.utils.json_to_sheet(data, { header }); ws['!cols'] = header.map(h => ({ wch: Math.max(h.length + 4, 22) }))
      XLSX.utils.book_append_sheet(wb, ws, 'Summary')
    }
    if (fields.chat) {
      const chatRows: any[] = []
      rows.forEach(r => {
        const un = extractUserName(r) || 'Unknown', sd = r.start_time_unix ? new Date(r.start_time_unix * 1000).toLocaleString('en-IN') : '', tr = rowToTranscript(r)
        if (!tr.length) { chatRows.push({ 'Session ID': r.conversation_id || '', 'User Name': un, 'Date': sd, 'Turn #': '', 'Speaker': '', 'Message': '(no transcript)', 'Time in Call': '' }) }
        else tr.forEach((t, i) => {
          const sp = t.role === 'user' ? un : 'Agent', ts = t.time_in_call_secs != null ? `${String(Math.floor(t.time_in_call_secs / 60)).padStart(2, '0')}:${String(t.time_in_call_secs % 60).padStart(2, '0')}` : ''
          chatRows.push({ 'Session ID': i === 0 ? (r.conversation_id || '') : '', 'User Name': i === 0 ? un : '', 'Date': i === 0 ? sd : '', 'Turn #': i + 1, 'Speaker': sp, 'Message': t.message || t.text || '', 'Time in Call': ts })
        })
        chatRows.push({ 'Session ID': '', 'User Name': '', 'Date': '', 'Turn #': '', 'Speaker': '', 'Message': '', 'Time in Call': '' })
      })
      const ws2 = XLSX.utils.json_to_sheet(chatRows, { header: ['Session ID', 'User Name', 'Date', 'Turn #', 'Speaker', 'Message', 'Time in Call'] })
      ws2['!cols'] = [{ wch: 36 }, { wch: 20 }, { wch: 22 }, { wch: 8 }, { wch: 16 }, { wch: 80 }, { wch: 12 }]
      XLSX.utils.book_append_sheet(wb, ws2, 'Chat History')
    }
    const b = getBounds()
    XLSX.writeFile(wb, `chat-history_${new Date(b.f * 1000).toISOString().slice(0, 10)}_to_${new Date(b.t * 1000).toISOString().slice(0, 10)}.xlsx`)
    onClose()
  }

  const filtered = getFiltered()

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0d2137', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', width: '100%', maxWidth: '460px', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <span style={{ fontSize: '14px', fontWeight: '800', color: '#fff' }}>📥 Export Chat History</span>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: '3px 8px', fontSize: '13px' }}>✕</button>
        </div>
        <div style={{ padding: '18px 20px 22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: '800', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '8px' }}>Date Range</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['week', 'month', 'custom'] as const).map(r => (
                <button key={r} onClick={() => setRange(r)} style={{ flex: 1, padding: '7px 6px', fontSize: '12px', fontWeight: '700', borderRadius: '8px', border: '1px solid', cursor: 'pointer', fontFamily: 'var(--font-nunito),sans-serif', background: range === r ? '#4AAFF7' : 'transparent', color: range === r ? '#fff' : 'rgba(255,255,255,0.45)', borderColor: range === r ? '#4AAFF7' : 'rgba(255,255,255,0.15)', transition: 'all .15s' }}>
                  {r === 'week' ? 'Last 7 days' : r === 'month' ? 'Last 30 days' : 'Custom'}
                </button>
              ))}
            </div>
            {range === 'custom' && (
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', fontWeight: '700', color: 'rgba(255,255,255,0.4)' }}>From<input type="date" value={fromDate} onChange={e => setFrom(e.target.value)} style={{ padding: '7px 9px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.8)', fontSize: '12px', fontFamily: 'var(--font-nunito),sans-serif', outline: 'none' }} /></label>
                <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', fontWeight: '700', color: 'rgba(255,255,255,0.4)' }}>To<input type="date" value={toDate} onChange={e => setTo(e.target.value)} style={{ padding: '7px 9px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.8)', fontSize: '12px', fontFamily: 'var(--font-nunito),sans-serif', outline: 'none' }} /></label>
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: '10px', fontWeight: '800', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '8px' }}>Fields to Export</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {([['name', 'User Name', ''], ['date', 'Date', ''], ['duration', 'Duration', 'call length'], ['cost', 'Cost ($)', 'per call'], ['summary', 'Transcript Summary', ''], ['endReason', 'End Reason', 'why call ended'], ['kb', 'KB Questions', 'from knowledge base'], ['nonkb', 'Non-KB Questions', 'not in knowledge base'], ['chat', '💬 Full Chat History', 'added as separate sheet']] as [keyof typeof fields, string, string][]).map(([k, l, d]) => (
                <label key={k} onClick={() => setFields(f => ({ ...f, [k]: !f[k] }))} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '8px', border: `1px solid ${fields[k] ? 'rgba(74,175,247,0.3)' : 'rgba(255,255,255,0.08)'}`, background: fields[k] ? 'rgba(74,175,247,0.08)' : 'rgba(255,255,255,0.03)', cursor: 'pointer', transition: 'all .15s', userSelect: 'none' }}>
                  <div style={{ width: '14px', height: '14px', borderRadius: '3px', border: `2px solid ${fields[k] ? '#4AAFF7' : 'rgba(255,255,255,0.2)'}`, background: fields[k] ? '#4AAFF7' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .15s' }}>
                    {fields[k] && <span style={{ color: '#fff', fontSize: '9px', lineHeight: 1 }}>✓</span>}
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: 'rgba(255,255,255,0.8)' }}>{l}</span>
                  {d && <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' }}>{d}</span>}
                </label>
              ))}
            </div>
          </div>

          <div style={{ fontSize: '12px', fontWeight: '600', color: 'rgba(255,255,255,0.35)' }}>
            {filtered.length ? `${filtered.length} conversation${filtered.length !== 1 ? 's' : ''} will be exported` : 'No conversations in this range'}
          </div>

          <button onClick={download} style={{ padding: '11px', borderRadius: '50px', border: 'none', background: '#4AAFF7', color: '#fff', fontSize: '13px', fontWeight: '800', cursor: 'pointer', fontFamily: 'var(--font-nunito),sans-serif', transition: 'background .15s' }}
            onMouseOver={e => e.currentTarget.style.background = '#5fbcff'} onMouseOut={e => e.currentTarget.style.background = '#4AAFF7'}>
            ⬇ Download Report
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Dashboard Page ───────────────────────────────────────
export default function AgentDashboardPage() {
  const { agentId: agentDbId } = useParams<{ agentId: string }>()
  const router = useRouter()

  const [tab, setTab] = useState<'overview' | 'chat'>('overview')
  const [activeUser, setActiveUser] = useState<string | null>(null)
  const [activeConv, setActiveConv] = useState<string | null>(null)
  const [searchQ, setSearchQ] = useState('')
  const [chartRange, setChartRange] = useState<number | 'all' | 'custom'>(30)
  const [syncStatus, setSyncStatus] = useState<{ text: string; color: string }>({ text: 'Never synced', color: '#f76b8a' })
  const [syncing, setSyncing] = useState(false)
  const [resyncing, setResyncing] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'pending' | 'success' | 'failure'>('idle')
  const [testDetail, setTestDetail] = useState('')
  const [testRunning, setTestRunning] = useState(false)
  const [subStatus, setSubStatus] = useState<{ label: string; type: 'active' | 'trial' | 'inactive' | 'loading' }>({ label: 'Loading', type: 'loading' })
  const [exportOpen, setExportOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [dayFilter, setDayFilter] = useState<string | null>(null)

  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL!
  const API_SECRET = process.env.NEXT_PUBLIC_API_SECRET!

  // ── Load agent info ─────────────────────────────────────────
  const { data: agent } = useQuery<Agent>({
    queryKey: ['agent', agentDbId],
    queryFn: async () => {
      const { data, error } = await supabase.from('agents').select('*').eq('id', agentDbId).single()
      if (error) throw error
      return data
    },
    enabled: !!agentDbId,
  })

  // ── Load role ───────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
      setIsAdmin(profile?.role === 'admin')
    })
  }, [])



  async function backendFetch(path: string, options: RequestInit = {}) {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    const res = await fetch(`${BACKEND_URL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', 'x-api-secret': API_SECRET, ...(token ? { 'Authorization': `Bearer ${token}` } : {}), ...(options.headers || {}) },
    })
    const data = await res.json()
    if (!res.ok || !data.success) throw new Error(data?.error?.message || `Backend error ${res.status}`)
    return data
  }

  // ── Load conversations ───────────────────────────────────────
  const { data: convData, isLoading, error, refetch } = useQuery({
    queryKey: ['conversations', agentDbId],
    queryFn: async () => {
      const result = await backendFetch(`/api/conversations/${agentDbId}?limit=1000`)
      setSyncStatus(syncLabel(result.data.lastSyncedAt))
      return result.data as { conversations: Conversation[]; lastSyncedAt: string | null }
    },
    enabled: !!agentDbId,
    staleTime: 1000 * 60 * 2,
    retry: 1,
  })

  const allConvs = convData?.conversations || []
  const { userMap, userLatest } = buildUserMap(allConvs)

  // ── Load subscription (must be after allConvs) ──────────────
  useEffect(() => {
    if (!agent) return

    const platform = (agent as any).platform || 'elevenlabs'

    if (platform === 'vapi') {
      const totalCost = allConvs.reduce((sum, c) => sum + (c.cost || 0), 0)
      setSubStatus({
        label: totalCost > 0 ? `$${totalCost.toFixed(2)} spent` : 'Pay-per-use',
        type: 'active'
      })
      return
    }

    if (!agent.api_key) return
    fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': agent.api_key } })
      .then(r => r.json())
      .then(data => {
        const tier = data.tier || data.plan || ''
        const status = (data.status || '').toLowerCase()
        const label = tier ? tier.replace(/_/g, ' ') : (status || 'Unknown')
        const isTrial = status === 'trialing' || tier.toLowerCase().includes('free')
        setSubStatus({ label: label.slice(0, 14), type: isTrial ? 'trial' : 'active' })
      })
      .catch(() => setSubStatus({ label: 'Error', type: 'inactive' }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent, allConvs.length])

  const sortedUsers = Object.keys(userMap).sort((a, b) => {
    const diff = (userLatest[b] || 0) - (userLatest[a] || 0)
    return diff !== 0 ? diff : a.localeCompare(b)
  })
  const filteredUsers = sortedUsers.filter(n => n.toLowerCase().includes(searchQ.toLowerCase()))

  // Avg duration
  const durs = allConvs.map(r => r.duration_secs).filter(Boolean) as number[]
  const avgDur = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 0

  // ── Sync ────────────────────────────────────────────────────
  async function triggerSync() {
    setSyncing(true)
    try {
      const result = await backendFetch(`/api/conversations/sync/${agentDbId}`, { method: 'POST' })
      setSyncStatus(syncLabel(result.data.lastSyncedAt))
      if (result.data.newCount > 0) refetch()
    } catch { }
    finally { setSyncing(false) }
  }

  async function triggerFullResync() {
    if (!confirm(`This will delete all cached conversations and re-fetch everything from ${(agent as any)?.platform === 'vapi' ? 'Vapi' : 'ElevenLabs'}.\n\nContinue?`)) return
    setResyncing(true)
    try {
      await backendFetch(`/api/conversations/reset/${agentDbId}`, { method: 'DELETE' })
      const result = await backendFetch(`/api/conversations/sync/${agentDbId}`, { method: 'POST' })
      setSyncStatus(syncLabel(result.data.lastSyncedAt))
      refetch()
    } catch (err: any) { alert('Re-sync failed: ' + err.message) }
    finally { setResyncing(false) }
  }

  // ── Agent Test ───────────────────────────────────────────────
  const XI_TEST_IDS = ['test_3501khk9es7se6sa5v80dqfymy5p', 'test_1601khnxeyt8e6nrs7e9nwh1af0b', 'test_8001khttb2hjfy9t68fcgt8d7pg9', 'test_4901khnhzkgqffa94mvtb5kkkq0n', 'test_1901khbh1446fybaxgd4sa6j4e7q']

  async function runAgentTest() {
    if (testRunning || !agent?.api_key || !agent?.agent_id) return
    setTestRunning(true); setTestStatus('pending'); setTestDetail('Starting…')
    try {
      const trigRes = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agent.agent_id}/run-tests`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'xi-api-key': agent.api_key },
        body: JSON.stringify({ tests: XI_TEST_IDS.map(id => ({ test_id: id })) })
      }).then(r => r.json())
      const invId = trigRes.test_invocation_id || (trigRes.test_runs && trigRes.test_runs[0]?.test_invocation_id) || null
      if (!invId) throw new Error('No invocation ID')
      setTestDetail('Tests running…')
      // Poll
      const deadline = Date.now() + 180000
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 5000))
        const data = await fetch(`https://api.elevenlabs.io/v1/convai/test-invocations/${invId}`, { headers: { 'xi-api-key': agent.api_key } }).then(r => r.json())
        const st = (data.status || '').toLowerCase()
        if (st === 'completed' || st === 'finished' || st === 'done') {
          const runs = data.test_runs || data.tests || []
          const passed = runs.filter((r: any) => r.passed === true || r.status === 'passed').length
          setTestStatus(passed >= 2 ? 'success' : 'failure'); setTestDetail(runs.length ? `${passed}/${runs.length} passed` : '')
          return
        }
        if (st === 'failed' || st === 'error') { setTestStatus('failure'); setTestDetail(''); return }
      }
      setTestStatus('failure'); setTestDetail('Timed out')
    } catch (err) { setTestStatus('failure'); setTestDetail('') }
    finally { setTestRunning(false) }
  }

  // ── Chat tab state ───────────────────────────────────────────
  const userConvs = activeUser ? (userMap[activeUser] || []) : []
  const filteredDay = dayFilter ? userConvs.filter(r => daySort(r.start_time_unix) === dayFilter) : userConvs
  const activeConvData = activeConv ? allConvs.find(r => r.conversation_id === activeConv) || null : null
  const activeUserName = activeUser || ''

  // Day groups for timeline
  const dayGroups: Record<string, { label: string; rows: Conversation[] }> = {}
  for (const r of filteredDay) {
    const k = daySort(r.start_time_unix), l = dayLabel(r.start_time_unix)
    if (!dayGroups[k]) dayGroups[k] = { label: l, rows: [] }
    dayGroups[k].rows.push(r)
  }
  const dayKeys = Object.keys(dayGroups).sort().reverse()

  // Day filter chips
  const dayFilterDays: Record<string, string> = {}
  for (const r of userConvs) { const u = r.start_time_unix; if (!u) continue; const k = daySort(u); if (!dayFilterDays[k]) dayFilterDays[k] = dayLabelShort(u) }
  const dayFilterKeys = Object.keys(dayFilterDays).sort().reverse()

  // ── Test badge color ─────────────────────────────────────────
  const testBadgeStyle = {
    idle: { bg: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', border: 'rgba(255,255,255,0.1)' },
    pending: { bg: 'rgba(245,166,35,0.1)', color: '#f5a623', border: 'rgba(245,166,35,0.3)' },
    success: { bg: 'rgba(52,201,142,0.1)', color: '#34c98e', border: 'rgba(52,201,142,0.3)' },
    failure: { bg: 'rgba(247,107,138,0.1)', color: '#f76b8a', border: 'rgba(247,107,138,0.3)' },
  }[testStatus]

  const subBadgeStyle = {
    active: { bg: 'rgba(52,201,142,0.1)', color: '#34c98e', border: 'rgba(52,201,142,0.3)' },
    trial: { bg: 'rgba(74,175,247,0.1)', color: '#4AAFF7', border: 'rgba(74,175,247,0.3)' },
    inactive: { bg: 'rgba(247,107,138,0.1)', color: '#f76b8a', border: 'rgba(247,107,138,0.3)' },
    loading: { bg: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.3)', border: 'rgba(255,255,255,0.1)' },
  }[subStatus.type]

  // ── Shared styles ─────────────────────────────────────────────
  const S = {
    statCard: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '20px 22px' } as React.CSSProperties,
    badge: (bg: string, color: string, border: string) => ({ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 11px', borderRadius: '50px', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase' as const, letterSpacing: '.04em', border: `1px solid ${border}`, background: bg, color }),
  }

  if (isLoading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '16px' }}>
      <CILogo size={44} animate /><div style={{ fontSize: '13px', fontWeight: '600', color: 'rgba(255,255,255,0.4)' }}>Loading conversations…</div>
    </div>
  )

  return (
    <>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
        .sess-card { transition:background .15s,border-color .15s; }
        .sess-card:hover { background:rgba(255,255,255,0.07)!important; }
        .sess-card.active { border-color:rgba(74,175,247,0.4)!important; background:rgba(74,175,247,0.08)!important; }
        .user-row { transition:background .15s; }
        .user-row:hover { background:rgba(255,255,255,0.06)!important; }
        .user-row.active { background:rgba(74,175,247,0.1)!important; border-left:3px solid #4AAFF7!important; }
        ::-webkit-scrollbar{width:4px;height:4px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:2px}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.5)}
      `}</style>

      {/* ── Sub-topbar: agent info + actions ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button onClick={() => router.push('/')} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: '7px 12px', fontSize: '13px', fontFamily: 'var(--font-nunito),sans-serif', fontWeight: '700', transition: 'all .15s' }}
            onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff' }} onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)' }}>
            ← Back
          </button>
          {/* Agent avatar */}
          <div style={{ width: '42px', height: '42px', borderRadius: '11px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', background: 'rgba(74,175,247,0.12)', border: '1px solid rgba(74,175,247,0.2)', flexShrink: 0 }}>
            {agent?.image_url ? <img src={agent.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (agent?.emoji || '🤖')}
          </div>
          <div>
            <div style={{ fontSize: '17px', fontWeight: '800', color: '#fff', letterSpacing: '-0.3px' }}>{agent?.name || 'Agent'}</div>
            <div style={{ fontSize: '11px', fontFamily: 'var(--font-fira)', color: 'rgba(255,255,255,0.3)', marginTop: '1px' }}>{agent?.agent_id || '—'}</div>
          </div>
        </div>

        {/* Right: sync + tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {isAdmin && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: '700' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: syncStatus.color, flexShrink: 0 }} />
                <span style={{ color: 'rgba(255,255,255,0.4)' }}>{syncStatus.text}</span>
              </div>
              <button onClick={() => setExportOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '50px', border: '1px solid rgba(155,127,244,0.3)', background: 'rgba(155,127,244,0.1)', color: '#9b7ff4', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'var(--font-nunito),sans-serif', transition: 'all .15s' }}
                onMouseOver={e => { e.currentTarget.style.background = '#9b7ff4'; e.currentTarget.style.color = '#fff' }} onMouseOut={e => { e.currentTarget.style.background = 'rgba(155,127,244,0.1)'; e.currentTarget.style.color = '#9b7ff4' }}>
                Download Report
              </button>
              <button onClick={triggerFullResync} disabled={resyncing} style={{ padding: '7px 14px', borderRadius: '50px', border: '1px solid rgba(245,166,35,0.3)', background: 'rgba(245,166,35,0.1)', color: '#f5a623', fontSize: '12px', fontWeight: '700', cursor: resyncing ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-nunito),sans-serif', opacity: resyncing ? .6 : 1, transition: 'all .15s' }}
                onMouseOver={e => { if (!resyncing) { e.currentTarget.style.background = '#f5a623'; e.currentTarget.style.color = '#fff' } }} onMouseOut={e => { e.currentTarget.style.background = 'rgba(245,166,35,0.1)'; e.currentTarget.style.color = '#f5a623' }}>
                {resyncing ? '♻️ Resyncing…' : '♻️ Re-sync All'}
              </button>
              <button onClick={triggerSync} disabled={syncing} style={{ padding: '7px 14px', borderRadius: '50px', border: '1px solid rgba(52,201,142,0.3)', background: 'rgba(52,201,142,0.1)', color: '#34c98e', fontSize: '12px', fontWeight: '700', cursor: syncing ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-nunito),sans-serif', opacity: syncing ? .7 : 1, transition: 'all .15s', animation: syncing ? 'syncPulse 1s infinite' : '' }}
                onMouseOver={e => { if (!syncing) { e.currentTarget.style.background = '#34c98e'; e.currentTarget.style.color = '#fff' } }} onMouseOut={e => { e.currentTarget.style.background = 'rgba(52,201,142,0.1)'; e.currentTarget.style.color = '#34c98e' }}>
                {syncing ? '🔄 Syncing…' : '🔄 Sync Now'}
              </button>
            </>
          )}
          {/* Tab switcher */}
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', overflow: 'hidden' }}>
            {(['overview', 'chat'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ padding: '8px 16px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '700', fontFamily: 'var(--font-nunito),sans-serif', background: tab === t ? 'rgba(74,175,247,0.15)' : 'transparent', color: tab === t ? '#4AAFF7' : 'rgba(255,255,255,0.45)', transition: 'all .15s', borderRight: t === 'overview' ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
                {t === 'overview' ? '📊 Overview' : '💬 Chat History'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: '14px 18px', background: 'rgba(247,107,138,0.1)', border: '1px solid rgba(247,107,138,0.2)', borderRadius: '12px', color: '#f9a8bb', fontSize: '13px', marginBottom: '20px' }}>
          🔌 Backend offline — start your backend server and refresh.
        </div>
      )}

      {/* ══ OVERVIEW TAB ══ */}
      {tab === 'overview' && (
        <div style={{ animation: 'fadeUp .3s ease' }}>
          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: '14px', marginBottom: '22px' }}>

            <div style={{ ...S.statCard, animationDelay: '0ms' }}>
              <div style={{ fontSize: '10px', fontWeight: '800', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '8px' }}>Number of Calls</div>
              <div style={{ fontSize: '32px', fontWeight: '900', color: '#fff', lineHeight: 1, marginBottom: '4px' }}>{allConvs.length || '0'}</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: '500' }}>total sessions</div>
            </div>

            <div style={{ ...S.statCard, animationDelay: '50ms' }}>
              <div style={{ fontSize: '10px', fontWeight: '800', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '8px' }}>Average Duration</div>
              <div style={{ fontSize: '32px', fontWeight: '900', color: '#fff', lineHeight: 1, marginBottom: '4px' }}>{fmtDur(avgDur)}</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: '500' }}>per session</div>
            </div>

            <div style={{ ...S.statCard, animationDelay: '100ms' }}>
              <div style={{ fontSize: '10px', fontWeight: '800', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '8px' }}>Unique Users</div>
              <div style={{ fontSize: '32px', fontWeight: '900', color: '#fff', lineHeight: 1, marginBottom: '4px' }}>{Object.keys(userMap).length || '0'}</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: '500' }}>distinct users</div>
            </div>

            <div style={{ ...S.statCard, animationDelay: '150ms' }}>
              <div style={{ fontSize: '10px', fontWeight: '800', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '8px' }}>Agent Test</div>
              {(agent as any)?.platform === 'vapi' ? (
                <>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>Test via Vapi Dashboard</div>
                  <a href="https://dashboard.vapi.ai" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '50px', color: '#22C55E', fontSize: '12px', fontWeight: '800', cursor: 'pointer', fontFamily: 'var(--font-nunito),sans-serif', textDecoration: 'none', transition: 'background .15s' }}>
                    📞 Open Vapi Dashboard
                  </a>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: 'rgba(255,255,255,0.7)', marginBottom: '8px' }}>Run a test call</div>
                  <button onClick={runAgentTest} disabled={testRunning || !agent?.api_key} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: testRunning ? 'rgba(155,127,244,0.4)' : '#9b7ff4', border: 'none', borderRadius: '50px', color: '#fff', fontSize: '12px', fontWeight: '800', cursor: testRunning || !agent?.api_key ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-nunito),sans-serif', transition: 'background .15s' }}>
                    {testRunning ? '⏳ Running…' : '🧪 Test Agent'}
                  </button>
                </>
              )}
            </div>

            <div style={{ ...S.statCard, animationDelay: '200ms' }}>
              <div style={{ fontSize: '10px', fontWeight: '800', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '8px' }}>Test Status</div>
              <div style={{ fontSize: '22px', marginBottom: '6px' }}>{{ 'idle': '—', 'pending': '⏳', 'success': '✅', 'failure': '❌' }[testStatus]}</div>
              <div style={S.badge(testBadgeStyle.bg, testBadgeStyle.color, testBadgeStyle.border)}>
                {testStatus === 'idle' ? 'Idle' : testStatus === 'pending' ? `Pending${testDetail ? ` (${testDetail})` : ''}` : `${testStatus.charAt(0).toUpperCase() + testStatus.slice(1)}${testDetail ? ` (${testDetail})` : ''}`}
              </div>
            </div>

            <div style={{ ...S.statCard, animationDelay: '250ms' }}>
              <div style={{ fontSize: '10px', fontWeight: '800', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '8px' }}>
                {(agent as any)?.platform === 'vapi' ? 'Billing' : 'Subscription'}
              </div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: 'rgba(255,255,255,0.7)', marginBottom: '6px', textTransform: 'capitalize' }}>{subStatus.label}</div>
              <div style={S.badge(subBadgeStyle.bg, subBadgeStyle.color, subBadgeStyle.border)}>
                {subStatus.type === 'loading' ? 'Checking…' : subStatus.type === 'active' ? (((agent as any)?.platform === 'vapi') ? 'Pay-per-use' : 'Active') : subStatus.type === 'trial' ? 'Trial' : 'Inactive'}
              </div>
            </div>
          </div>

          <CallsChart convs={allConvs} range={chartRange} onRangeChange={setChartRange} />
        </div>
      )}

      {/* ══ CHAT TAB ══ */}
      {tab === 'chat' && (
        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr 280px', gap: '16px', height: 'calc(100vh - 200px)', minHeight: '500px', animation: 'fadeUp .3s ease' }}>

          {/* ── Users sidebar ── */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: '800', color: 'rgba(255,255,255,0.6)', marginBottom: '10px' }}>👥 Users</div>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px' }}>🔍</span>
                <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search users…"
                  style={{ width: '100%', padding: '7px 10px 7px 30px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.8)', fontSize: '12px', fontFamily: 'var(--font-nunito),sans-serif', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '6px 0' }}>
              {!allConvs.length ? (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '12px' }}>🌵<br />No conversations yet</div>
              ) : filteredUsers.length === 0 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '12px' }}>🔍<br />No users match</div>
              ) : (
                <>
                  <div style={{ padding: '6px 16px 4px', fontSize: '10px', fontWeight: '700', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}
                  </div>
                  {filteredUsers.map((name, i) => {
                    const convs = userMap[name] || [], latest = userLatest[name]
                    return (
                      <div key={name} className={`user-row${name === activeUser ? ' active' : ''}`}
                        onClick={() => { setActiveUser(name); setActiveConv(null); setDayFilter(null) }}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 14px 9px 16px', cursor: 'pointer', borderLeft: '3px solid transparent', animation: `fadeUp .25s ease ${i * 20}ms both` }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(74,175,247,0.15)', border: '1px solid rgba(74,175,247,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '800', color: '#4AAFF7', flexShrink: 0 }}>
                          {initials(name)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: '700', color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: '1px' }}>{convs.length} session{convs.length !== 1 ? 's' : ''} · last {latest ? dayLabelShort(latest) : '—'}</div>
                        </div>
                        <div style={{ flexShrink: 0, background: 'rgba(74,175,247,0.1)', color: '#4AAFF7', border: '1px solid rgba(74,175,247,0.2)', borderRadius: '50px', fontSize: '10px', fontWeight: '800', padding: '1px 7px' }}>{convs.length}</div>
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          </div>

          {/* ── Timeline ── */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ fontSize: '12px', fontWeight: '800', color: 'rgba(255,255,255,0.6)' }}>📅 Sessions</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontWeight: '600' }}>{filteredDay.length} session{filteredDay.length !== 1 ? 's' : ''}</div>
              </div>
              {/* Day filter chips */}
              {activeUser && dayFilterKeys.length > 1 && (
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                  <button onClick={() => setDayFilter(null)} style={{ padding: '3px 10px', borderRadius: '50px', border: '1px solid', fontSize: '10px', fontWeight: '700', cursor: 'pointer', fontFamily: 'var(--font-nunito),sans-serif', background: dayFilter === null ? '#4AAFF7' : 'transparent', color: dayFilter === null ? '#fff' : 'rgba(255,255,255,0.4)', borderColor: dayFilter === null ? '#4AAFF7' : 'rgba(255,255,255,0.15)', transition: 'all .15s' }}>
                    All ({userConvs.length})
                  </button>
                  {dayFilterKeys.map(k => (
                    <button key={k} onClick={() => setDayFilter(k)} style={{ padding: '3px 10px', borderRadius: '50px', border: '1px solid', fontSize: '10px', fontWeight: '700', cursor: 'pointer', fontFamily: 'var(--font-nunito),sans-serif', background: dayFilter === k ? '#4AAFF7' : 'transparent', color: dayFilter === k ? '#fff' : 'rgba(255,255,255,0.4)', borderColor: dayFilter === k ? '#4AAFF7' : 'rgba(255,255,255,0.15)', transition: 'all .15s' }}>
                      {dayFilterDays[k]} ({userConvs.filter(r => daySort(r.start_time_unix) === k).length})
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '8px 12px' }}>
              {!activeUser ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '8px', color: 'rgba(255,255,255,0.25)' }}>
                  <div style={{ fontSize: '28px' }}>🗓️</div>
                  <div style={{ fontSize: '13px', fontWeight: '700' }}>Select a user</div>
                  <div style={{ fontSize: '11px' }}>from the sidebar</div>
                </div>
              ) : filteredDay.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '8px', color: 'rgba(255,255,255,0.25)' }}>
                  <div style={{ fontSize: '28px' }}>📭</div>
                  <div style={{ fontSize: '13px', fontWeight: '700' }}>No sessions</div>
                </div>
              ) : dayKeys.map((dk, di) => {
                const { label, rows } = dayGroups[dk]
                const sorted = [...rows].sort((a, b) => (b.start_time_unix || 0) - (a.start_time_unix || 0))
                return (
                  <div key={dk} style={{ marginBottom: '14px', animation: `fadeUp .3s ease ${di * 40}ms both` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '800', color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>{label}</span>
                      <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
                      <span style={{ fontSize: '10px', fontWeight: '700', color: 'rgba(255,255,255,0.25)' }}>{rows.length}</span>
                    </div>
                    {sorted.map((r, ci) => {
                      const tok = rowToTokens(r), tr2 = rowToTranscript(r)
                      const prev = tr2.find(t => t.role === 'user')?.message || 'No preview'
                      const userTurns = tr2.filter(t => t.role === 'user').length
                      const isActive = r.conversation_id === activeConv
                      return (
                        <div key={r.conversation_id} className={`sess-card${isActive ? ' active' : ''}`}
                          onClick={() => setActiveConv(r.conversation_id)}
                          style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)', cursor: 'pointer', marginBottom: '6px', animation: `fadeUp .25s ease ${di * 40 + ci * 15}ms both` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                            <span style={{ fontSize: '11px', fontWeight: '700', color: 'rgba(255,255,255,0.5)' }}>{fmtTime(r.start_time_unix)}</span>
                            <span style={{ fontSize: '10px', fontWeight: '800', padding: '2px 8px', borderRadius: '50px', background: `${stColor(r.status)}18`, color: stColor(r.status), border: `1px solid ${stColor(r.status)}40` }}>{r.status || '—'}</span>
                          </div>
                          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginBottom: '7px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic' }}>"{prev}"</div>
                          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                            {r.duration_secs && <span style={{ fontSize: '10px', fontWeight: '600', padding: '2px 7px', borderRadius: '50px', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>⏱ {fmtDur(r.duration_secs)}</span>}
                            {userTurns > 0 && <span style={{ fontSize: '10px', fontWeight: '600', padding: '2px 7px', borderRadius: '50px', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>💬 {userTurns} quer{userTurns !== 1 ? 'ies' : 'y'}</span>}
                            {tok && <span style={{ fontSize: '10px', fontWeight: '600', padding: '2px 7px', borderRadius: '50px', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>🔢 {fmtTokens(tok.total)}</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Transcript panel ── */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {!activeConvData ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '10px', color: 'rgba(255,255,255,0.25)', padding: '24px' }}>
                <div style={{ fontSize: '32px' }}>💬</div>
                <div style={{ fontSize: '13px', fontWeight: '700', textAlign: 'center' }}>Select a session to read the transcript</div>
              </div>
            ) : (() => {
              const tok = rowToTokens(activeConvData)
              const tr = rowToTranscript(activeConvData)
              const ini = initials(activeUserName)
              return (
                <>
                  {/* Transcript header */}
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(74,175,247,0.15)', border: '1px solid rgba(74,175,247,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '800', color: '#4AAFF7', flexShrink: 0 }}>{ini}</div>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: '800', color: '#fff' }}>Chat with <em style={{ fontStyle: 'italic', color: '#4AAFF7' }}>{activeUserName}</em></div>
                        <div style={{ fontSize: '9px', fontFamily: 'var(--font-fira)', color: 'rgba(255,255,255,0.25)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeConvData.conversation_id}</div>
                      </div>
                    </div>
                    {tok && <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 10px', borderRadius: '50px', background: 'rgba(52,201,142,0.1)', border: '1px solid rgba(52,201,142,0.2)', fontSize: '10px', fontWeight: '700', color: '#34c98e' }}>🔢 {fmtTokens(tok.input)} in · {fmtTokens(tok.output)} out</div>}
                    {/* Info rows */}
                    <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {[
                        ['Date', fmtDate(activeConvData.start_time_unix)],
                        ['Time', fmtTime(activeConvData.start_time_unix)],
                        ['Duration', fmtDur(activeConvData.duration_secs)],
                        ['Primary Q', activeConvData.primary_question || '—'],
                      ].map(([l, v]) => (
                        <div key={l} style={{ display: 'flex', gap: '6px', fontSize: '10px' }}>
                          <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: '700', minWidth: '60px' }}>{l}</span>
                          <span style={{ color: 'rgba(255,255,255,0.65)', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{v}</span>
                        </div>
                      ))}
                      {activeConvData.kb_question_list && <div style={{ fontSize: '10px' }}><span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: '700' }}>KB Qs: </span><span style={{ color: 'rgba(52,201,142,0.8)', fontWeight: '600' }}>{fmtList(activeConvData.kb_question_list)}</span></div>}
                      {activeConvData.non_kb_question_list && <div style={{ fontSize: '10px' }}><span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: '700' }}>Non-KB: </span><span style={{ color: 'rgba(245,166,35,0.8)', fontWeight: '600' }}>{fmtList(activeConvData.non_kb_question_list)}</span></div>}
                    </div>
                  </div>
                  {/* Messages */}
                  <div style={{ overflowY: 'auto', flex: 1, padding: '12px' }}>
                    {!tr.length ? (
                      <div style={{ textAlign: 'center', padding: '24px', color: 'rgba(255,255,255,0.25)', fontSize: '12px' }}>📭 No messages</div>
                    ) : tr.map((t, i) => {
                      const isUser = t.role === 'user', ts = t.time_in_call_secs
                      const tStr = ts != null ? `${String(Math.floor(ts / 60)).padStart(2, '0')}:${String(ts % 60).padStart(2, '0')}` : null
                      return (
                        <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '10px', justifyContent: isUser ? 'flex-end' : 'flex-start', animation: `fadeUp .2s ease ${Math.min(i * 10, 200)}ms both` }}>
                          {!isUser && <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'rgba(155,127,244,0.15)', border: '1px solid rgba(155,127,244,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', flexShrink: 0 }}>🤖</div>}
                          <div style={{ maxWidth: '80%' }}>
                            <div style={{ fontSize: '10px', fontWeight: '700', color: 'rgba(255,255,255,0.3)', marginBottom: '3px', textAlign: isUser ? 'right' : 'left' }}>
                              {isUser ? activeUserName : 'Agent'}{tStr ? ` · ${tStr}` : ''}
                            </div>
                            <div style={{ padding: '9px 12px', borderRadius: isUser ? '14px 4px 14px 14px' : '4px 14px 14px 14px', background: isUser ? 'rgba(74,175,247,0.15)' : 'rgba(255,255,255,0.06)', border: `1px solid ${isUser ? 'rgba(74,175,247,0.2)' : 'rgba(255,255,255,0.08)'}`, fontSize: '12px', lineHeight: '1.55', color: isUser ? 'rgba(200,230,255,0.9)' : 'rgba(255,255,255,0.75)', fontWeight: '500' }}>
                              {t.message || t.text || ''}
                            </div>
                          </div>
                          {isUser && <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'rgba(74,175,247,0.15)', border: '1px solid rgba(74,175,247,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '800', color: '#4AAFF7', flexShrink: 0 }}>{ini}</div>}
                        </div>
                      )
                    })}
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {exportOpen && <ExportModal convs={allConvs} onClose={() => setExportOpen(false)} />}
    </>
  )
}