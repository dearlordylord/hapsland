import productIcon from "./brand/product-icon.svg?url"
import { SITE_EXAMPLE } from "./site-example"

const brandImage = typeof Image === "undefined" ? undefined : new Image()
export const brandReady: Promise<void> = brandImage
  ? new Promise((resolve, reject) => {
      brandImage.onload = () => resolve()
      brandImage.onerror = () => reject(new Error("Hapsland brand icon failed to load"))
      brandImage.src = productIcon
    })
  : Promise.resolve()

/** Adapted actual circular full-code video renderer.
 * Source ../hapsland-research/marketing/video/src/full-code.mjs
 * SHA-256 d304da64c66f04ca647308393c16e8f084e66c8af4c8a59fa1a88ac89654d3d0
 * Preserves codePanel, syntax, actor, path and eased travel primitives.
 * Site stages omit measured scores, pass seals and commit gating.
 */
type Context = CanvasRenderingContext2D
type Point = [number, number]
interface CodeRow {
  source: string
  mark?: string
}
interface PanelOptions {
  highlight?: number[]
  tone?: string
  alpha?: number
  scale?: number
  diff?: boolean
  compact?: boolean
  contextHighlight?: number[]
  resolvedHighlight?: number[]
}
const C = {
  bg: "#f7f5ef",
  ink: "#24332e",
  muted: "#7b847a",
  line: "#d8ded4",
  paper: "#fffefa",
  accent: "#de603b",
  soft: "#fce9df",
  bad: "#bd5743",
  good: "#398368",
  goodBg: "#e5f1e8",
  blue: "#608b9b"
}
const clamp = (x: number) => Math.max(0, Math.min(1, x))
const smooth = (x: number) => {
  x = clamp(x)
  return x * x * (3 - 2 * x)
}
const mix = (a: number, b: number, p: number) => a + (b - a) * p
function group(c: Context, x: number, y: number, s: number, a: number, fn: () => void) {
  if (a <= 0) return
  c.save()
  c.translate(x, y)
  c.scale(s, s)
  c.globalAlpha *= a
  fn()
  c.restore()
}
function rect(
  c: Context,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string | null,
  stroke?: string,
  width = 1.5
) {
  c.beginPath()
  c.roundRect(x, y, w, h, r)
  if (fill) {
    c.fillStyle = fill
    c.fill()
  }
  if (stroke) {
    c.strokeStyle = stroke
    c.lineWidth = width
    c.stroke()
  }
}
function text(
  c: Context,
  s: string,
  x: number,
  y: number,
  size = 20,
  color = C.ink,
  weight = 500,
  align: CanvasTextAlign = "left"
) {
  c.font = `${weight} ${size}px "Inter", "Arial", sans-serif`
  c.fillStyle = color
  c.textAlign = align
  c.textBaseline = "middle"
  c.fillText(s, x, y)
}
function line(c: Context, points: Point[], color = C.line, width = 2, dash: number[] = []) {
  c.beginPath()
  c.moveTo(...points[0])
  for (const p of points.slice(1)) c.lineTo(...p)
  c.strokeStyle = color
  c.lineWidth = width
  c.lineCap = "round"
  c.lineJoin = "round"
  c.setLineDash(dash)
  c.stroke()
  c.setLineDash([])
}
function dot(c: Context, x: number, y: number, r: number, color: string) {
  c.beginPath()
  c.arc(x, y, r, 0, Math.PI * 2)
  c.fillStyle = color
  c.fill()
}
function icon(c: Context, name: string, x: number, y: number, size = 24, color = C.ink) {
  group(c, x, y, size / 24, 1, () => {
    c.strokeStyle = color
    c.lineWidth = 1.7
    c.lineCap = "round"
    c.lineJoin = "round"
    if (name === "warn") {
      line(
        c,
        [
          [0, -11],
          [11, 9],
          [-11, 9],
          [0, -11]
        ],
        color,
        1.7
      )
      line(
        c,
        [
          [0, -3],
          [0, 2]
        ],
        color,
        2
      )
      dot(c, 0, 6, 1, color)
    }
    if (name === "code") {
      line(
        c,
        [
          [-5, -7],
          [-12, 0],
          [-5, 7]
        ],
        color,
        2
      )
      line(
        c,
        [
          [5, -7],
          [12, 0],
          [5, 7]
        ],
        color,
        2
      )
      line(
        c,
        [
          [2, -10],
          [-2, 10]
        ],
        color,
        1.5
      )
    }
    if (name === "branch") {
      line(
        c,
        [
          [-7, -9],
          [-7, 9]
        ],
        color,
        1.7
      )
      line(
        c,
        [
          [-7, 3],
          [7, -3],
          [7, -9]
        ],
        color,
        1.7
      )
      for (const p of [
        [-7, -9],
        [-7, 9],
        [7, -9]
      ])
        dot(c, p[0], p[1], 2.5, color)
    }
  })
}
function shadow(c: Context) {
  c.shadowColor = "#23382a12"
  c.shadowBlur = 28
  c.shadowOffsetY = 9
}
function tag(c: Context, label: string, x: number, y: number, color = C.muted) {
  text(c, label, x, y, 13, color, 650)
}
function path(c: Context, from: Point, to: Point, color = C.line) {
  const dx = to[0] - from[0]
  c.beginPath()
  c.moveTo(...from)
  c.bezierCurveTo(from[0] + dx * 0.5, from[1], to[0] - dx * 0.5, to[1], ...to)
  c.strokeStyle = color
  c.lineWidth = 2
  c.stroke()
}
function mono(c: Context, s: string, x: number, y: number, size = 18, color = C.ink) {
  c.font = `400 ${size}px "DejaVu Sans Mono", "Courier New", monospace`
  c.textAlign = "left"
  c.textBaseline = "middle"
  c.fillStyle = color
  c.fillText(s, x, y)
}
function syntax(c: Context, s: string, x: number, y: number, size = 18) {
  if (s.trim().startsWith("//")) {
    mono(c, s, x, y, size, C.muted)
    return
  }
  const tokens = s.split(/("[^"]*"|\b(?:interface|boolean|string|number)\b|\b[A-Z]\w*\b|[{}|?:;])/g)
  for (const token of tokens) {
    const color = token.startsWith('"')
      ? C.good
      : /^(interface|boolean|string|number)$/.test(token)
        ? "#996247"
        : /^[A-Z]/.test(token)
          ? "#49798a"
          : /^[{}|?:;]$/.test(token)
            ? C.muted
            : C.ink
    mono(c, token, x, y, size, color)
    x += c.measureText(token).width
  }
}
function wrapCode(source: string, max = 31) {
  if (source.length <= max) return [source]
  const parts = []
  let remaining = source
  while (remaining.length > max) {
    const at = remaining.lastIndexOf(" ", max)
    if (at < 8) break
    parts.push(remaining.slice(0, at))
    remaining = "    " + remaining.slice(at + 1)
  }
  parts.push(remaining)
  return parts
}
function codePanel(
  c: Context,
  x: number,
  y: number,
  w: number,
  title: string,
  rows: readonly (string | CodeRow)[],
  {
    highlight = [],
    tone = "bad",
    alpha = 1,
    scale = 1,
    diff = false,
    compact = false,
    contextHighlight = [],
    resolvedHighlight = []
  }: PanelOptions = {}
) {
  const longest = Math.max(...rows.map((r) => (typeof r === "string" ? r : r.source).length), 1)
  const lineH = compact ? 24 : 31,
    font = compact ? 18 : Math.min(23, (w - 80) / (longest * 0.62))
  const visualRows = rows.flatMap((row, i) => {
    const obj: CodeRow = typeof row === "string" ? { source: row } : row
    return (compact ? wrapCode(obj.source) : [obj.source]).map((source, part) => ({ source, obj, index: i, part }))
  })
  const h = 64 + visualRows.length * lineH + 22
  group(c, x, y, scale, alpha, () => {
    c.save()
    shadow(c)
    rect(c, -w / 2, -h / 2, w, h, 15, C.paper, C.line)
    c.restore()
    icon(c, "code", -w / 2 + 26, -h / 2 + 26, 18, C.blue)
    text(c, title, -w / 2 + 46, -h / 2 + 26, 12, C.muted, 650)
    line(
      c,
      [
        [-w / 2, -h / 2 + 49],
        [w / 2, -h / 2 + 49]
      ],
      C.line,
      1
    )
    visualRows.forEach(({ source, obj, index: i, part }, rowIndex) => {
      const yy = -h / 2 + 71 + rowIndex * lineH
      const isContext = contextHighlight.includes(i),
        isResolved = resolvedHighlight.includes(i)
      const rowTone = isResolved ? "good" : highlight.includes(i) ? tone : isContext ? "context" : tone
      const hot = highlight.includes(i) || obj.mark === "+" || obj.mark === "-" || isContext || isResolved
      if (hot)
        rect(
          c,
          -w / 2 + 10,
          yy - lineH / 2 + 1,
          w - 20,
          lineH - 1,
          4,
          rowTone === "good" ? C.goodBg : rowTone === "context" ? "#e6eff0" : C.soft
        )
      if (part === 0)
        mono(
          c,
          obj.mark ?? String(i + 1),
          -w / 2 + 17,
          yy,
          12,
          obj.mark === "-" ? C.bad : obj.mark === "+" ? C.blue : C.muted
        )
      syntax(c, source, -w / 2 + 45, yy, font)
      if (hot && !diff) {
        rect(
          c,
          -w / 2,
          yy - lineH / 2,
          3,
          lineH,
          1,
          rowTone === "good" ? C.good : rowTone === "context" ? C.blue : C.bad
        )
      }
    })
  })
  return h
}
function actor(c: Context, label: string, x: number, y: number, active: boolean, t: number, backend = false) {
  if (active) {
    c.beginPath()
    c.arc(x, y, 66 + Math.sin(t * 3) * 2, 0, Math.PI * 2)
    c.strokeStyle = backend ? "#eab79d" : "#9bb7ad"
    c.lineWidth = 1.4
    c.stroke()
  }
  c.save()
  shadow(c)
  dot(c, x, y, 50, label === "Hapsland" ? C.paper : backend ? C.accent : C.ink)
  c.restore()
  if (backend)
    for (let i = 0; i < 3; i++) rect(c, x - 20 + i * 15, y - 18 + (i % 2 ? 8 : 0), 9, 36 - (i % 2 ? 16 : 0), 4, C.paper)
  else if (label === "Hapsland" && brandImage?.complete && brandImage.naturalWidth)
    c.drawImage(brandImage, x - 48, y - 48, 96, 96)
  else if (label !== "Hapsland") icon(c, "code", x, y, 33, C.paper)
  text(c, label, x, y + 82, 21, C.ink, 650, "center")
  text(
    c,
    backend ? "REVIEW BACKEND" : label === "Hapsland" ? "CODE & FEEDBACK" : "CODING AGENT",
    x,
    y + 106,
    10,
    C.muted,
    600,
    "center"
  )
}

export const REVIEW_LOOP_PHASE_COUNT = 6
export interface ReviewLoopOptions {
  compact?: boolean
  reducedMotion?: boolean
}
function payload(c: Context, x: number, y: number, p: number, label: string) {
  group(c, x, y, 1, Math.min(1, p * 9, (1 - p) * 9), () => {
    c.save()
    shadow(c)
    rect(c, -86, -35, 172, 70, 13, C.paper, C.accent, 2)
    c.restore()
    icon(c, "code", -58, 0, 20, C.blue)
    text(c, label, -33, 0, 14, C.ink, 550)
  })
}
// Original travel: eased interpolation plus a sinusoidal arc.
function travel(c: Context, from: Point, to: Point, p: number, label: string, arc = 0) {
  const q = smooth(p)
  payload(c, mix(from[0], to[0], q), mix(from[1], to[1], q) + Math.sin(q * Math.PI) * arc, p, label)
}
function arrow(c: Context, from: Point, to: Point, color: string) {
  path(c, from, to, color)
  const direction = to[0] > from[0] ? 1 : -1
  line(c, [[to[0] - direction * 10, to[1] - 6], to, [to[0] - direction * 10, to[1] + 6]], color, 2)
}
function question(c: Context, x: number, y: number) {
  rect(c, x - 140, y - 80, 280, 160, 15, C.paper, C.line)
  tag(c, "REVIEW QUESTION", x - 120, y - 54)
  ;["Can this type store two", "copies of the same fact", "that disagree?"].forEach((label, index) =>
    text(c, label, x - 120, y - 14 + index * 25, 18, C.ink, 500)
  )
}
function feedback(c: Context, x: number, y: number) {
  rect(c, x - 410, y - 42, 820, 84, 13, C.soft, C.line)
  tag(c, "HAPSLAND → AGENT · CONFIGURED MESSAGE", x - 387, y - 20, C.bad)
  text(c, SITE_EXAMPLE.feedbackMessage, x - 387, y + 13, 20, C.ink, 500)
}
/** Deterministic rendering; FoldKit owns timing, controls and canvas commands. */
export function drawReviewLoop(c: Context, phase: number, progress: number, options: ReviewLoopOptions = {}) {
  const stage = Math.max(0, Math.min(REVIEW_LOOP_PHASE_COUNT - 1, Number.isFinite(phase) ? Math.floor(phase) : 0))
  const p = options.reducedMotion ? 0.5 : clamp(Number.isFinite(progress) ? progress : 0)
  const compact = options.compact === true,
    width = compact ? 640 : 1600,
    height = compact ? 420 : 900
  if (c.canvas.width !== width) c.canvas.width = width
  if (c.canvas.height !== height) c.canvas.height = height
  c.save()
  c.fillStyle = C.bg
  c.fillRect(0, 0, width, height)
  if (compact) {
    // Same round trip at a readable scale; source and feedback are HTML below.
    const agent: Point = [84, 185],
      hapsland: Point = [320, 185],
      jev: Point = [556, 185]
    c.beginPath()
    c.ellipse(320, 185, 237, 110, 0, 0, Math.PI * 2)
    c.strokeStyle = C.line
    c.lineWidth = 2
    c.setLineDash([5, 9])
    c.stroke()
    c.setLineDash([])
    arrow(c, [130, 135], [275, 135], C.blue)
    arrow(c, [365, 135], [510, 135], C.blue)
    arrow(c, [510, 240], [365, 240], C.muted)
    arrow(c, [275, 240], [130, 240], C.muted)
    actor(c, "Agent", ...agent, stage === 0 || stage === 4, 0)
    actor(c, "Hapsland", ...hapsland, stage === 1 || stage === 3, 0)
    actor(c, "Jev", ...jev, stage === 2 || stage === 5, 0, true)
    text(c, "Code + question", 436, 48, 24, C.ink, 550, "center")
    text(c, "Classification", 436, 340, 24, C.ink, 550, "center")
    text(c, "Feedback", 202, 340, 24, C.ink, 550, "center")
    const from = stage === 3 ? (p < 0.5 ? jev : hapsland) : stage === 0 || stage === 4 ? agent : hapsland
    const to = stage === 3 ? (p < 0.5 ? hapsland : agent) : stage === 0 || stage === 4 ? hapsland : jev
    const local = stage === 3 ? (p < 0.5 ? p * 2 : (p - 0.5) * 2) : p,
      q = smooth(local)
    dot(
      c,
      mix(from[0], to[0], q),
      mix(from[1], to[1], q) + Math.sin(q * Math.PI) * (stage === 3 ? 85 : -85),
      8,
      C.accent
    )
    c.restore()
    return
  }
  const l = {
    agent: [100, 640] as Point,
    root: [495, 447] as Point,
    child: [1010, 320] as Point,
    leaf: [1010, 605] as Point,
    q: [1375, 651] as Point,
    jev: [1455, 310] as Point
  }
  c.beginPath()
  c.ellipse(811, 485, 691, 250, -0.1, 0, Math.PI * 2)
  c.strokeStyle = C.line
  c.lineWidth = 2
  c.setLineDash([5, 9])
  c.stroke()
  c.setLineDash([])
  tag(c, "HAPSLAND · CODE SELECTION & FEEDBACK", 380, 140)
  actor(c, "Agent", ...l.agent, stage === 0 || stage === 4, 0)
  actor(c, "Jev", ...l.jev, stage === 2 || stage === 5, 0, true)
  if (stage === 0) {
    codePanel(
      c,
      ...l.root,
      510,
      "LOCAL EDIT",
      SITE_EXAMPLE.initialDiff.map((source) => ({ source: source.slice(1), mark: source[0] })),
      { diff: true }
    )
    travel(c, l.agent, l.root, p, "Changed code")
  } else {
    const repaired = stage >= 4
    path(c, [l.root[0] + 300, l.root[1] - 45], [l.child[0] - 191, l.child[1]], C.blue)
    path(c, [l.child[0], l.child[1] + 102], [l.leaf[0] - 191, l.leaf[1]], "#a8bca6")
    tag(c, "cover", 755, 292, C.blue)
    tag(c, "dimensions", 1035, 465, C.blue)
    codePanel(
      c,
      ...l.root,
      600,
      repaired ? "EXAMPLE EDIT" : "CHANGED TYPE",
      repaired ? SITE_EXAMPLE.after : SITE_EXAMPLE.before,
      { highlight: repaired ? [] : [3], contextHighlight: [1] }
    )
    codePanel(c, ...l.child, 382, "REFERENCED TYPE · ImageFile", SITE_EXAMPLE.dependencies[0], {
      compact: true,
      contextHighlight: [2]
    })
    codePanel(c, ...l.leaf, 382, "REFERENCED TYPE · Dimensions", SITE_EXAMPLE.dependencies[1], {
      compact: true,
      contextHighlight: [1]
    })
    question(c, ...l.q)
    if (stage === 2 || stage === 5) {
      text(c, "Selected code + question", 1300, 142, 20, C.ink, 500, "center")
      if (p < 0.65) travel(c, [890, 471], l.jev, p / 0.65, "Code + question")
      else travel(c, l.jev, l.q, (p - 0.65) / 0.35, "Classification")
    }
    if (stage === 3) {
      feedback(c, 795, 812)
      travel(c, l.q, l.agent, p, "Feedback", -72)
    }
    if (stage === 4) text(c, "The agent chooses how to respond.", 785, 812, 21, C.ink, 500, "center")
  }
  c.restore()
}
