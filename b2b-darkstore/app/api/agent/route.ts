import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Bin, Task, AgentResponse } from '@/lib/types'

const AISLE_CONGESTION_LIMIT = 2
const GHOST_MULTIPLIER = 3
const AVG_PICK_TIME_MS = 90_000

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) throw new Error('Missing server Supabase env vars')
  return createClient(url, key)
}

export async function POST(req: NextRequest): Promise<NextResponse<AgentResponse>> {
  const supabase = getServerSupabase()

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ status: 'ERROR', message: 'Invalid JSON body.' }, { status: 400 })
  }

  const { action, picker_id, bin_id, aisle_id } = body as Record<string, string>

  if (!action || !picker_id) {
    return NextResponse.json({ status: 'ERROR', message: 'Missing action or picker_id.' }, { status: 400 })
  }

  // ── ASSIGN ────────────────────────────────────────────────────
  if (action === 'assign') {
    if (!aisle_id) {
      return NextResponse.json({ status: 'ERROR', message: 'assign requires aisle_id.' }, { status: 400 })
    }

    const { count, error: countErr } = await supabase
      .from('pickers')
      .select('id', { count: 'exact', head: true })
      .eq('current_aisle', aisle_id)
      .eq('status', 'picking')

    if (countErr) return NextResponse.json({ status: 'ERROR', message: countErr.message }, { status: 500 })

    if ((count ?? 0) >= AISLE_CONGESTION_LIMIT) {
      const { data: altBins } = await supabase
        .from('bins')
        .select('*')
        .eq('status', 'ok')
        .neq('aisle_id', aisle_id)
        .limit(5)

      if (!altBins?.length) {
        return NextResponse.json({ status: 'RE_ROUTE', message: `Aisle ${aisle_id} congested. No alternatives.` })
      }

      const alt = altBins[0] as Bin
      return NextResponse.json({
        status: 'RE_ROUTE',
        message: `Congestion in ${aisle_id}. Routing to ${alt.label}.`,
        alternative_bin: alt,
      })
    }

    const { data: bin, error: binErr } = await supabase
      .from('bins')
      .select('*')
      .eq('aisle_id', aisle_id)
      .eq('status', 'ok')
      .limit(1)
      .single()

    if (binErr || !bin) {
      return NextResponse.json({ status: 'ERROR', message: 'No bins available' }, { status: 404 })
    }

    const { data: task, error: taskErr } = await supabase
      .from('tasks')
      .insert({
        picker_id,
        bin_id: (bin as Bin).id,
        sku_name: `SKU-${(bin as Bin).label}`,
        assigned_at: new Date().toISOString(),
        completed_at: null,
      })
      .select()
      .single()

    if (taskErr || !task) {
      return NextResponse.json({ status: 'ERROR', message: taskErr?.message ?? 'Fail' }, { status: 500 })
    }

    await supabase.from('pickers').update({ status: 'picking', current_aisle: aisle_id }).eq('id', picker_id)

    return NextResponse.json({ status: 'ASSIGNED', message: 'Task created.', task: task as Task })
  }

  // ── MISSING ───────────────────────────────────────────────────
  if (action === 'missing') {
    if (!bin_id) return NextResponse.json({ status: 'ERROR', message: 'Missing bin_id' }, { status: 400 })

    const { data: binData } = await supabase.from('bins').select('status').eq('id', bin_id).single()
    const existingBin = binData as Bin | null

    if (existingBin?.status === 'ghosting_suspected') {
      return NextResponse.json({ status: 'GHOSTING_FLAGGED', message: 'Already flagged.' })
    }

    const { data: activeTaskData } = await supabase
      .from('tasks')
      .select('*')
      .eq('picker_id', picker_id)
      .eq('bin_id', bin_id)
      .is('completed_at', null)
      .order('assigned_at', { ascending: false })
      .limit(1)
      .single()
    const activeTask = activeTaskData as Task | null

    let ghostReason = 'Manual report'
    if (activeTask) {
      const elapsed = Date.now() - new Date(activeTask.assigned_at).getTime()
      if (elapsed > GHOST_MULTIPLIER * AVG_PICK_TIME_MS) {
        ghostReason = `Time limit exceeded (${Math.round(elapsed / 1000)}s)`
      }
    }

    const { error: updateErr } = await supabase
      .from('bins')
      .update({ status: 'ghosting_suspected', last_audit: new Date().toISOString() })
      .eq('id', bin_id)

    if (updateErr) return NextResponse.json({ status: 'ERROR', message: updateErr.message }, { status: 500 })

    if (activeTask) {
      await supabase.from('tasks').update({ completed_at: new Date().toISOString() }).eq('id', activeTask.id)
    }

    await supabase.from('pickers').update({ status: 'idle', current_aisle: null }).eq('id', picker_id)

    return NextResponse.json({ status: 'GHOSTING_FLAGGED', message: `Flagged: ${ghostReason}` })
  }

  return NextResponse.json({ status: 'ERROR', message: 'Unknown action' }, { status: 400 })
}

export async function GET(): Promise<NextResponse> {
  const supabase = getServerSupabase()
  const cutoff = new Date(Date.now() - GHOST_MULTIPLIER * AVG_PICK_TIME_MS).toISOString()

  const { data: staleTasks } = await supabase
    .from('tasks')
    .select('*')
    .is('completed_at', null)
    .lt('assigned_at', cutoff)

  if (staleTasks && staleTasks.length > 0) {
    const staleBinIds = (staleTasks as Task[]).map((t) => t.bin_id)
    await supabase
      .from('bins')
      .update({ status: 'ghosting_suspected', last_audit: new Date().toISOString() })
      .in('id', staleBinIds)
    return NextResponse.json({ swept: staleTasks.length })
  }

  return NextResponse.json({ swept: 0 })
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}