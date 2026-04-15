'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Bin, Picker, LogEntry } from '@/lib/types'
import {
  LayoutGrid, Package, ShoppingCart, BarChart3, Truck, Settings,
  TrendingUp, AlertTriangle, Activity, Zap, Send, ZoomIn, ZoomOut, Layers,
} from 'lucide-react'

// ── BinCell ───────────────────────────────────────────────────────
function BinCell({ bin, picker, pickerIndex }: { bin: Bin | undefined; picker: Picker | undefined; pickerIndex?: number }) {
  const isGhost = bin?.status === 'ghosting_suspected'
  const hasPicker = !!picker

  if (!bin) {
    return <div className="aspect-square bg-white border border-[#88b3cd]/30" style={{ borderRadius: '0' }} />
  }

  return (
    <div
      className={`relative aspect-square border flex flex-col items-center justify-center overflow-hidden cursor-default select-none transition-all duration-300 ${
        isGhost
          ? 'border-2 border-[#b31b25] bg-red-50 animate-pulse-red'
          : 'border border-[#02cbfc]/40 bg-white'
      }`}
      style={{ borderRadius: '0' }}
      title={`${bin.label} — Aisle ${bin.aisle_id} — ${bin.status}`}
    >
      {isGhost && (
        <div className="absolute top-1 right-1">
          <AlertTriangle size={10} className="text-[#b31b25]" />
        </div>
      )}
      {hasPicker && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-7 h-7 bg-[#02cbfc] flex items-center justify-center" style={{ borderRadius: '0' }}>
            <span className="text-[9px] font-bold text-[#003347] font-mono">P-{String(pickerIndex).padStart(2, '0')}</span>
          </div>
        </div>
      )}
      <span className="text-[7px] font-mono text-[#527c95] leading-none">{bin.label}</span>
    </div>
  )
}

