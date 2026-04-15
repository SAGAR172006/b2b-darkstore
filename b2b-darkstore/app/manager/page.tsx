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
function BinCell({ bin, picker }: { bin: Bin | undefined; picker: Picker | undefined }) {
  const isGhost = bin?.status === 'ghosting_suspected'
  const hasPicker = !!picker

  if (!bin) {
    return <div className="aspect-square bg-surface-container-high/30 border border-outline-variant/20" />
  }

  return (
    <div
      className={[
        'relative aspect-square border flex flex-col items-center justify-center overflow-hidden cursor-default select-none transition-all duration-300',
        isGhost
          ? 'border-2 border-error bg-red-50'
          : 'border border-primary-fixed/40 bg-surface-container',
      ].join(' ')}
      style={isGhost ? {
        animation: 'pulse-red 1.4s ease-in-out infinite',
        boxShadow: '0 0 0 0 rgba(179,27,37,0.5)',
      } : {}}
      title={`${bin.label} — Aisle ${bin.aisle_id} — ${bin.status}`}
    >
      {isGhost && (
        <div className="absolute top-0.5 right-0.5">
          <AlertTriangle size={8} className="text-error" />
        </div>
      )}
      {hasPicker && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-4 h-4 rounded-full bg-primary-fixed/30 border border-primary-fixed flex items-center justify-center animate-pulse">
            <User size={8} className="text-primary" />
          </div>
        </div>
      )}
      <span className="text-[7px] font-mono text-on-surface-variant/60 leading-none">{bin.label}</span>
    </div>
  )
}

// ── LogRow ────────────────────────────────────────────────────────
function LogRow({ entry }: { entry: LogEntry }) {
  const styles = {
    info:  { icon: <Activity size={10} className="text-primary-fixed shrink-0 mt-0.5" />, text: 'text-on-surface-variant' },
    warn:  { icon: <Zap size={10} className="text-amber-500 shrink-0 mt-0.5" />, text: 'text-amber-600' },
    alert: { icon: <AlertTriangle size={10} className="text-error shrink-0 mt-0.5" />, text: 'text-error font-semibold' },
  }
  const s = styles[entry.level]

  return (
    <div className={`flex gap-2 py-1.5 border-b border-outline-variant/20 last:border-0 ${entry.level === 'alert' ? 'border-l-2 border-l-error pl-2' : ''}`}>
      {s.icon}
      <span className="text-[10px] font-mono text-outline shrink-0">{entry.timestamp}</span>
      <span className={`text-[11px] leading-tight ${s.text}`}>{entry.message}</span>
    </div>
  )
}

