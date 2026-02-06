import {
  BarChart3,
  Calendar,
  GitBranch,
  Layers,
  ExternalLink,
  TrendingUp,
  DollarSign,
  CheckCircle2,
  Clock,
  Lightbulb,
  AlertCircle,
} from 'lucide-react'
import {
  getAllInitiatives,
  getTotalCostEstimate,
  getAverageCompleteness,
  type Initiative,
} from '@/lib/linear'

// ─── Status Helpers ──────────────────────────────────────────

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  active: { color: 'text-emerald-400', bg: 'bg-emerald-500', label: 'Active' },
  'in-development': { color: 'text-blue-400', bg: 'bg-blue-500', label: 'In Dev' },
  beta: { color: 'text-amber-400', bg: 'bg-amber-500', label: 'Paused' },
  planned: { color: 'text-slate-400', bg: 'bg-slate-500', label: 'Planned' },
}

function statusOf(s: string) {
  return STATUS_CONFIG[s] || STATUS_CONFIG.planned
}

// ─── Dashboard Components ────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = 'text-blue-400',
}: {
  icon: React.ElementType
  label: string
  value: string | number
  sub?: string
  accent?: string
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${accent}`} />
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-3xl font-bold">{value}</div>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  )
}

function StatusBreakdown({ initiatives }: { initiatives: Initiative[] }) {
  const counts: Record<string, number> = {}
  for (const i of initiatives) {
    counts[i.status] = (counts[i.status] || 0) + 1
  }
  const total = initiatives.length || 1

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Layers className="w-4 h-4 text-purple-400" />
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
          Status Breakdown
        </span>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden mb-4">
        {Object.entries(counts).map(([status, count]) => (
          <div
            key={status}
            className={`${statusOf(status).bg} transition-all`}
            style={{ width: `${(count / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {Object.entries(counts).map(([status, count]) => (
          <div key={status} className="flex items-center gap-1.5 text-xs">
            <div className={`w-2.5 h-2.5 rounded-full ${statusOf(status).bg}`} />
            <span className="text-slate-300">
              {statusOf(status).label}: {count}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProgressOverview({ initiatives }: { initiatives: Initiative[] }) {
  const sorted = [...initiatives].sort((a, b) => b.completeness - a.completeness)
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-blue-400" />
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
          Progress
        </span>
      </div>
      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
        {sorted.map((i) => (
          <div key={i.id}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-300 truncate mr-2">{i.name}</span>
              <span className="text-slate-500 shrink-0">{i.completeness}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5">
              <div
                className="bg-gradient-to-r from-blue-600 to-blue-400 h-1.5 rounded-full transition-all"
                style={{ width: `${i.completeness}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Gantt Chart ──────────────────────────────────────────────

function GanttChart({ initiatives }: { initiatives: Initiative[] }) {
  const withDates = initiatives.filter((i) => i.start_date || i.target_date)
  if (withDates.length === 0) return null

  const now = new Date()
  const dates = withDates.flatMap((i) => [
    i.start_date ? new Date(i.start_date) : null,
    i.target_date ? new Date(i.target_date) : null,
  ]).filter(Boolean) as Date[]

  if (dates.length === 0) return null

  const minDate = new Date(Math.min(...dates.map((d) => d.getTime()), now.getTime()))
  const maxDate = new Date(Math.max(...dates.map((d) => d.getTime()), now.getTime()))
  // Pad by 30 days each side
  minDate.setDate(minDate.getDate() - 30)
  maxDate.setDate(maxDate.getDate() + 60)
  const rangeMs = maxDate.getTime() - minDate.getTime()

  const toPercent = (d: Date) => ((d.getTime() - minDate.getTime()) / rangeMs) * 100
  const nowPercent = toPercent(now)

  // Generate month markers
  const months: { label: string; pct: number }[] = []
  const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1)
  while (cursor <= maxDate) {
    months.push({
      label: cursor.toLocaleDateString('en', { month: 'short', year: '2-digit' }),
      pct: toPercent(cursor),
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-5">
        <Calendar className="w-4 h-4 text-teal-400" />
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
          Timeline
        </span>
      </div>

      {/* Month headers */}
      <div className="relative h-6 mb-2">
        {months.map((m, idx) => (
          <span
            key={idx}
            className="absolute text-[10px] text-slate-500 -translate-x-1/2"
            style={{ left: `${m.pct}%` }}
          >
            {m.label}
          </span>
        ))}
      </div>

      <div className="relative">
        {/* Today marker */}
        <div
          className="absolute top-0 bottom-0 w-px bg-red-500/50 z-10"
          style={{ left: `${nowPercent}%` }}
        >
          <span className="absolute -top-5 -translate-x-1/2 text-[9px] text-red-400 font-medium">
            today
          </span>
        </div>

        {/* Month grid lines */}
        {months.map((m, idx) => (
          <div
            key={idx}
            className="absolute top-0 bottom-0 w-px bg-slate-800"
            style={{ left: `${m.pct}%` }}
          />
        ))}

        {/* Bars */}
        <div className="space-y-2">
          {withDates.map((i) => {
            const start = i.start_date ? new Date(i.start_date) : now
            const end = i.target_date ? new Date(i.target_date) : maxDate
            const leftPct = toPercent(start)
            const widthPct = toPercent(end) - leftPct

            return (
              <div key={i.id} className="flex items-center gap-3 h-7">
                <span className="text-xs text-slate-400 w-36 truncate shrink-0">{i.name}</span>
                <div className="relative flex-1 h-5">
                  {/* Background bar */}
                  <div
                    className="absolute h-full rounded bg-slate-800"
                    style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 0.5)}%` }}
                  />
                  {/* Progress fill */}
                  <div
                    className={`absolute h-full rounded ${statusOf(i.status).bg} opacity-80`}
                    style={{
                      left: `${leftPct}%`,
                      width: `${Math.max(widthPct * (i.completeness / 100), 0.3)}%`,
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Initiative Card ─────────────────────────────────────────

function InitiativeCard({ initiative: i }: { initiative: Initiative }) {
  const { bg, label } = statusOf(i.status)

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0 mr-3">
          {i.url.startsWith('http') ? (
            <a
              href={i.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-lg font-semibold hover:text-blue-400 transition-colors inline-flex items-center gap-1.5"
            >
              {i.name}
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            </a>
          ) : (
            <span className="text-lg font-semibold">{i.name}</span>
          )}
        </div>
        <span className={`${bg} text-white text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0`}>
          {label}
        </span>
      </div>

      <p className="text-sm text-slate-400 line-clamp-2 mb-4">{i.description}</p>

      {/* Meta row */}
      <div className="flex items-center gap-4 text-xs text-slate-500 mb-4">
        {i.issue_count > 0 && (
          <span className="flex items-center gap-1">
            <GitBranch className="w-3 h-3" />
            {i.completed_issue_count}/{i.issue_count} issues
          </span>
        )}
        {i.cost_estimate > 0 && (
          <span className="flex items-center gap-1">
            <DollarSign className="w-3 h-3" />$
            {i.cost_estimate.toLocaleString()}
          </span>
        )}
        {i.start_date && (
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {new Date(i.start_date).toLocaleDateString('en', { month: 'short', year: 'numeric' })}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-slate-400">Progress</span>
          <span className="font-medium">{i.completeness}%</span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-2">
          <div
            className="bg-gradient-to-r from-blue-600 to-blue-400 h-2 rounded-full transition-all"
            style={{ width: `${i.completeness}%` }}
          />
        </div>
      </div>

      {/* Features & Next Steps */}
      {i.features.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
              Completed
            </span>
          </div>
          <ul className="space-y-0.5">
            {i.features.slice(0, 3).map((f, idx) => (
              <li key={idx} className="text-xs text-slate-400 flex items-start gap-1.5">
                <span className="text-emerald-500 mt-px">·</span>
                <span className="line-clamp-1">{f}</span>
              </li>
            ))}
            {i.features.length > 3 && (
              <li className="text-[10px] text-slate-600 italic">+{i.features.length - 3} more</li>
            )}
          </ul>
        </div>
      )}

      {i.next_milestones.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Lightbulb className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
              Next
            </span>
          </div>
          <ul className="space-y-0.5">
            {i.next_milestones.slice(0, 2).map((m, idx) => (
              <li key={idx} className="text-xs text-slate-400 flex items-start gap-1.5">
                <Clock className="w-3 h-3 text-amber-500 mt-px shrink-0" />
                <span className="line-clamp-1">{m}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────

export default async function StatusPage() {
  let initiatives: Initiative[] = []
  let totalCost = 0
  let avgCompleteness = 0
  let error = false

  try {
    initiatives = await getAllInitiatives()
    totalCost = await getTotalCostEstimate()
    avgCompleteness = await getAverageCompleteness()
  } catch (e) {
    console.error('Failed to load initiatives from Linear:', e)
    error = true
  }

  const activeCount = initiatives.filter((i) => i.status === 'active').length
  const totalIssues = initiatives.reduce((s, i) => s + i.issue_count, 0)
  const completedIssues = initiatives.reduce((s, i) => s + i.completed_issue_count, 0)

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold">🕯️ Inquiry Institute</span>
            <span className="text-slate-600">|</span>
            <span className="text-sm text-slate-400">Status Dashboard</span>
          </div>
          <a
            href="https://inquiry.institute"
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            inquiry.institute ↗
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-6 bg-red-950/50 border border-red-900 rounded-xl p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-sm text-red-300">
              Could not load data from Linear. Showing cached or empty state.
            </p>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <StatCard
            icon={Layers}
            label="Initiatives"
            value={initiatives.length}
            accent="text-purple-400"
          />
          <StatCard
            icon={BarChart3}
            label="Avg Progress"
            value={`${avgCompleteness}%`}
            accent="text-blue-400"
          />
          <StatCard
            icon={DollarSign}
            label="Est. Total Cost"
            value={`$${totalCost.toLocaleString()}`}
            accent="text-emerald-400"
          />
          <StatCard
            icon={GitBranch}
            label="Issues"
            value={`${completedIssues}/${totalIssues}`}
            sub="completed / total"
            accent="text-teal-400"
          />
          <StatCard
            icon={CheckCircle2}
            label="Active"
            value={activeCount}
            sub={`of ${initiatives.length}`}
            accent="text-emerald-400"
          />
        </div>

        {/* Dashboard row */}
        <div className="grid md:grid-cols-2 gap-3 mb-6">
          <StatusBreakdown initiatives={initiatives} />
          <ProgressOverview initiatives={initiatives} />
        </div>

        {/* Gantt chart */}
        <div className="mb-8">
          <GanttChart initiatives={initiatives} />
        </div>

        {/* Initiative Cards */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Layers className="w-5 h-5 text-slate-500" />
            All Initiatives
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {initiatives.map((i) => (
              <InitiativeCard key={i.id} initiative={i} />
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-slate-800 text-center text-xs text-slate-600">
          <p>
            Data sourced from{' '}
            <a href="https://linear.app" className="text-slate-500 hover:text-slate-400">
              Linear
            </a>{' '}
            · Updated at build time · Maintained by{' '}
            <span className="text-slate-500">a.Jobs</span>
          </p>
        </footer>
      </main>
    </div>
  )
}
