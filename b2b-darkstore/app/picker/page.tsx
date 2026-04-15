'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import type { Picker, Task, AgentResponse } from '@/lib/types'
import {
  LayoutGrid, User, Package, CheckCircle2,
  AlertTriangle, Loader2, ArrowRight, Wifi, WifiOff, Route,
  ShoppingCart, Truck, Settings,
} from 'lucide-react'

// Use untyped client to avoid Supabase generic type conflicts
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type UIState =
  | 'selecting_picker'
  | 'idle'
  | 'task_active'
  | 'submitting'
  | 'success'
  | 'rerouted'
  | 'error'

export default function PickerApp() {
  const [pickers, setPickers] = useState<Picker[]>([])
  const [activePicker, setActivePicker] = useState<Picker | null>(null)
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [binLabel, setBinLabel] = useState('')
  const [aisleId, setAisleId] = useState('')
  const [uiState, setUiState] = useState<UIState>('selecting_picker')
  const [feedback, setFeedback] = useState('')
  const [connected, setConnected] = useState(false)

  // Load pickers on mount
  useEffect(() => {
    sb.from('pickers')
      .select('*')
      .then(({ data }) => {
        if (data) setPickers(data as Picker[])
      })
  }, [])

  // Fetch the picker's current open task
  const fetchTask = useCallback(async (picker: Picker) => {
    const { data } = await sb
      .from('tasks')
      .select('*')
      .eq('picker_id', picker.id)
      .is('completed_at', null)
      .order('assigned_at', { ascending: false })
      .limit(1)
      .single()

    if (data) {
      setActiveTask(data as Task)
      const { data: bin } = await sb
        .from('bins')
        .select('label, aisle_id')
        .eq('id', (data as Task).bin_id)
        .single()
      if (bin) {
        setBinLabel((bin as any).label)
        setAisleId((bin as any).aisle_id)
      }
      setUiState('task_active')
    } else {
      setUiState('idle')
    }
  }, [])

  // Realtime: listen for new tasks assigned to this picker
  useEffect(() => {
    if (!activePicker) return

    const channel = sb
      .channel(`picker-${activePicker.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tasks',
          filter: `picker_id=eq.${activePicker.id}`,
        },
        async (payload: any) => {
          const task = payload.new as Task
          setActiveTask(task)
          const { data: bin } = await sb
            .from('bins')
            .select('label, aisle_id')
            .eq('id', task.bin_id)
            .single()
          if (bin) {
            setBinLabel((bin as any).label)
            setAisleId((bin as any).aisle_id)
          }
          setUiState('task_active')
        }
      )
      .subscribe((status: string) => {
        setConnected(status === 'SUBSCRIBED')
      })

    return () => { sb.removeChannel(channel) }
  }, [activePicker])

  // Select a picker and fetch their task
  async function handlePickerSelect(picker: Picker) {
    setActivePicker(picker)
    await fetchTask(picker)
  }

  // Item Found — complete the task
  async function handleScanned() {
    if (!activeTask || !activePicker) return
    setUiState('submitting')

    await sb
      .from('tasks')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', activeTask.id)

    await sb
      .from('pickers')
      .update({ status: 'idle', current_aisle: null })
      .eq('id', activePicker.id)

    setFeedback('Task complete. Great work!')
    setActiveTask(null)
    setBinLabel('')
    setAisleId('')
    setUiState('success')
    setTimeout(() => setUiState('idle'), 2500)
  }

  // Item Missing — trigger ghost agent
  async function handleMissing() {
    if (!activeTask || !activePicker) return
    setUiState('submitting')

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'missing',
          picker_id: activePicker.id,
          bin_id: activeTask.bin_id,
        }),
      })
      const data: AgentResponse = await res.json()

      if (data.status === 'GHOSTING_FLAGGED') {
        setFeedback('Ghost agent alerted. Bin flagged for audit.')
        setActiveTask(null)
        setBinLabel('')
        setAisleId('')
        setUiState('idle')
      } else if (data.status === 'RE_ROUTE') {
        setFeedback(
          `Re-routed → Bin ${data.alternative_bin?.label} (Aisle ${data.alternative_bin?.aisle_id})`
        )
        setUiState('rerouted')
        setTimeout(() => fetchTask(activePicker), 1500)
      } else {
        setFeedback(data.message ?? 'Agent error.')
        setUiState('error')
      }
    } catch {
      setFeedback('Network error. Could not reach agent.')
      setUiState('error')
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-[480px] mx-auto relative">

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-surface-container-lowest border-b-2 border-outline-variant flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2">
          <LayoutGrid size={16} className="text-primary-fixed" />
          <span className="font-headline font-black italic uppercase text-primary-fixed tracking-tight text-sm">
            B2B Darkstore
          </span>
        </div>
        <div className="flex items-center gap-3">
          {activePicker && (
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-headline font-bold uppercase tracking-widest text-outline">
                Operator
              </span>
              <span className="text-xs font-bold text-on-surface">
                {activePicker.name.split(' ')[0].toUpperCase()}
              </span>
            </div>
          )}
          <div className="w-9 h-9 border-2 border-primary-fixed bg-surface-container flex items-center justify-center">
            <User size={16} className="text-primary" />
          </div>
          {connected
            ? <Wifi size={13} className="text-emerald-500" />
            : <WifiOff size={13} className="text-outline/50" />
          }
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 px-4 py-4 pb-24 flex flex-col gap-4">

        {/* SCREEN: picker selection */}
        {uiState === 'selecting_picker' && (
          <div className="flex flex-col gap-3">
            <div className="text-center py-4">
              <p className="font-headline font-bold uppercase tracking-widest text-xs text-outline mb-1">
                Select Profile
              </p>
              <p className="text-on-surface font-headline font-black text-lg">
                Who is picking today?
              </p>
            </div>
            {pickers.map(p => (
              <button
                key={p.id}
                onClick={() => handlePickerSelect(p)}
                className="w-full flex items-center gap-4 p-4 bg-surface-container-lowest border-2 border-outline-variant hover:border-primary-fixed hover:bg-surface-container-low transition-all text-left active:scale-[0.98]"
              >
                <div className="w-10 h-10 bg-primary-fixed/20 border border-primary-fixed flex items-center justify-center shrink-0">
                  <User size={18} className="text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-headline font-bold text-on-surface">{p.name}</p>
                  <p className={`text-xs font-headline font-bold uppercase tracking-widest ${p.status === 'picking' ? 'text-amber-500' : 'text-emerald-600'}`}>
                    {p.status === 'picking' ? 'Currently Picking' : 'Ready'}
                  </p>
                </div>
                <ArrowRight size={16} className="text-outline" />
              </button>
            ))}
          </div>
        )}

        {/* SCREEN: idle */}
        {uiState === 'idle' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20 text-center">
            <div className="w-16 h-16 border-2 border-outline-variant bg-surface-container flex items-center justify-center">
              <Package size={28} className="text-outline" />
            </div>
            <p className="font-headline font-bold text-on-surface">No active task.</p>
            <p className="text-sm text-outline">Waiting for assignment…</p>
            <button
              onClick={() => { setActivePicker(null); setUiState('selecting_picker') }}
              className="text-xs text-outline border border-outline-variant px-3 py-1.5 hover:bg-surface-container mt-2"
            >
              Switch Picker
            </button>
          </div>
        )}

        {/* SCREEN: task active */}
        {uiState === 'task_active' && activeTask && (
          <>
            {/* Task Card */}
            <div className="bg-surface-container-lowest border-2 border-primary-fixed relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-primary-fixed text-on-primary-container font-headline font-black text-[10px] uppercase tracking-widest px-2 py-1">
                Active Task
              </div>
              <div className="p-5">
                <p className="text-[10px] font-headline font-bold uppercase tracking-widest text-outline mb-1">
                  Location Bin
                </p>
                <h2 className="text-6xl font-black font-headline text-primary-container leading-none tracking-tighter mb-2">
                  {binLabel}
                </h2>
                <div className="flex items-center gap-2 text-on-surface-variant mb-4">
                  <Package size={15} className="text-primary shrink-0" />
                  <span className="text-base font-medium">{activeTask.sku_name}</span>
                </div>
                <div className="w-full aspect-square max-h-48 bg-surface-container border-4 border-surface-container-highest flex items-center justify-center mx-auto">
                  <Package size={48} className="text-outline/30" />
                </div>
              </div>
              <div className="border-t-2 border-surface-container-high px-5 py-3 flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-[9px] font-headline font-bold uppercase tracking-widest text-outline">
                    SKU ID
                  </p>
                  <p className="font-mono text-sm font-bold text-on-surface">
                    {activeTask.sku_name}
                  </p>
                </div>
                <div className="flex-1 border-l-2 border-surface-container-high pl-4">
                  <p className="text-[9px] font-headline font-bold uppercase tracking-widest text-outline">
                    Target Qty
                  </p>
                  <p className="font-headline text-2xl font-black text-primary leading-none">
                    04 <span className="text-xs text-outline font-normal">units</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3 h-44">
              <button
                onClick={handleScanned}
                className="bg-primary-container border-2 border-on-primary-container flex flex-col items-center justify-center gap-2 active:scale-[0.97] transition-transform"
              >
                <CheckCircle2 size={44} className="text-on-primary-container" strokeWidth={2.5} />
                <span className="font-headline font-black text-lg uppercase tracking-tight text-on-primary-container">
                  Item Found
                </span>
              </button>
              <button
                onClick={handleMissing}
                className="bg-surface-container-lowest border-2 border-error flex flex-col items-center justify-center gap-2 active:scale-[0.97] transition-transform"
              >
                <AlertTriangle size={44} className="text-error" strokeWidth={2.5} />
                <span className="font-headline font-black text-lg uppercase tracking-tight text-error">
                  Item Missing
                </span>
              </button>
            </div>

            {/* Snake Path Mini-Map */}
            <div className="bg-surface-container-low border-2 border-outline-variant p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Route size={12} className="text-outline" />
                  <span className="font-headline font-bold uppercase tracking-widest text-[10px] text-on-surface">
                    Warehouse Snake Path
                  </span>
                </div>
                <span className="text-[9px] font-headline font-bold uppercase bg-primary-fixed/20 text-primary px-2 py-0.5">
                  Next: Aisle B
                </span>
              </div>
              <div className="relative h-28 bg-surface-container-highest border border-outline-variant overflow-hidden">
                <div className="absolute inset-0 grid grid-cols-12 grid-rows-3 gap-0.5 p-1.5 opacity-20">
                  {Array.from({ length: 36 }).map((_, i) => (
                    <div key={i} className="bg-outline/30" />
                  ))}
                </div>
                <svg
                  className="absolute inset-0 w-full h-full"
                  viewBox="0 0 400 100"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M 20 80 L 100 80 L 100 20 L 180 20 L 180 80 L 260 80 L 260 20 L 340 20"
                    fill="none"
                    stroke="#02cbfc"
                    strokeWidth="4"
                    strokeLinecap="square"
                  />
                  <circle cx="180" cy="80" r="6" fill="#003347" />
                  <circle cx="180" cy="80" r="3" fill="#02cbfc" />
                </svg>
                <div className="absolute top-1.5 left-2 px-1.5 py-0.5 bg-white border border-outline text-[8px] font-bold">
                  AISLE A
                </div>
                <div className="absolute top-1.5 right-2 px-1.5 py-0.5 bg-white border border-outline text-[8px] font-bold">
                  AISLE C
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-white/90 border-2 border-primary px-2 py-1 text-[9px] font-bold font-headline animate-pulse">
                    YOU ARE HERE: {aisleId}-4
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* SCREEN: submitting */}
        {uiState === 'submitting' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20">
            <Loader2 size={36} className="animate-spin text-primary-fixed" />
            <p className="font-headline font-bold text-outline uppercase tracking-widest text-xs">
              Contacting agent…
            </p>
          </div>
        )}

        {/* SCREEN: success */}
        {uiState === 'success' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20 text-center">
            <div className="w-16 h-16 border-2 border-emerald-500 bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 size={28} className="text-emerald-600" />
            </div>
            <p className="font-headline font-bold text-emerald-600 uppercase tracking-widest text-sm">
              {feedback}
            </p>
          </div>
        )}

        {/* SCREEN: rerouted */}
        {uiState === 'rerouted' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20 text-center">
            <div className="w-16 h-16 border-2 border-amber-500 bg-amber-50 flex items-center justify-center">
              <ArrowRight size={28} className="text-amber-600" />
            </div>
            <p className="font-headline font-bold text-amber-600 uppercase tracking-widest text-sm">
              {feedback}
            </p>
            <p className="text-xs text-outline">Loading new task…</p>
          </div>
        )}

        {/* SCREEN: error */}
        {uiState === 'error' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20 text-center">
            <div className="w-16 h-16 border-2 border-error bg-red-50 flex items-center justify-center">
              <AlertTriangle size={28} className="text-error" />
            </div>
            <p className="font-headline font-bold text-error uppercase tracking-widest text-sm">
              {feedback}
            </p>
            <button
              onClick={() => setUiState(activeTask ? 'task_active' : 'idle')}
              className="text-xs border border-outline-variant px-4 py-2 text-outline hover:bg-surface-container mt-2"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* ── Bottom Nav ── */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] z-50 grid grid-cols-4 h-16 bg-surface-container-lowest border-t-2 border-outline-variant">
        {[
          { label: 'Inventory', icon: <Package size={18} />, active: true },
          { label: 'Orders', icon: <ShoppingCart size={18} />, active: false },
          { label: 'Routes', icon: <Truck size={18} />, active: false },
          { label: 'Admin', icon: <Settings size={18} />, active: false },
        ].map(item => (
          <button
            key={item.label}
            className={`flex flex-col items-center justify-center gap-1 h-full transition-colors ${
              item.active
                ? 'text-primary-fixed border-t-2 border-primary-fixed -mt-[2px]'
                : 'text-outline hover:text-on-surface'
            }`}
          >
            {item.icon}
            <span className="font-headline font-bold uppercase tracking-widest text-[9px]">
              {item.label}
            </span>
          </button>
        ))}
      </nav>
    </div>
  )
}