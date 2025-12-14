import { useEffect, useMemo, useRef, useState, FormEvent } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import './App.css'

type GraphNode = {
  id: string
  label: string
  description?: string
}

type GraphEdge = {
  from: string
  to: string
  relation?: string
}

type GraphData = {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

const MODEL_NAME = 'gemini-2.5-flash'
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string

type FGNode = { id: string; name: string; description?: string }
type FGLink = { source: string; target: string; relation?: string }
type FGData = { nodes: FGNode[]; links: FGLink[] }

export default function App() {
  const [topic, setTopic] = useState('')
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selected, setSelected] = useState<FGNode | null>(null)

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const fgRef = useRef<any>(null)
  const [size, setSize] = useState({ w: 900, h: 560 })

  // Resize graph canvas to container
  useEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver(() => {
      const rect = wrapRef.current!.getBoundingClientRect()
      setSize({
        w: Math.max(320, Math.floor(rect.width)),
        h: Math.max(360, Math.floor(rect.height)),
      })
    })
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  const fgData: FGData | null = useMemo(() => {
    if (!graph) return null
    return {
      nodes: graph.nodes.map((n) => ({
        id: n.id,
        name: n.label,
        description: n.description,
      })),
      links: graph.edges.map((e) => ({
        source: e.from,
        target: e.to,
        relation: e.relation,
      })),
    }
  }, [graph])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!topic.trim()) return

    if (!API_KEY) {
      setError('Missing Gemini API key. Set VITE_GEMINI_API_KEY in .env')
      return
    }

    setLoading(true)
    setError(null)
    setGraph(null)
    setSelected(null)

    const prompt = `
You are an academic research assistant.

Given the following research topic, build a small related-work graph.

Return ONLY valid JSON with this exact shape (no markdown, no comments):

{
  "nodes": [
    { "id": "topic", "label": string, "description": string },
    { "id": string, "label": string, "description": string }
  ],
  "edges": [
    { "from": string, "to": string, "relation": string }
  ]
}

The "topic" node represents the user’s main research topic.
Add 4–8 related nodes (papers, sub-topics, or methods).
"relation" should briefly describe how the two nodes are connected.

Research topic: "${topic}"
    `.trim()

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { response_mime_type: 'application/json' },
          }),
        },
      )

      if (!res.ok) throw new Error(`Gemini API error: ${res.status} ${res.statusText}`)

      const data = await res.json()
      const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) throw new Error('Empty response from model')

      const parsed: GraphData = JSON.parse(text)
      setGraph(parsed)
    } catch (err) {
      console.error(err)
      setError((err as Error).message ?? 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  // Auto fit when graph changes
  useEffect(() => {
    if (!fgRef.current || !fgData) return
    const t = setTimeout(() => {
      fgRef.current?.zoomToFit?.(500, 60)
    }, 50)
    return () => clearTimeout(t)
  }, [fgData])

  return (
    <div className="App">
      <header className="app-header">
        <h1>Research Graph Explorer</h1>
        <p>Type a research topic and let Gemini build a small related-work graph.</p>
      </header>

      <form className="topic-form" onSubmit={handleSubmit}>
        <textarea
          className="topic-input"
          placeholder="Example: Few-shot segmentation using support-query interaction"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          rows={3}
        />
        <button className="submit-button" type="submit" disabled={loading}>
          {loading ? 'Generating…' : 'Generate Graph'}
        </button>
      </form>

      {error && <div className="error-box">⚠️ {error}</div>}

      {!fgData && !loading && !error && (
        <div className="hint">Enter any research topic to see a related-work graph.</div>
      )}

      {fgData && (
        <div className="graph-wrap">
          <div className="graph-canvas" ref={wrapRef}>
            <ForceGraph2D
              ref={fgRef}
              width={size.w}
              height={size.h}
              graphData={fgData}
              nodeId="id"
              nodeLabel={(n: any) => `${n.name}${n.description ? `\n\n${n.description}` : ''}`}
              linkLabel={(l: any) => l.relation ?? ''}
              linkDirectionalArrowLength={6}
              linkDirectionalArrowRelPos={1}
              onNodeClick={(n: any) => setSelected(n)}
              onBackgroundClick={() => setSelected(null)}
              nodeCanvasObject={(node: any, ctx, globalScale) => {
                const isTopic = node.id === 'topic'
                const isSelected = selected?.id === node.id

                const label = node.name as string
                const fontSize = (isTopic ? 16 : 13) / globalScale
                const r = (isTopic ? 10 : 7) + (isSelected ? 3 : 0)

                // circle
                ctx.beginPath()
                ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
                ctx.fillStyle = isTopic ? '#111827' : isSelected ? '#1f2937' : '#374151'
                ctx.fill()

                // label background
                ctx.font = `${fontSize}px sans-serif`
                const textWidth = ctx.measureText(label).width
                const pad = 3 / globalScale
                const bgW = textWidth + pad * 2
                const bgH = fontSize + pad * 2

                ctx.fillStyle = 'rgba(255,255,255,0.9)'
                ctx.fillRect(node.x - bgW / 2, node.y + r + 4 / globalScale, bgW, bgH)

                // label text
                ctx.textAlign = 'center'
                ctx.textBaseline = 'top'
                ctx.fillStyle = '#111827'
                ctx.fillText(label, node.x, node.y + r + 4 / globalScale + pad)
              }}
              linkCanvasObjectMode={() => 'after'}
              linkCanvasObject={(link: any, ctx, globalScale) => {
                const rel = link.relation as string | undefined
                if (!rel) return

                const sx = (link.source as any).x
                const sy = (link.source as any).y
                const tx = (link.target as any).x
                const ty = (link.target as any).y
                const mx = (sx + tx) / 2
                const my = (sy + ty) / 2

                const fontSize = 11 / globalScale
                ctx.font = `${fontSize}px sans-serif`
                const w = ctx.measureText(rel).width
                const pad = 3 / globalScale

                ctx.fillStyle = 'rgba(255,255,255,0.85)'
                ctx.fillRect(mx - (w / 2 + pad), my - (fontSize / 2 + pad), w + pad * 2, fontSize + pad * 2)

                ctx.textAlign = 'center'
                ctx.textBaseline = 'middle'
                ctx.fillStyle = '#111827'
                ctx.fillText(rel, mx, my)
              }}
            />
          </div>

          <aside className="graph-panel">
            <div className="panel-title">Details</div>
            {selected ? (
              <>
                <div className="panel-node-title">{selected.name}</div>
                {selected.description && <div className="panel-node-desc">{selected.description}</div>}
                <div className="panel-hint">Tip: click empty space to clear selection.</div>
              </>
            ) : (
              <div className="panel-hint">Click a node to see its description.</div>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
