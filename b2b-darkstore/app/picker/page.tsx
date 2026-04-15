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
    <div className="min-h-screen bg-[#eff8ff] flex flex-col max-w-[480px] mx-auto relative">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-white border-b-2 border-[#88b3cd] flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2">
          <LayoutGrid size={18} className="text-[#02cbfc]" />
          <span className="font-headline font-black italic uppercase text-[#02cbfc] tracking-tight text-lg">B2B Darkstore</span>
        </div>
        <div className="flex items-center gap-3">
          {activePicker && (
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-headline font-bold uppercase tracking-widest text-[#527c95]">Operator</span>
              <span className="text-sm font-bold text-[#003347]">P-{activePicker.id.slice(0, 4).toUpperCase()}</span>
            </div>
          )}
          <div className="w-10 h-10 border-2 border-[#02cbfc] bg-white flex items-center justify-center" style={{ borderRadius: '0' }}>
            <User size={18} className="text-[#003347]" />
          </div>
          {connected
            ? <Wifi size={15} className="text-emerald-500" />
            : <WifiOff size={15} className="text-[#527c95]" />
          }
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 px-5 py-5 pb-24 flex flex-col gap-5">
        {/* SCREEN: picker selection */}
        {uiState === 'selecting_picker' && (
          <div className="flex flex-col gap-4">
            <div className="text-center py-5">
              <p className="font-headline font-bold uppercase tracking-widest text-xs text-[#527c95] mb-2">Select Profile</p>
              <p className="text-[#003347] font-headline font-black text-xl">Who is picking today?</p>
            </div>
            {pickers.map(p => (
              <button
                key={p.id}
                onClick={() => handlePickerSelect(p)}
                className="w-full flex items-center gap-4 p-5 bg-white border-2 border-[#88b3cd] hover:border-[#02cbfc] transition-all text-left active:scale-[0.98]"
                style={{ borderRadius: '0' }}
              >
                <div className="w-12 h-12 bg-[#02cbfc]/20 border border-[#02cbfc] flex items-center justify-center" style={{ borderRadius: '0' }}>
                  <User size={20} className="text-[#02cbfc]" />
                </div>
                <div className="flex-1">
                  <p className="font-headline font-bold text-[#003347] text-base">{p.name}</p>
                  <p className={`text-xs font-headline font-bold uppercase tracking-widest ${p.status === 'picking' ? 'text-amber-500' : 'text-emerald-600'}`}>
                    {p.status === 'picking' ? 'Currently Picking' : 'Ready'}
                  </p>
                </div>
                <ArrowRight size={18} className="text-[#527c95]" />
              </button>
            ))}
          </div>
        )}

        {/* SCREEN: idle */}
        {uiState === 'idle' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 py-24 text-center">
            <div className="w-20 h-20 border-2 border-[#88b3cd] bg-white flex items-center justify-center" style={{ borderRadius: '0' }}>
              <Package size={32} className="text-[#527c95]" />
            </div>
            <p className="font-headline font-bold text-[#003347] text-lg">No active task.</p>
            <p className="text-sm text-[#527c95]">Waiting for assignment…</p>
            <button
              onClick={() => { setActivePicker(null); setUiState('selecting_picker') }}
              className="text-sm text-[#527c95] border border-[#88b3cd] px-4 py-2 hover:bg-white mt-3"
              style={{ borderRadius: '0' }}
            >
              Switch Picker
            </button>
          </div>
        )}

        {/* SCREEN: task active */}
        {uiState === 'task_active' && activeTask && (
          <>
            {/* Task Card */}
            <div className="bg-white border-2 border-[#02cbfc] relative overflow-hidden" style={{ borderRadius: '0' }}>
              <div className="absolute top-0 right-0 bg-[#02cbfc] text-[#003347] font-headline font-black text-xs uppercase tracking-widest px-3 py-1.5">
                Active Task
              </div>
              <div className="p-6">
                <p className="text-[10px] font-headline font-bold uppercase tracking-widest text-[#527c95] mb-2">Location Bin</p>
                <h2 className="text-7xl font-black font-headline text-[#02cbfc] leading-none tracking-tighter mb-3">
                  {binLabel}
                </h2>
                <div className="flex items-center gap-2 text-[#527c95] mb-5">
                  <Package size={16} className="text-[#02cbfc] shrink-0" />
                  <span className="text-base font-medium">{activeTask.sku_name}</span>
                </div>
                <div className="w-full aspect-square max-h-48 bg-white border-4 border-[#88b3cd] flex items-center justify-center mx-auto" style={{ borderRadius: '0' }}>
                  <Package size={56} className="text-[#88b3cd]" />
                </div>
              </div>
              <div className="border-t-2 border-[#88b3cd] px-6 py-4 flex items-center gap-5">
                <div className="flex-1">
                  <p className="text-[9px] font-headline font-bold uppercase tracking-widest text-[#527c95]">SKU ID</p>
                  <p className="font-mono text-sm font-bold text-[#003347] mt-1">{activeTask.sku_name}</p>
                </div>
                <div className="flex-1 border-l-2 border-[#88b3cd] pl-5">
                  <p className="text-[9px] font-headline font-bold uppercase tracking-widest text-[#527c95]">Target Qty</p>
                  <p className="font-headline text-3xl font-black text-[#02cbfc] leading-none mt-1">
                    04 <span className="text-sm text-[#527c95] font-normal">units</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-4 h-48">
              <button
                onClick={handleScanned}
                className="bg-[#02cbfc] border-2 border-[#003347] flex flex-col items-center justify-center gap-3 active:scale-[0.97] transition-transform"
                style={{ borderRadius: '0' }}
              >
                <CheckCircle2 size={48} className="text-[#003347]" strokeWidth={2} />
                <span className="font-headline font-black text-xl uppercase tracking-tight text-[#003347]">Item Found</span>
              </button>
              <button
                onClick={handleMissing}
                className="bg-white border-2 border-[#b31b25] flex flex-col items-center justify-center gap-3 active:scale-[0.97] transition-transform hover:bg-red-50"
                style={{ borderRadius: '0' }}
              >
                <AlertTriangle size={48} className="text-[#b31b25]" strokeWidth={2} />
                <span className="font-headline font-black text-xl uppercase tracking-tight text-[#b31b25]">Item Missing</span>
              </button>
            </div>

            {/* Snake Path Mini-Map */}
            <div className="bg-white border-2 border-[#88b3cd] p-5" style={{ borderRadius: '0' }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Route size={14} className="text-[#527c95]" />
                  <span className="font-headline font-bold uppercase tracking-widest text-xs text-[#003347]">Warehouse Snake Path</span>
                </div>
                <span className="text-[10px] font-headline font-bold uppercase bg-[#02cbfc] text-[#003347] px-2.5 py-1" style={{ borderRadius: '9999px' }}>Next: Aisle B</span>
              </div>
              <div className="relative h-32 bg-[#eff8ff] border border-[#88b3cd] overflow-hidden" style={{ borderRadius: '0' }}>
                <div className="absolute inset-0 grid grid-cols-12 grid-rows-3 gap-0.5 p-2 opacity-30">
                  {Array.from({ length: 36 }).map((_, i) => (
                    <div key={i} className="bg-[#88b3cd]" style={{ borderRadius: '0' }} />
                  ))}
                </div>
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 100" preserveAspectRatio="none">
                  <path
                    d="M 20 80 L 100 80 L 100 20 L 180 20 L 180 80 L 260 80 L 260 20 L 340 20"
                    fill="none"
                    stroke="#02cbfc"
                    strokeWidth="4"
                    strokeLinecap="square"
                  />
                  <circle cx="180" cy="80" r="7" fill="#003347" />
                  <circle cx="180" cy="80" r="4" fill="#02cbfc" />
                </svg>
                <div className="absolute top-2 left-3 px-2 py-1 bg-white border border-[#88b3cd] text-[9px] font-bold" style={{ borderRadius: '0' }}>AISLE A</div>
                <div className="absolute top-2 right-3 px-2 py-1 bg-white border border-[#88b3cd] text-[9px] font-bold" style={{ borderRadius: '0' }}>AISLE C</div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-white/90 border-2 border-[#02cbfc] px-3 py-1.5 text-[10px] font-bold font-headline animate-pulse" style={{ borderRadius: '0' }}>
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
            <Loader2 size={40} className="animate-spin text-[#02cbfc]" />
            <p className="font-headline font-bold text-[#527c95] uppercase tracking-widest text-sm">Contacting agent…</p>
          </div>
        )}

        {/* SCREEN: success */}
        {uiState === 'success' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 py-24 text-center">
            <div className="w-20 h-20 border-2 border-emerald-500 bg-emerald-50 flex items-center justify-center" style={{ borderRadius: '0' }}>
              <CheckCircle2 size={32} className="text-emerald-600" />
            </div>
            <p className="font-headline font-bold text-emerald-600 uppercase tracking-widest text-base">{feedback}</p>
          </div>
        )}

        {/* SCREEN: rerouted */}
        {uiState === 'rerouted' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 py-24 text-center">
            <div className="w-20 h-20 border-2 border-amber-500 bg-amber-50 flex items-center justify-center" style={{ borderRadius: '0' }}>
              <ArrowRight size={32} className="text-amber-600" />
            </div>
            <p className="font-headline font-bold text-amber-600 uppercase tracking-widest text-base">{feedback}</p>
            <p className="text-sm text-[#527c95]">Loading new task…</p>
          </div>
        )}

        {/* SCREEN: error */}
        {uiState === 'error' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 py-24 text-center">
            <div className="w-20 h-20 border-2 border-[#b31b25] bg-red-50 flex items-center justify-center" style={{ borderRadius: '0' }}>
              <AlertTriangle size={32} className="text-[#b31b25]" />
            </div>
            <p className="font-headline font-bold text-[#b31b25] uppercase tracking-widest text-base">{feedback}</p>
            <button
              onClick={() => setUiState(activeTask ? 'task_active' : 'idle')}
              className="text-sm border border-[#88b3cd] px-5 py-2.5 text-[#003347] hover:bg-white mt-3"
              style={{ borderRadius: '0' }}
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* ── Bottom Nav ── */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] z-50 grid grid-cols-4 h-16 bg-white border-t-2 border-[#88b3cd]">
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
                ? 'text-[#02cbfc] border-t-2 border-[#02cbfc] -mt-[2px]'
                : 'text-[#527c95] hover:text-[#003347]'
            }`}
            style={{ borderRadius: '0' }}
          >
            {item.icon}
            <span className="font-headline font-bold uppercase tracking-widest text-[9px]">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
