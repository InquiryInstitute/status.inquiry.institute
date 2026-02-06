/**
 * Linear integration for initiatives
 *
 * Replaces Supabase as the source of truth for Inquiry Institute initiative status.
 * Each Linear project represents an initiative. Metadata (url, cost_estimate,
 * opencollective_slug, etc.) is stored as a YAML block in the project's
 * `content` field (rich text), fenced by `<!-- meta ... -->`.
 * The short `description` field (255 char limit) holds a one-liner.
 *
 * Example project content:
 *   <!-- meta
 *   url: https://puppet.inquiry.institute
 *   cost_estimate: 5000
 *   opencollective_slug: puppet-initiative
 *   opencollective_type: initiative
 *   subdomain: puppet
 *   page_path: /puppet
 *   -->
 */

const LINEAR_API_URL = 'https://api.linear.app/graphql'

function getApiKey(): string {
  const key = process.env.LINEAR_API_KEY
  if (!key) {
    throw new Error('LINEAR_API_KEY environment variable is not set')
  }
  return key
}

function getTeamId(): string {
  return process.env.LINEAR_TEAM_ID || 'ca747a2c-e5e3-4221-b38c-4369ab5a107f'
}

async function gql<T = unknown>(query: string): Promise<T> {
  const res = await fetch(LINEAR_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: getApiKey(),
    },
    body: JSON.stringify({ query }),
    next: { revalidate: 300 }, // cache for 5 minutes in Next.js
  })

  if (!res.ok) {
    throw new Error(`Linear API error: ${res.status} ${res.statusText}`)
  }

  const json = await res.json()
  if (json.errors) {
    throw new Error(`Linear GraphQL error: ${json.errors[0]?.message}`)
  }

  return json.data as T
}

// ─── Metadata Parsing ──────────────────────────────────────────

interface ProjectMeta {
  url?: string
  cost_estimate?: number
  opencollective_slug?: string
  opencollective_type?: 'initiative' | 'collective'
  subdomain?: string
  page_path?: string
}

/**
 * Strip markdown link formatting that Linear adds to URLs in content.
 * e.g. "[https://example.com](<https://example.com>)" → "https://example.com"
 */
function stripMarkdownLinks(value: string): string {
  // Handle [url](<url>) format
  const linkMatch = value.match(/^\[([^\]]+)\]\([^)]+\)$/)
  if (linkMatch) return linkMatch[1]
  // Handle [url](url) format
  const simpleLinkMatch = value.match(/^\[([^\]]+)\]\(.+\)$/)
  if (simpleLinkMatch) return simpleLinkMatch[1]
  return value
}

function parseMeta(content: string | null): { meta: ProjectMeta; body: string } {
  if (!content) return { meta: {}, body: '' }

  const metaMatch = content.match(/<!--\s*meta\s*\n([\s\S]*?)-->/)
  if (!metaMatch) return { meta: {}, body: content.trim() }

  const metaBlock = metaMatch[1]
  const body = content.replace(metaMatch[0], '').trim()

  const meta: ProjectMeta = {}
  for (const line of metaBlock.split('\n')) {
    const match = line.match(/^\s*(\w+)\s*:\s*(.+?)\s*$/)
    if (!match) continue
    const [, key, rawValue] = match
    const value = stripMarkdownLinks(rawValue.trim())
    switch (key) {
      case 'url':
        meta.url = value
        break
      case 'cost_estimate':
        meta.cost_estimate = Number(value) || 0
        break
      case 'opencollective_slug':
        meta.opencollective_slug = value
        break
      case 'opencollective_type':
        meta.opencollective_type = value as 'initiative' | 'collective'
        break
      case 'subdomain':
        meta.subdomain = value
        break
      case 'page_path':
        meta.page_path = value
        break
    }
  }

  return { meta, body }
}

// ─── State Mapping ─────────────────────────────────────────────

type LinearProjectState = 'backlog' | 'planned' | 'started' | 'paused' | 'completed' | 'canceled'
type InitiativeStatus = 'active' | 'in-development' | 'planned' | 'beta'

function mapProjectState(state: LinearProjectState): InitiativeStatus {
  switch (state) {
    case 'started':
      return 'active'
    case 'backlog':
    case 'planned':
      return 'planned'
    case 'paused':
      return 'beta'
    case 'completed':
      return 'active'
    case 'canceled':
      return 'planned'
    default:
      return 'planned'
  }
}

// ─── Initiative Interface (matches the existing Supabase interface) ─────

export interface Initiative {
  id: string
  slug: string
  name: string
  description: string
  url: string
  page_path: string | null
  subdomain: string | null
  completeness: number
  cost_estimate: number
  opencollective_slug: string | null
  opencollective_type: 'initiative' | 'collective' | null
  status: InitiativeStatus
  features: string[]
  next_milestones: string[]
  start_date: string | null
  target_date: string | null
  issue_count: number
  completed_issue_count: number
  created_at: string
  updated_at: string
}

