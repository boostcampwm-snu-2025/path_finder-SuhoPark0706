// src/App.tsx
import { useState, FormEvent } from 'react'
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

const MODEL_NAME = 'gemini-2.5-flash' // 필요하면 다른 모델로 변경 가능
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string

function getConnections(graph: GraphData, nodeId: string): string[] {
  return graph.edges
    .filter((e) => e.from === nodeId || e.to === nodeId)
    .map((e) => {
      const other = e.from === nodeId ? e.to : e.from
      const arrow = e.from === nodeId ? '→' : '←'
      return `${arrow} ${other}${e.relation ? ` (${e.relation})` : ''}`
    })
}

function App() {
  const [topic, setTopic] = useState('')
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: prompt }],
              },
            ],
            // JSON 형식으로만 응답 달라고 요청
            generationConfig: {
              response_mime_type: 'application/json',
            },
          }),
        },
      )

      if (!res.ok) {
        throw new Error(`Gemini API error: ${res.status} ${res.statusText}`)
      }

      const data = await res.json()
      const text: string | undefined =
        data?.candidates?.[0]?.content?.parts?.[0]?.text

      if (!text) {
        throw new Error('Empty response from model')
      }

      const parsed: GraphData = JSON.parse(text)
      setGraph(parsed)
    } catch (err) {
      console.error(err)
      setError((err as Error).message ?? 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const topicNode =
    graph?.nodes.find((n) => n.id === 'topic') ?? graph?.nodes[0] ?? null
  const relatedNodes =
    graph && topicNode
      ? graph.nodes.filter((n) => n.id !== topicNode.id)
      : []

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

      {!graph && !loading && !error && (
        <div className="hint">
          Enter any research topic (e.g., your thesis idea) to see a simple related-work graph.
        </div>
      )}

      {graph && topicNode && (
        <div className="graph-container">
          <div className="topic-node">
            <h2>{topicNode.label}</h2>
            {topicNode.description && <p>{topicNode.description}</p>}
          </div>

          <div className="edges-label">Related nodes</div>

          <div className="related-nodes">
            {relatedNodes.map((node) => (
              <div key={node.id} className="graph-node">
                <h3>{node.label}</h3>
                {node.description && (
                  <p className="node-description">{node.description}</p>
                )}
                <div className="node-connections">
                  {getConnections(graph, node.id).map((c, idx) => (
                    <span key={idx} className="connection-chip">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
