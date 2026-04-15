'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Picker, Task, AgentResponse } from '@/lib/types'
import {
  LayoutGrid, User, Package, CheckCircle2,
  AlertTriangle, Loader2, ArrowRight, Wifi, WifiOff, Route,
  ShoppingCart, Truck, Settings,
} from 'lucide-react'

type UIState = 'selecting_picker' | 'idle' | 'task_active' | 'submitting' | 'success' | 'rerouted' | 'error'

export default function PickerApp() {
  const [pickers, setPickers] = useState<Picker[]>([])
  const [activePicker, setActivePicker] = useState<Picker | null>(null)
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [binLabel, setBinLabel] = useState('')
  const [aisleId, setAisleId] = useState('')
  const [uiState, setUiState] = useState<UIState>('selecting_picker')
  const [feedback, setFeedback] = useState('')
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    supabase.from('pickers').select('*').then(({ data }) => {
      if (data) setPickers(data as Picker[])
    })
  }, [])

  const fetchTask = useCallback(async (picker: Picker) => {
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('picker_id', picker.id)
      .is('completed_at', null)
      .order('assigned_at', { ascending: false })
      .limit(1)
      .single()

    if (data) {
      setActiveTask(data as Task)
      const { data: bin } = await supabase
        .from('bins')
        .select('label, aisle_id')
        .eq('id', (data as Task).bin_id)
        .single()
      if (bin) {
        setBinLabel(bin.label)
        setAisleId(bin.aisle_id)
      }
      setUiState('task_active')
    } else {
      setUiState('idle')
    }
  }, [])

  useEffect(() => {
    if (!activePicker) return

    const channel = supabase
      .channel(`picker-${activePicker.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tasks', filter: `picker_id=eq.${activePicker.id}` },
        async (payload) => {
          const task = payload.new as Task
          setActiveTask(task)
          const { data: bin } = await supabase
            .from('bins')
            .select('label, aisle_id')
            .eq('id', task.bin_id)
            .single()
          if (bin) {
            setBinLabel(bin.label)
            setAisleId(bin.aisle_id)
          }
          setUiState('task_active')
        }
      )
      .subscribe(status => setConnected(status === 'SUBSCRIBED'))

    return () => { supabase.removeChannel(channel) }
  }, [activePicker])

  async function handlePickerSelect(picker: Picker) {
    setActivePicker(picker)
    await fetchTask(picker)
  }

  async function handleScanned() {
    if (!activeTask || !activePicker) return
    setUiState('submitting')

    await supabase
      .from('tasks')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', activeTask.id)

    await supabase
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
        setFeedback(`Re-routed → Bin ${data.alternative_bin?.label} (Aisle ${data.alternative_bin?.aisle_id})`)
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
    <div className="min-h-screen bg-slate-50 flex flex-col max-w-[480px] mx-auto relative">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-white border-b-2 border-slate-200 flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2">
          <LayoutGrid size={18} className="text-primary-fixed" />
          <span className="font-headline font-black italic uppercase text-primary-fixed tracking-tight text-lg">B2B Darkstore</span>
        </div>
        <div className="flex items-center gap-3">
          {activePicker && (
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-headline font-bold uppercase tracking-widest text-slate-500">Operator</span>
              <span className="text-sm font-bold text-slate-900">{activePicker.name.split(' ')[0].toUpperCase()}</span>
            </div>
          )}
          <div className="w-10 h-10 border-2 border-primary-fixed bg-slate-50 flex items-center justify-center">
            <User size={18} className="text-primary" />
          </div>
          {connected
            ? <Wifi size={15} className="text-emerald-500" />
            : <WifiOff size={15} className="text-slate-400" />
          }
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 px-5 py-5 pb-24 flex flex-col gap-5">
        {/* SCREEN: picker selection */}
        {uiState === 'selecting_picker' && (
          <div className="flex flex-col gap-4">
            <div className="text-center py-5">
              <p className="font-headline font-bold uppercase tracking-widest text-xs text-slate-500 mb-2">Select Profile</p>
              <p className="text-slate-900 font-headline font-black text-xl">Who is picking today?</p>
            </div>
            {pickers.map(p => (
              <button
                key={p.id}
                onClick={() => handlePickerSelect(p)}
                className="w-full flex items-center gap-4 p-5 bg-white border-2 border-slate-200 hover:border-primary-fixed hover:bg-slate-50 transition-all text-left active:scale-[0.98] relative overflow-hidden group"
              >
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary-fixed opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="w-12 h-12 bg-primary-fixed/20 border border-primary-fixed flex items-center justify-center shrink-0">
                  <User size={20} className="text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-headline font-bold text-slate-900 text-base">{p.name}</p>
                  <p className={`text-xs font-headline font-bold uppercase tracking-widest ${p.status === 'picking' ? 'text-amber-500' : 'text-emerald-600'}`}>
                    {p.status === 'picking' ? 'Currently Picking' : 'Ready'}
                  </p>
                </div>
                <ArrowRight size={18} className="text-slate-400" />
              </button>
            ))}
          </div>
        )}

        {/* SCREEN: idle */}
        {uiState === 'idle' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 py-24 text-center">
            <div className="w-20 h-20 border-2 border-slate-300 bg-white flex items-center justify-center">
              <Package size={32} className="text-slate-400" />
            </div>
            <p className="font-headline font-bold text-slate-900 text-lg">No active task.</p>
            <p className="text-sm text-slate-600">Waiting for assignment…</p>
            <button
              onClick={() => { setActivePicker(null); setUiState('selecting_picker') }}
              className="text-sm text-slate-600 border border-slate-300 px-4 py-2 hover:bg-slate-50 mt-3"
            >
              Switch Picker
            </button>
          </div>
        )}

        {/* SCREEN: task active */}
        {uiState === 'task_active' && activeTask && (
          <>
            {/* Task Card */}
            <div className="bg-white border-2 border-primary-fixed relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-primary-fixed text-on-primary-container font-headline font-black text-xs uppercase tracking-widest px-3 py-1.5">
                Active Task
              </div>
              <div className="p-6">
                <p className="text-xs font-headline font-bold uppercase tracking-widest text-slate-500 mb-2">Location Bin</p>
                <h2 className="text-7xl md:text-8xl font-black font-headline text-primary-container leading-none tracking-tighter mb-3">
                  {binLabel}
                </h2>
                <div className="flex items-center gap-2 text-slate-700 mb-5">
                  <Package size={16} className="text-primary shrink-0" />
                  <span className="text-base font-medium">{activeTask.sku_name}</span>
                </div>
                <div className="w-full aspect-square max-h-52 bg-slate-100 border-4 border-slate-200 flex items-center justify-center mx-auto">
                  <Package size={56} className="text-slate-300" />
                </div>
              </div>
              <div className="border-t-2 border-slate-100 px-6 py-4 flex items-center gap-5">
                <div className="flex-1">
                  <p className="text-[10px] font-headline font-bold uppercase tracking-widest text-slate-500">SKU ID</p>
                  <p className="font-mono text-sm font-bold text-slate-900 mt-1">{activeTask.sku_name}</p>
                </div>
                <div className="flex-1 border-l-2 border-slate-200 pl-5">
                  <p className="text-[10px] font-headline font-bold uppercase tracking-widest text-slate-500">Target Qty</p>
                  <p className="font-headline text-3xl font-black text-primary leading-none mt-1">
                    04 <span className="text-sm text-slate-500 font-normal">units</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-4 h-52">
              <button
                onClick={handleScanned}
                className="bg-primary-container border-2 border-primary flex flex-col items-center justify-center gap-3 active:scale-[0.97] transition-transform"
              >
                <CheckCircle2 size={52} className="text-on-primary-container" strokeWidth={2} />
                <span className="font-headline font-black text-xl uppercase tracking-tight text-on-primary-container">Item Found</span>
              </button>
              <button
                onClick={handleMissing}
                className="bg-white border-2 border-error flex flex-col items-center justify-center gap-3 active:scale-[0.97] transition-transform"
              >
                <AlertTriangle size={52} className="text-error" strokeWidth={2} />
                <span className="font-headline font-black text-xl uppercase tracking-tight text-error">Item Missing</span>
              </button>
            </div>

            {/* Snake Path Mini-Map */}
            <div className="bg-white border-2 border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Route size={14} className="text-slate-500" />
                  <span className="font-headline font-bold uppercase tracking-widest text-xs text-slate-900">Warehouse Snake Path</span>
                </div>
                <span className="text-[10px] font-headline font-bold uppercase bg-primary-fixed/20 text-primary px-2.5 py-1">Next: Aisle B</span>
              </div>
              <div className="relative h-36 bg-slate-100 border border-slate-300 overflow-hidden">
                <div className="absolute inset-0 grid grid-cols-12 grid-rows-3 gap-0.5 p-2 opacity-20">
                  {Array.from({ length: 36 }).map((_, i) => (
                    <div key={i} className="bg-slate-400" />
                  ))}
                </div>
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 100" preserveAspectRatio="none">
                  <path
                    d="M 20 80 L 100 80 L 100 20 L 180 20 L 180 80 L 260 80 L 260 20 L 340 20"
                    fill="none"
                    stroke="#02cbfc"
                    strokeWidth="5"
                    strokeLinecap="square"
                  />
                  <circle cx="180" cy="80" r="7" fill="#003347" />
                  <circle cx="180" cy="80" r="4" fill="#02cbfc" />
                </svg>
                <div className="absolute top-2 left-3 px-2 py-1 bg-white border border-slate-400 text-[9px] font-bold">AISLE A</div>
                <div className="absolute top-2 right-3 px-2 py-1 bg-white border border-slate-400 text-[9px] font-bold">AISLE C</div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-white/95 border-2 border-primary px-3 py-1.5 text-[10px] font-bold font-headline animate-pulse">
                    YOU ARE HERE: {aisleId}-4
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* SCREEN: submitting */}
        {uiState === 'submitting' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 py-24">
            <Loader2 size={40} className="animate-spin text-primary-fixed" />
            <p className="font-headline font-bold text-slate-600 uppercase tracking-widest text-sm">Contacting agent…</p>
          </div>
        )}

        {/* SCREEN: success */}
        {uiState === 'success' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 py-24 text-center">
            <div className="w-20 h-20 border-2 border-emerald-500 bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 size={32} className="text-emerald-600" />
            </div>
            <p className="font-headline font-bold text-emerald-600 uppercase tracking-widest text-base">{feedback}</p>
          </div>
        )}

        {/* SCREEN: rerouted */}
        {uiState === 'rerouted' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 py-24 text-center">
            <div className="w-20 h-20 border-2 border-amber-500 bg-amber-50 flex items-center justify-center">
              <ArrowRight size={32} className="text-amber-600" />
            </div>
            <p className="font-headline font-bold text-amber-600 uppercase tracking-widest text-base">{feedback}</p>
            <p className="text-sm text-slate-600">Loading new task…</p>
          </div>
        )}

        {/* SCREEN: error */}
        {uiState === 'error' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 py-24 text-center">
            <div className="w-20 h-20 border-2 border-error bg-red-50 flex items-center justify-center">
              <AlertTriangle size={32} className="text-error" />
            </div>
            <p className="font-headline font-bold text-error uppercase tracking-widest text-base">{feedback}</p>
            <button
              onClick={() => setUiState(activeTask ? 'task_active' : 'idle')}
              className="text-sm border border-slate-300 px-5 py-2.5 text-slate-700 hover:bg-slate-50 mt-3"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* ── Bottom Nav ── */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] z-50 grid grid-cols-4 h-16 bg-white border-t-2 border-slate-200">
        {[
          { label: 'Inventory', icon: <Package size={20} />, active: true },
          { label: 'Orders', icon: <ShoppingCart size={20} />, active: false },
          { label: 'Routes', icon: <Truck size={20} />, active: false },
          { label: 'Admin', icon: <Settings size={20} />, active: false },
        ].map(item => (
          <button
            key={item.label}
            className={`flex flex-col items-center justify-center gap-1 h-full transition-colors ${
              item.active
                ? 'text-primary-fixed border-t-2 border-primary-fixed -mt-[2px]'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {item.icon}
            <span className="font-headline font-bold uppercase tracking-widest text-[10px]">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