// ─── GraphQL Types ─────────────────────────────────────────────

interface LinearProjectNode {
  id: string
  name: string
  description: string | null
  content: string | null
  state: LinearProjectState
  progress: number
  startDate: string | null
  targetDate: string | null
  url: string
  createdAt: string
  updatedAt: string
  issues: {
    nodes: Array<{
      id: string
      title: string
      state: { type: string; name: string }
      completedAt: string | null
    }>
  }
}

interface TeamProjectsResponse {
  team: {
    projects: {
      nodes: LinearProjectNode[]
    }
  }
}

// ─── Public API ────────────────────────────────────────────────

function projectToInitiative(project: LinearProjectNode): Initiative {
  // Metadata lives in `content` (no char limit); `description` is the short summary
  const { meta, body: contentBody } = parseMeta(project.content)
  // Use description as the display text, falling back to parsed content body
  const displayDescription = project.description || contentBody || project.name

  const completedIssues = project.issues.nodes.filter((i) => i.state.type === 'completed')
  const openIssues = project.issues.nodes.filter(
    (i) => i.state.type === 'started' || i.state.type === 'unstarted'
  )

  // Generate slug from project name
  const slug = project.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  // Default URL: Linear project URL or parsed from meta
  const url = meta.url || project.url

  return {
    id: project.id,
    slug,
    name: project.name,
    description: displayDescription,
    url,
    page_path: meta.page_path || null,
    subdomain: meta.subdomain || null,
    completeness: Math.round(project.progress * 100),
    cost_estimate: meta.cost_estimate || 0,
    opencollective_slug: meta.opencollective_slug || null,
    opencollective_type: meta.opencollective_type || null,
    status: mapProjectState(project.state),
    features: completedIssues.slice(0, 10).map((i) => i.title),
    next_milestones: openIssues.slice(0, 5).map((i) => i.title),
    start_date: project.startDate,
    target_date: project.targetDate,
    issue_count: project.issues.nodes.length,
    completed_issue_count: completedIssues.length,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
  }
}

/**
 * Get all initiatives (Linear projects for this team)
 */
export async function getAllInitiatives(): Promise<Initiative[]> {
  const teamId = getTeamId()

  const data = await gql<TeamProjectsResponse>(`{
    team(id: "${teamId}") {
      projects {
        nodes {
          id
          name
          description
          content
          state
          progress
          startDate
          targetDate
          url
          createdAt
          updatedAt
          issues(first: 50, orderBy: updatedAt) {
            nodes {
              id
              title
              state { type name }
              completedAt
            }
          }
        }
      }
    }
  }`)

  return data.team.projects.nodes
    .filter((p) => p.state !== 'canceled')
    .map(projectToInitiative)
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Get initiative by slug
 */
export async function getInitiativeBySlug(slug: string): Promise<Initiative | null> {
  const initiatives = await getAllInitiatives()
  return initiatives.find((i) => i.slug === slug) || null
}

/**
 * Get initiative by page path
 */
export async function getInitiativeByPagePath(pagePath: string): Promise<Initiative | null> {
  const normalizedPath = pagePath.startsWith('/') ? pagePath : `/${pagePath}`
  const initiatives = await getAllInitiatives()
  return initiatives.find((i) => i.page_path === normalizedPath) || null
}

/**
 * Get initiative by subdomain
 */
export async function getInitiativeBySubdomain(subdomain: string): Promise<Initiative | null> {
  const initiatives = await getAllInitiatives()
  return initiatives.find((i) => i.subdomain === subdomain) || null
}

/**
 * Get initiative for current page (tries page_path then subdomain)
 */
export async function getInitiativeForPage(
  pagePath?: string,
  subdomain?: string
): Promise<Initiative | null> {
  if (pagePath) {
    const initiative = await getInitiativeByPagePath(pagePath)
    if (initiative) return initiative
  }
  if (subdomain) {
    const initiative = await getInitiativeBySubdomain(subdomain)
    if (initiative) return initiative
  }
  return null
}

/**
 * Get total cost estimate for all initiatives
 */
export async function getTotalCostEstimate(): Promise<number> {
  const initiatives = await getAllInitiatives()
  return initiatives.reduce((sum, i) => sum + i.cost_estimate, 0)
}

/**
 * Get average completeness across all initiatives
 */
export async function getAverageCompleteness(): Promise<number> {
  const initiatives = await getAllInitiatives()
  if (initiatives.length === 0) return 0
  const total = initiatives.reduce((sum, i) => sum + i.completeness, 0)
  return Math.round(total / initiatives.length)
}