// ── StatBar ───────────────────────────────────────────────────────
function StatBar({ label, value, pct, suffix }: { label: string; value: string; pct: number; suffix?: string }) {
  return (
    <div className="mb-3">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] font-headline font-bold uppercase tracking-widest text-outline">{label}</span>
        <span className="text-[11px] font-bold text-on-surface">{value}{suffix}</span>
      </div>
      <div className="h-1 bg-surface-container-highest">
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
  pickers.forEach(p => { if (p.current_aisle) pickerByAisle.set(p.current_aisle, p) })

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
    <div className="h-screen flex flex-col bg-background overflow-hidden font-body">
      {/* ── Top Bar ── */}
      <header className="h-12 bg-surface-container-lowest border-b-2 border-outline-variant flex items-center px-4 gap-6 shrink-0">
        <div className="flex items-center gap-2">
          <LayoutGrid size={16} className="text-primary-fixed" />
          <span className="font-headline font-black italic uppercase text-primary-fixed tracking-tight text-sm">CyanTech Ops</span>
        </div>
        <nav className="flex items-center gap-5 ml-4">
          {['Dashboard', 'Inventory', 'Orders'].map((item, i) => (
            <button key={item} className={`text-xs font-headline font-bold uppercase tracking-widest pb-0.5 ${i === 0 ? 'text-primary-fixed border-b-2 border-primary-fixed' : 'text-outline hover:text-on-surface'}`}>
              {item}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <button className="text-xs font-headline font-bold uppercase tracking-widest px-3 py-1 border border-primary-fixed text-primary-fixed hover:bg-primary-fixed/10">Active Pickers</button>
          <button className="text-xs font-headline font-bold uppercase tracking-widest px-3 py-1 bg-error text-on-error hover:bg-error/90">Congestion Alerts</button>
          <div className={`flex items-center gap-1.5 text-xs font-mono ${connected ? 'text-emerald-600' : 'text-error'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-error'}`} />
            {connected ? 'LIVE' : 'OFFLINE'}
          </div>
          {connected ? <Wifi size={14} className="text-emerald-500" /> : <WifiOff size={14} className="text-error" />}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Sidebar ── */}
        <aside className="w-52 bg-surface-container-lowest border-r border-outline-variant flex flex-col shrink-0">
          <div className="p-4 border-b border-outline-variant">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 bg-primary-fixed/20 border border-primary-fixed flex items-center justify-center">
                <LayoutGrid size={14} className="text-primary-fixed" />
              </div>
              <div>
                <p className="text-[10px] font-headline font-black uppercase text-primary-fixed">Zone Alpha-7</p>
                <p className="text-[9px] text-emerald-600 font-bold uppercase tracking-widest">Operational</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-2">
            {[
              { label: 'Dashboard', icon: <LayoutGrid size={14} />, active: true },
              { label: 'Inventory', icon: <Package size={14} />, active: false },
              { label: 'Orders', icon: <ShoppingCart size={14} />, active: false },
              { label: 'Analytics', icon: <BarChart3 size={14} />, active: false },
              { label: 'Fleet', icon: <Truck size={14} />, active: false },
            ].map(item => (
              <button key={item.label} className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-headline font-bold uppercase tracking-widest mb-0.5 transition-colors ${item.active ? 'text-primary-fixed bg-primary-fixed/10 border-l-2 border-primary-fixed' : 'text-outline hover:text-on-surface hover:bg-surface-container'}`}>
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>

          <div className="p-3 border-t border-outline-variant space-y-2">
            <div className="p-2 bg-surface-container border border-outline-variant/50">
              <p className="text-[9px] font-headline uppercase tracking-widest text-outline mb-1">Active Pickers</p>
              <p className={`text-lg font-black font-headline ${activePickers > 0 ? 'text-primary-fixed' : 'text-outline'}`}>
                {activePickers}
                <span className="text-[10px] text-outline font-normal"> / {pickers.length}</span>
              </p>
            </div>
            <div className="p-2 bg-surface-container border border-outline-variant/50">
              <p className="text-[9px] font-headline uppercase tracking-widest text-outline mb-1">Ghost Alerts</p>
              <p className={`text-lg font-black font-headline ${ghostCount > 0 ? 'text-error animate-pulse' : 'text-outline'}`}>
                {ghostCount}
              </p>
            </div>
            <div className="p-2 bg-surface-container border border-outline-variant/50">
              <p className="text-[9px] font-headline uppercase tracking-widest text-outline mb-1">Bin Health</p>
              <p className={`text-lg font-black font-headline ${healthPct > 80 ? 'text-emerald-600' : 'text-amber-500'}`}>
                {healthPct}%
              </p>
            </div>
            <button className="w-full py-2 bg-primary-fixed text-on-primary-container font-headline font-black uppercase tracking-widest text-xs hover:bg-primary/90 transition-colors">
              Create Batch
            </button>
          </div>

          <div className="p-3 border-t border-outline-variant">
            <button className="w-full flex items-center gap-2 text-[10px] text-outline hover:text-on-surface py-1">
              <Settings size={11} /> Support
            </button>
            <button className="w-full flex items-center gap-2 text-[10px] text-outline hover:text-on-surface py-1">
              <TrendingUp size={11} /> Sign Out
            </button>
          </div>
        </aside>

        {/* ── Center: Grid ── */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="h-9 bg-surface-container-lowest border-b border-outline-variant flex items-center px-4 gap-3 shrink-0">
            <span className="w-2 h-2 bg-primary-fixed shrink-0" />
            <span className="text-[10px] font-headline font-bold uppercase tracking-widest text-on-surface">Live Floor Map</span>
            <span className="text-[10px] text-outline">| Grid Unit 1.2M</span>
            <div className="ml-auto flex items-center gap-1">
              {[ZoomIn, ZoomOut, Layers].map((Icon, i) => (
                <button key={i} className="p-1 border border-outline-variant hover:bg-surface-container text-outline hover:text-on-surface">
                  <Icon size={12} />
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center bg-surface-container-low p-4">
            <div
              className="grid gap-0.5"
              style={{ gridTemplateColumns: 'repeat(10, minmax(0, 1fr))', width: 'min(55vw, 480px)' }}
            >
              {Array.from({ length: 10 }, (_, row) =>
                Array.from({ length: 10 }, (_, col) => {
                  const bin = binsByCell.get(`${col + 1}-${row + 1}`)
                  const picker = bin ? pickerByAisle.get(bin.aisle_id) : undefined
                  return <BinCell key={`${row}-${col}`} bin={bin} picker={picker} />
                })
              )}
            </div>
            <div className="flex gap-6 mt-3">
              {[
                { color: 'bg-primary-fixed', label: 'Active Picker' },
                { color: 'bg-error', label: 'Congestion Point' },
                { color: 'bg-outline-variant', label: 'Storage Rack' },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-1.5 text-[10px] text-outline">
                  <span className={`w-2 h-2 ${item.color}`} />
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* ── Right Sidebar ── */}
        <aside className="w-80 bg-surface-container-lowest border-l border-outline-variant flex flex-col shrink-0">
          <div className="p-4 border-b border-outline-variant">
            <p className="text-[10px] font-headline font-bold uppercase tracking-widest text-outline mb-3">Live Throughput</p>
            <div className="flex gap-0 mb-4">
              <div className="flex-1 pr-4">
                <p className="text-2xl font-black font-headline text-on-surface leading-none">412</p>
                <p className="text-[9px] font-headline uppercase tracking-widest text-outline mt-0.5">Units / Hour</p>
              </div>
              <div className="flex-1 pl-4 border-l border-outline-variant">
                <p className="text-2xl font-black font-headline text-on-surface leading-none">98.4%</p>
                <p className="text-[9px] font-headline uppercase tracking-widest text-outline mt-0.5">Accuracy</p>
              </div>
            </div>
            <StatBar label="Zone Load" value="78" pct={78} suffix="%" />
            <StatBar label="Queue Depth" value="142 Orders" pct={60} />
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-outline-variant shrink-0">
              <span className="text-[10px] font-headline font-bold uppercase tracking-widest text-on-surface">Agent Reasoning Log</span>
              <span className={`text-[9px] font-headline font-bold uppercase px-2 py-0.5 ${connected ? 'bg-primary-fixed text-on-primary-container' : 'bg-surface-container text-outline'}`}>
                {connected ? 'Streaming' : 'Offline'}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-2">
              {log.length === 0 && (
                <p className="text-[11px] text-outline text-center py-8">Awaiting events…</p>
              )}
              {log.map(entry => <LogRow key={entry.id} entry={entry} />)}
              <div ref={logEndRef} />
            </div>

            <div className="border-t border-outline-variant p-2 flex gap-2 shrink-0">
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
                className="flex-1 text-xs px-2 py-1.5 bg-surface-container border border-outline-variant text-on-surface placeholder:text-outline focus:outline-none focus:border-primary-fixed"
              />
              <button
                onClick={() => { if (query.trim()) { pushLog(`QUERY: ${query.trim()}`, 'info'); setQuery('') } }}
                className="px-2 py-1.5 bg-primary-fixed text-on-primary-container hover:bg-primary/90"
              >
                <Send size={12} />
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
