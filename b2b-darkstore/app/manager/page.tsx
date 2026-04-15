'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Bin, Picker, LogEntry } from '@/lib/types'
import {
  LayoutGrid, User, Package, Activity, AlertTriangle,
  Zap, Wifi, WifiOff, Send, TrendingUp, ShoppingCart,
  Truck, Settings, BarChart3, ZoomIn, ZoomOut, Layers,
} from 'lucide-react'

// ── BinCell ───────────────────────────────────────────────────────
function BinCell({ bin, picker, pickerIndex }: { bin: Bin | undefined; picker: Picker | undefined; pickerIndex?: number }) {
  const isGhost = bin?.status === 'ghosting_suspected'
  const hasPicker = !!picker

  if (!bin) {
    return <div className="aspect-square bg-slate-200/40 border border-slate-300/30" />
  }

  return (
    <div
      className={[
        'relative aspect-square border flex flex-col items-center justify-center overflow-hidden cursor-default select-none transition-all duration-300',
        isGhost
          ? 'border-2 border-error bg-red-50'
          : 'border border-slate-300 bg-white',
      ].join(' ')}
      style={isGhost ? {
        animation: 'pulse-red 1.4s ease-in-out infinite',
        boxShadow: '0 0 0 0 rgba(179,27,37,0.5)',
      } : {}}
      title={`${bin.label} — Aisle ${bin.aisle_id} — ${bin.status}`}
    >
      {isGhost && (
        <div className="absolute top-1 right-1">
          <AlertTriangle size={10} className="text-error" />
        </div>
      )}
      {hasPicker && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-6 h-6 bg-primary-fixed border border-primary flex items-center justify-center">
            <span className="text-[8px] font-bold text-white font-mono">P-{String(pickerIndex).padStart(2, '0')}</span>
          </div>
        </div>
      )}
      <span className="text-[8px] font-mono text-slate-500 leading-none">{bin.label}</span>
    </div>
  )
}

// ── LogRow ────────────────────────────────────────────────────────
function LogRow({ entry }: { entry: LogEntry }) {
  const styles = {
    info:  { border: 'border-l-4 border-primary-fixed', bg: 'bg-white', icon: <Activity size={12} className="text-primary-fixed shrink-0" />, text: 'text-slate-700' },
    warn:  { border: 'border-l-4 border-amber-400', bg: 'bg-amber-50/50', icon: <Zap size={12} className="text-amber-500 shrink-0" />, text: 'text-amber-700' },
    alert: { border: 'border-l-4 border-error', bg: 'bg-red-50/50', icon: <AlertTriangle size={12} className="text-error shrink-0" />, text: 'text-error font-semibold' },
  }
  const s = styles[entry.level]

  return (
    <div className={`${s.border} ${s.bg} p-3 mb-2 flex gap-3 items-start`}>
      {s.icon}
      <div className="flex-1 min-w-0">
        <span className="text-[10px] font-mono text-primary-fixed font-bold block mb-1">{entry.timestamp}</span>
        <span className={`text-xs leading-tight ${s.text} block`}>{entry.message}</span>
      </div>
    </div>
  )
}