// ── LogRow ────────────────────────────────────────────────────────
function LogRow({ entry }: { entry: LogEntry }) {
  const styles = {
    info:  { border: 'border-l-4 border-cyan-400', bg: 'bg-white', icon: <Activity size={12} className="text-cyan-400 shrink-0" />, text: 'text-[#003347]', agent: 'text-cyan-600' },
    warn:  { border: 'border-l-4 border-amber-400', bg: 'bg-amber-50', icon: <Zap size={12} className="text-amber-500 shrink-0" />, text: 'text-amber-900', agent: 'text-amber-700' },
    alert: { border: 'border-l-4 border-red-600', bg: 'bg-red-50', icon: <AlertTriangle size={12} className="text-red-600 shrink-0" />, text: 'text-red-900 font-bold', agent: 'text-red-700' },
  }
  const s = styles[entry.level]

  return (
    <div className={`${s.border} ${s.bg} p-3 mb-2`} style={{ borderRadius: '0' }}>
      <div className="flex items-start gap-2 mb-1">
        {s.icon}
        <span className={`text-[10px] font-mono ${s.agent} font-bold`}>[{entry.timestamp}]</span>
        <span className={`text-[10px] font-bold ${s.agent} uppercase tracking-wide`}>AGENT_CORE</span>
      </div>
      <p className={`text-xs leading-tight ${s.text} ml-6`}>{entry.message}</p>
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
      { id: crypto.randomUUID(), timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }), message, level },
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
      pushLog(`System initialized. ${binsData?.length ?? 0} bins, ${pickersData?.length ?? 0} pickers online.`)
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
            pushLog(`GHOST ALERT: Bin ${updated.label} (Aisle ${updated.aisle_id}) flagged for inventory audit.`, 'alert')
          } else {
            pushLog(`Bin ${updated.label} status updated → ${updated.status}.`, 'info')
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
    <div className="h-screen flex bg-[#eff8ff] overflow-hidden font-body">
      {/* ── Left Sidebar ── */}
      <aside className="w-56 bg-white border-r border-[#88b3cd] flex flex-col shrink-0">
        <div className="p-5 border-b border-[#88b3cd]">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 bg-[#02cbfc]/20 border border-[#02cbfc] flex items-center justify-center" style={{ borderRadius: '0' }}>
              <LayoutGrid size={16} className="text-[#02cbfc]" />
            </div>
            <div>
              <p className="text-xs font-headline font-bold uppercase text-[#02cbfc] tracking-wider">Zone Alpha-7</p>
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
            <button key={item.label} className={`w-full flex items-center gap-3 px-3 py-3 text-xs font-headline uppercase tracking-widest mb-1 transition-colors ${item.active ? 'text-[#02cbfc] font-bold border-l-2 border-[#02cbfc] bg-[#02cbfc]/5' : 'text-[#527c95] hover:text-[#003347]'}`} style={{ borderRadius: '0' }}>
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-[#88b3cd] space-y-3">
          <div className="p-3 bg-[#eff8ff] border border-[#88b3cd]" style={{ borderRadius: '0' }}>
            <p className="text-[10px] font-headline uppercase tracking-widest text-[#527c95] mb-1">Active Pickers</p>
            <p className={`text-xl font-black font-headline ${activePickers > 0 ? 'text-[#02cbfc]' : 'text-[#527c95]'}`}>
              {activePickers}
              <span className="text-xs text-[#527c95] font-normal"> / {pickers.length}</span>
            </p>
          </div>
          <div className="p-3 bg-[#eff8ff] border border-[#88b3cd]" style={{ borderRadius: '0' }}>
            <p className="text-[10px] font-headline uppercase tracking-widest text-[#527c95] mb-1">Ghost Alerts</p>
            <p className={`text-xl font-black font-headline ${ghostCount > 0 ? 'text-[#b31b25] animate-pulse' : 'text-[#527c95]'}`}>
              {ghostCount}
            </p>
          </div>
          <div className="p-3 bg-[#eff8ff] border border-[#88b3cd]" style={{ borderRadius: '0' }}>
            <p className="text-[10px] font-headline uppercase tracking-widest text-[#527c95] mb-1">Bin Health</p>
            <p className={`text-xl font-black font-headline ${healthPct > 80 ? 'text-emerald-600' : 'text-amber-500'}`}>
              {healthPct}%
            </p>
          </div>
          <button className="w-full py-3 bg-[#02cbfc] text-[#003347] font-headline font-black uppercase tracking-widest text-xs hover:bg-[#02cbfc]/90 transition-colors" style={{ borderRadius: '0' }}>
            Create Batch
          </button>
        </div>

        <div className="p-4 border-t border-[#88b3cd]">
          <button className="w-full flex items-center gap-2 text-xs text-[#527c95] hover:text-[#003347] py-2">
            <Settings size={13} /> Support
          </button>
          <button className="w-full flex items-center gap-2 text-xs text-[#527c95] hover:text-[#003347] py-2">
            <TrendingUp size={13} /> Sign Out
          </button>
        </div>
      </aside>

      {/* ── Center: Grid ── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="h-12 bg-white border-b border-[#88b3cd] flex items-center px-5 gap-3 shrink-0">
          <span className="w-3 h-3 bg-[#02cbfc] shrink-0" style={{ borderRadius: '0' }} />
          <span className="text-xs font-headline font-bold uppercase tracking-widest text-[#003347]">Live Floor Map</span>
          <span className="text-xs text-[#527c95]">| Grid Unit 1.2M</span>
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-1">
              {[ZoomIn, ZoomOut, Layers].map((Icon, i) => (
                <button key={i} className="p-1.5 border border-[#88b3cd] hover:bg-[#eff8ff] text-[#527c95]" style={{ borderRadius: '0' }}>
                  <Icon size={14} />
                </button>
              ))}
            </div>
            <div className={`flex items-center gap-2 text-xs font-mono ${connected ? 'text-emerald-600' : 'text-[#b31b25]'}`}>
              <span className={`w-2 h-2 ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-[#b31b25]'}`} style={{ borderRadius: '9999px' }} />
              {connected ? 'LIVE' : 'OFFLINE'}
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center bg-[#eff8ff] p-6">
          <div className="relative">
            <div
              className="grid gap-0.5"
              style={{ gridTemplateColumns: 'repeat(10, minmax(0, 1fr))', width: '520px' }}
            >
              {Array.from({ length: 10 }, (_, row) => {
                const cells = Array.from({ length: 10 }, (_, col) => {
                  const bin = binsByCell.get(`${col + 1}-${row + 1}`)
                  const picker = bin ? pickerByAisle.get(bin.aisle_id) : undefined
                  const pickerIdx = bin && picker ? pickerIndexByAisle.get(bin.aisle_id) : undefined
                  return <BinCell key={`${row}-${col}`} bin={bin} picker={picker} pickerIndex={pickerIdx} />
                })
                
                // Add rack shelf after every 2 rows
                if ((row + 1) % 2 === 0) {
                  return (
                    <div key={`row-${row}`} className="contents">
                      {cells}
                      <div className="col-span-10 h-6 bg-[#88b3cd]/30 border-y border-[#88b3cd]/50 flex items-center justify-end pr-2" style={{ borderRadius: '0' }}>
                        <span className="text-[9px] font-headline font-bold uppercase tracking-widest text-[#527c95]">
                          Rack {String(Math.floor((row + 1) / 2)).padStart(2, '0')}
                        </span>
                      </div>
                    </div>
                  )
                }
                return cells
              })}
            </div>
          </div>
          <div className="flex gap-8 mt-5">
            {[
              { color: 'bg-[#02cbfc]', label: 'Active Picker' },
              { color: 'bg-[#b31b25]', label: 'Congestion Point' },
              { color: 'bg-[#88b3cd]', label: 'Storage Rack' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2 text-xs text-[#527c95]">
                <span className={`w-3 h-3 ${item.color}`} style={{ borderRadius: '0' }} />
                {item.label}
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ── Right Sidebar ── */}
      <aside className="w-80 bg-white border-l border-[#88b3cd] flex flex-col shrink-0">
        <div className="p-5 border-b border-[#88b3cd]">
          <p className="text-xs font-headline font-bold uppercase tracking-widest text-[#527c95] mb-4">Live Throughput</p>
          <div className="flex gap-0 mb-5">
            <div className="flex-1 pr-5">
              <p className="text-3xl font-black font-headline text-[#003347] leading-none">412</p>
              <p className="text-[10px] font-headline uppercase tracking-widest text-[#527c95] mt-1">Units / Hour</p>
            </div>
            <div className="flex-1 pl-5 border-l border-[#88b3cd]">
              <p className="text-3xl font-black font-headline text-[#003347] leading-none">98.4%</p>
              <p className="text-[10px] font-headline uppercase tracking-widest text-[#527c95] mt-1">Accuracy</p>
            </div>
          </div>
          <div className="mb-3">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-headline font-bold uppercase tracking-widest text-[#527c95]">Zone Load</span>
              <span className="text-xs font-bold text-[#003347]">78%</span>
            </div>
            <div className="h-1 bg-[#eff8ff]" style={{ borderRadius: '0' }}>
              <div className="h-full bg-[#02cbfc] transition-all duration-500" style={{ width: '78%', borderRadius: '0' }} />
            </div>
          </div>
          <div className="mb-3">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-headline font-bold uppercase tracking-widest text-[#527c95]">Queue Depth</span>
              <span className="text-xs font-bold text-[#003347]">142 Orders</span>
            </div>
            <div className="h-1 bg-[#eff8ff]" style={{ borderRadius: '0' }}>
              <div className="h-full bg-[#02cbfc] transition-all duration-500" style={{ width: '60%', borderRadius: '0' }} />
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#88b3cd] shrink-0">
            <span className="text-xs font-headline font-bold uppercase tracking-widest text-[#003347]">Agent Reasoning Log</span>
            <span className={`text-[10px] font-headline font-bold uppercase px-2.5 py-1 ${connected ? 'bg-[#02cbfc] text-[#003347] animate-pulse' : 'bg-[#eff8ff] text-[#527c95]'}`} style={{ borderRadius: '0' }}>
              {connected ? 'Streaming' : 'Offline'}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {log.length === 0 && (
              <p className="text-xs text-[#527c95] text-center py-10">Awaiting events…</p>
            )}
            {log.map(entry => <LogRow key={entry.id} entry={entry} />)}
            <div ref={logEndRef} />
          </div>

          <div className="border-t border-[#88b3cd] p-3 flex gap-2 shrink-0">
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
              className="flex-1 text-xs px-3 py-2 bg-[#eff8ff] border border-[#88b3cd] text-[#003347] placeholder:text-[#527c95] focus:outline-none focus:border-[#02cbfc]"
              style={{ borderRadius: '0' }}
            />
            <button
              onClick={() => { if (query.trim()) { pushLog(`QUERY: ${query.trim()}`, 'info'); setQuery('') } }}
              className="px-3 py-2 bg-[#02cbfc] text-[#003347] hover:bg-[#02cbfc]/90"
              style={{ borderRadius: '0' }}
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </aside>
    </div>
  )
}