// ── StatBar ───────────────────────────────────────────────────────
function StatBar({ label, value, pct, suffix }: { label: string; value: string; pct: number; suffix?: string }) {
  return (
    <div className="mb-3">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] font-headline font-bold uppercase tracking-widest text-slate-500">{label}</span>
        <span className="text-xs font-bold text-slate-900">{value}{suffix}</span>
      </div>
      <div className="h-1.5 bg-slate-200">
        <div className="h-full bg-primary-fixed transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────
export default function ManagerDashboard() {
  const [bins, setBins] = useState<Bin[]>([])
  const [pickers, setPickers] = useState<Picker[]>([])
  const [log, setLog] = useState<LogEntry[]>([])
  const [connected, setConnected] = useState(false)
  const [query, setQuery] = useState('')
  const logEndRef = useRef<HTMLDivElement>(null)

  const ghostCount = bins.filter(b => b.status === 'ghosting_suspected').length
  const activePickers = pickers.filter(p => p.status === 'picking').length
  const healthPct = bins.length === 0 ? 100 : Math.round(((bins.length - ghostCount) / bins.length) * 100)

  function pushLog(message: string, level: LogEntry['level'] = 'info') {
    setLog(prev => [
      ...prev.slice(-99),
      { id: crypto.randomUUID(), timestamp: new Date().toLocaleTimeString('en-IN', { hour12: false }), message, level },
    ])
  }

  const binsByCell = new Map<string, Bin>()
  bins.forEach(b => binsByCell.set(`${b.x}-${b.y}`, b))

  const pickerByAisle = new Map<string, Picker>()
  const pickerIndexByAisle = new Map<string, number>()
  pickers.forEach((p, idx) => { 
    if (p.current_aisle) {
      pickerByAisle.set(p.current_aisle, p)
      pickerIndexByAisle.set(p.current_aisle, idx + 1)
    }
  })

  useEffect(() => {
    async function load() {
      const [{ data: binsData }, { data: pickersData }] = await Promise.all([
        supabase.from('bins').select('*'),
        supabase.from('pickers').select('*'),
      ])
      if (binsData) setBins(binsData as Bin[])
      if (pickersData) setPickers(pickersData as Picker[])
      pushLog(`Initial load: ${binsData?.length ?? 0} bins, ${pickersData?.length ?? 0} pickers.`)
    }
    load()
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('manager-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bins' }, payload => {
        if (payload.eventType === 'UPDATE') {
          const updated = payload.new as Bin
          setBins(prev => prev.map(b => b.id === updated.id ? updated : b))
          if (updated.status === 'ghosting_suspected') {
            pushLog(`GHOST ALERT: Bin ${updated.label} (Aisle ${updated.aisle_id}) flagged.`, 'alert')
          } else {
            pushLog(`Bin ${updated.label} status → ${updated.status}.`, 'info')
          }
        }
        if (payload.eventType === 'INSERT') {
          setBins(prev => [...prev, payload.new as Bin])
          pushLog(`New bin registered: ${(payload.new as Bin).label}.`, 'info')
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pickers' }, payload => {
        if (payload.eventType === 'UPDATE') {
          const updated = payload.new as Picker
          setPickers(prev => prev.map(p => p.id === updated.id ? updated : p))
          pushLog(
            `Picker ${updated.name} → ${updated.status} (Aisle ${updated.current_aisle ?? 'none'}).`,
            updated.status === 'picking' ? 'info' : 'warn'
          )
        }
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          setConnected(true)
          pushLog('Realtime channel SUBSCRIBED. Live updates active.', 'info')
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setConnected(false)
          pushLog('Realtime channel disconnected.', 'warn')
        }
      })

    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden font-body">
      {/* ── Top Bar ── */}
      <header className="h-14 bg-white border-b border-slate-200 flex items-center px-6 gap-6 shrink-0">
        <div className="flex items-center gap-2">
          <LayoutGrid size={18} className="text-primary-fixed" />
          <span className="font-headline font-black italic uppercase text-primary-fixed tracking-tight text-base">CyanTech Ops</span>
        </div>
        <nav className="flex items-center gap-6 ml-6">
          {['Dashboard', 'Inventory', 'Orders'].map((item, i) => (
            <button key={item} className={`text-xs font-headline font-bold uppercase tracking-widest pb-0.5 ${i === 0 ? 'text-primary-fixed border-b-2 border-primary-fixed' : 'text-slate-500 hover:text-slate-900'}`}>
              {item}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <button className="text-xs font-headline font-bold uppercase tracking-widest px-4 py-1.5 border border-primary-fixed text-primary-fixed hover:bg-primary-fixed/10">Active Pickers</button>
          <button className="text-xs font-headline font-bold uppercase tracking-widest px-4 py-1.5 bg-error text-white hover:bg-error/90">Congestion Alerts</button>
          <div className={`flex items-center gap-2 text-xs font-mono ${connected ? 'text-emerald-600' : 'text-error'}`}>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-error'}`} />
            {connected ? 'LIVE' : 'OFFLINE'}
          </div>
          {connected ? <Wifi size={16} className="text-emerald-500" /> : <WifiOff size={16} className="text-error" />}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Sidebar ── */}
        <aside className="w-60 bg-white border-r border-slate-200 flex flex-col shrink-0">
          <div className="p-5 border-b border-slate-200 bg-white">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary-fixed/20 border border-primary-fixed flex items-center justify-center shrink-0">
                <LayoutGrid size={16} className="text-primary-fixed" />
              </div>
              <div>
                <p className="text-xs font-headline font-black uppercase text-primary-fixed tracking-wide">Zone Alpha-7</p>
                <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest">Operational</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-3">
            {[
              { label: 'Dashboard', icon: <LayoutGrid size={16} />, active: true },
              { label: 'Inventory', icon: <Package size={16} />, active: false },
              { label: 'Orders', icon: <ShoppingCart size={16} />, active: false },
              { label: 'Analytics', icon: <BarChart3 size={16} />, active: false },
              { label: 'Fleet', icon: <Truck size={16} />, active: false },
            ].map(item => (
              <button key={item.label} className={`w-full flex items-center gap-3 px-4 py-3 text-xs font-headline uppercase tracking-widest mb-1 transition-colors ${item.active ? 'text-primary-fixed font-bold border-l-2 border-primary-fixed bg-primary-fixed/5' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}>
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>

          <div className="p-4 border-t border-slate-200 space-y-3">
            <div className="p-3 bg-slate-50 border border-slate-200">
              <p className="text-[10px] font-headline uppercase tracking-widest text-slate-500 mb-1">Active Pickers</p>
              <p className={`text-xl font-black font-headline ${activePickers > 0 ? 'text-primary-fixed' : 'text-slate-400'}`}>
                {activePickers}
                <span className="text-xs text-slate-500 font-normal"> / {pickers.length}</span>
              </p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200">
              <p className="text-[10px] font-headline uppercase tracking-widest text-slate-500 mb-1">Ghost Alerts</p>
              <p className={`text-xl font-black font-headline ${ghostCount > 0 ? 'text-error animate-pulse' : 'text-slate-400'}`}>
                {ghostCount}
              </p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200">
              <p className="text-[10px] font-headline uppercase tracking-widest text-slate-500 mb-1">Bin Health</p>
              <p className={`text-xl font-black font-headline ${healthPct > 80 ? 'text-emerald-600' : 'text-amber-500'}`}>
                {healthPct}%
              </p>
            </div>
            <button className="w-full py-3 bg-primary-fixed text-on-primary-container font-headline font-black uppercase tracking-widest text-xs hover:bg-primary/90 transition-colors">
              Create Batch
            </button>
          </div>

          <div className="p-4 border-t border-slate-200">
            <button className="w-full flex items-center gap-2 text-xs text-slate-500 hover:text-slate-900 py-2">
              <Settings size={13} /> Support
            </button>
            <button className="w-full flex items-center gap-2 text-xs text-slate-500 hover:text-slate-900 py-2">
              <TrendingUp size={13} /> Sign Out
            </button>
          </div>
        </aside>

        {/* ── Center: Grid ── */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="h-11 bg-white border-b border-slate-200 flex items-center px-5 gap-3 shrink-0">
            <span className="w-2.5 h-2.5 bg-primary-fixed shrink-0" />
            <span className="text-xs font-headline font-bold uppercase tracking-widest text-slate-900">Live Floor Map</span>
            <span className="text-xs text-slate-500">| Grid Unit 1.2M</span>
            <div className="ml-auto flex items-center gap-1">
              {[ZoomIn, ZoomOut, Layers].map((Icon, i) => (
                <button key={i} className="p-1.5 border border-slate-300 hover:bg-slate-50 text-slate-600 hover:text-slate-900">
                  <Icon size={14} />
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center bg-slate-100 p-6">
            <div className="relative">
              <div
                className="grid gap-0.5"
                style={{ gridTemplateColumns: 'repeat(10, minmax(0, 1fr))', width: 'min(58vw, 520px)' }}
              >
                {Array.from({ length: 10 }, (_, row) =>
                  Array.from({ length: 10 }, (_, col) => {
                    const bin = binsByCell.get(`${col + 1}-${row + 1}`)
                    const picker = bin ? pickerByAisle.get(bin.aisle_id) : undefined
                    const pickerIdx = bin && picker ? pickerIndexByAisle.get(bin.aisle_id) : undefined
                    return <BinCell key={`${row}-${col}`} bin={bin} picker={picker} pickerIndex={pickerIdx} />
                  })
                )}
              </div>
              {/* Rack Labels */}
              <div className="absolute -right-16 top-0 h-full flex flex-col justify-around text-slate-500">
                {[1, 2, 3, 4, 5].map(rack => (
                  <div key={rack} className="text-xs font-headline font-bold uppercase tracking-widest" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                    Rack {String(rack).padStart(2, '0')}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-8 mt-5">
              {[
                { color: 'bg-primary-fixed', label: 'Active Picker' },
                { color: 'bg-error', label: 'Ghost Bin' },
                { color: 'bg-slate-300', label: 'Storage Rack' },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2 text-xs text-slate-600">
                  <span className={`w-3 h-3 ${item.color}`} />
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* ── Right Sidebar ── */}
        <aside className="w-80 bg-white border-l border-slate-200 flex flex-col shrink-0">
          <div className="p-5 border-b border-slate-200">
            <p className="text-xs font-headline font-bold uppercase tracking-widest text-slate-500 mb-4">Live Throughput</p>
            <div className="flex gap-0 mb-5">
              <div className="flex-1 pr-5">
                <p className="text-3xl font-black font-headline text-slate-900 leading-none">412</p>
                <p className="text-[10px] font-headline uppercase tracking-widest text-slate-500 mt-1">Units / Hour</p>
              </div>
              <div className="flex-1 pl-5 border-l border-slate-200">
                <p className="text-3xl font-black font-headline text-slate-900 leading-none">98.4%</p>
                <p className="text-[10px] font-headline uppercase tracking-widest text-slate-500 mt-1">Accuracy</p>
              </div>
            </div>
            <StatBar label="Zone Load" value="78" pct={78} suffix="%" />
            <StatBar label="Queue Depth" value="142 Orders" pct={60} />
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 shrink-0">
              <span className="text-xs font-headline font-bold uppercase tracking-widest text-slate-900">Agent Reasoning Log</span>
              <span className={`text-[10px] font-headline font-bold uppercase px-2.5 py-1 ${connected ? 'bg-primary-fixed text-on-primary-container animate-pulse' : 'bg-slate-200 text-slate-600'}`}>
                {connected ? 'Streaming' : 'Offline'}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {log.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-10">Awaiting events…</p>
              )}
              {log.map(entry => <LogRow key={entry.id} entry={entry} />)}
              <div ref={logEndRef} />
            </div>

            <div className="border-t border-slate-200 p-3 flex gap-2 shrink-0">
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && query.trim()) {
                    pushLog(`QUERY: ${query.trim()}`, 'info')
                    setQuery('')
                  }
                }}
                placeholder="Query agent reasoning..."
                className="flex-1 text-xs px-3 py-2 bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-primary-fixed"
              />
              <button
                onClick={() => { if (query.trim()) { pushLog(`QUERY: ${query.trim()}`, 'info'); setQuery('') } }}
                className="px-3 py-2 bg-primary-fixed text-on-primary-container hover:bg-primary/90"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
