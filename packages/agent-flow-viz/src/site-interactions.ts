import { brandReady, drawReviewLoop, REVIEW_LOOP_PHASE_COUNT } from "./review-loop-renderer"

const motion = window.matchMedia("(prefers-reduced-motion: reduce)")
const cycleMs = 4000

function enhanceComments() {
  const deck = document.querySelector(".comment-deck")
  const stack = document.querySelector(".comment-stack")
  if (!(deck instanceof HTMLElement) || !(stack instanceof HTMLElement)) return
  const cards = Array.from(stack.querySelectorAll<HTMLElement>(".comment-card"))
  if (!cards.length) return
  let index = 0
  let elapsed = 0
  let hovered = false
  let focus: "none" | "pointer" | "keyboard" = "none"
  let swipe: { x: number; y: number; pointerId: number } | undefined
  let timer: number | undefined
  const playing = () => !motion.matches && !hovered && focus !== "keyboard" && !swipe
  const render = () => {
    const active = playing()
    stack.setAttribute("aria-live", active ? "off" : "polite")
    stack.classList.toggle("is-swiping", !!swipe)
    cards.forEach((card, cardIndex) => {
      const position = (cardIndex - index + cards.length) % cards.length
      for (let slot = 0; slot <= 3; slot++)
        card.classList.toggle(`card-position-${slot}`, slot === Math.min(position, 3))
      card.setAttribute("aria-hidden", String(position !== 0))
      const fill = card.querySelector<HTMLElement>(".comment-progress-fill")
      if (fill) {
        fill.style.transition = position === 0 && active ? "transform 100ms linear" : "none"
        fill.style.transform = `scaleX(${position === 0 ? elapsed / cycleMs : 0})`
      }
    })
  }
  const syncPlayback = () => {
    window.clearInterval(timer)
    timer = undefined
    if (playing()) {
      timer = window.setInterval(() => {
        if (!playing()) {
          syncPlayback()
          return
        }
        elapsed += 100
        if (elapsed >= cycleMs) {
          elapsed = 0
          index = (index + 1) % cards.length
        }
        render()
      }, 100)
    }
    render()
  }
  const step = (direction: number) => {
    index = (index + direction + cards.length) % cards.length
    elapsed = 0
    syncPlayback()
  }
  deck.addEventListener("mouseenter", () => {
    hovered = true
    syncPlayback()
  })
  deck.addEventListener("mouseleave", () => {
    hovered = false
    syncPlayback()
  })
  deck.addEventListener("focusin", () => {
    if (focus !== "pointer") focus = "keyboard"
    syncPlayback()
  })
  deck.addEventListener("focusout", (event) => {
    if (event.relatedTarget instanceof Node && deck.contains(event.relatedTarget)) return
    focus = "none"
    syncPlayback()
  })
  deck.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    event.preventDefault()
    focus = "keyboard"
    step(event.key === "ArrowLeft" ? -1 : 1)
  })
  stack.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || swipe) return
    focus = "pointer"
    swipe = { x: event.screenX, y: event.screenY, pointerId: event.pointerId }
    syncPlayback()
  })
  window.addEventListener("pointerup", (event) => {
    if (!swipe || swipe.pointerId !== event.pointerId) return
    const dx = event.screenX - swipe.x
    const dy = event.screenY - swipe.y
    swipe = undefined
    if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1)
    else syncPlayback()
  })
  window.addEventListener("pointercancel", (event) => {
    if (swipe?.pointerId !== event.pointerId) return
    swipe = undefined
    syncPlayback()
  })
  window.addEventListener("blur", () => {
    swipe = undefined
    syncPlayback()
  })
  motion.addEventListener("change", syncPlayback)
  stack.dataset.enhanced = "true"
  syncPlayback()
}

async function enhanceReviewLoop() {
  const hero = document.querySelector(".hero-illustration")
  const canvas = document.getElementById("review-loop-canvas")
  if (!(hero instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) return
  const context = canvas.getContext("2d")
  if (!context) return
  const stages = Array.from(hero.querySelectorAll<HTMLButtonElement>("[data-site-phase]"))
  const frames = Array.from(hero.querySelectorAll<HTMLElement>("[data-site-frame]"))
  const caption = hero.querySelector(".phase-caption")
  const transcript = hero.querySelector(".stage-transcript")
  const compact = window.matchMedia("(max-width: 760px)")
  let phase = 0
  let elapsed = 0
  let previous: number | undefined
  let animation: number | undefined
  const paint = () =>
    drawReviewLoop(context, phase, motion.matches ? 1 : elapsed / cycleMs, {
      compact: compact.matches,
      reducedMotion: motion.matches
    })
  const renderStage = () => {
    for (let index = 0; index < REVIEW_LOOP_PHASE_COUNT; index++)
      hero.classList.toggle(`phase-${index}`, index === phase)
    for (const button of stages) {
      const index = Number(button.dataset.sitePhase)
      button.setAttribute("aria-current", index === phase ? "step" : "false")
      button.parentElement?.classList.toggle("active", index === phase)
      button.parentElement?.classList.toggle("done", index < phase)
      if (index === phase) {
        const text = button.dataset.siteCaption ?? ""
        canvas.setAttribute("aria-label", text)
        if (caption) caption.textContent = text
      }
    }
    for (const frame of frames) frame.hidden = Number(frame.dataset.siteFrame) !== phase
    caption?.setAttribute("aria-live", motion.matches ? "polite" : "off")
  }
  const tick = (now: number) => {
    elapsed += previous === undefined ? 0 : Math.min(Math.max(0, now - previous), 100)
    previous = now
    if (elapsed >= cycleMs) {
      elapsed = 0
      phase = (phase + 1) % REVIEW_LOOP_PHASE_COUNT
      renderStage()
    }
    paint()
    animation = window.requestAnimationFrame(tick)
  }
  const syncMotion = () => {
    if (animation !== undefined) window.cancelAnimationFrame(animation)
    animation = undefined
    previous = undefined
    elapsed = 0
    renderStage()
    paint()
    if (!motion.matches) animation = window.requestAnimationFrame(tick)
  }
  for (const button of stages) {
    button.addEventListener("click", () => {
      phase = Number(button.dataset.sitePhase)
      elapsed = 0
      previous = undefined
      renderStage()
      paint()
    })
  }
  const resize = () => {
    if (transcript instanceof HTMLDetailsElement) transcript.open = compact.matches
    paint()
  }
  await brandReady
  compact.addEventListener("change", resize)
  motion.addEventListener("change", syncMotion)
  resize()
  syncMotion()
}

// The temporary selection preserves copying on the HTTP/IP preview too.
function copyWithSelection(text: string): boolean {
  const focused = document.activeElement
  const selection = window.getSelection()
  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange())
    : []
  const inputSelection =
    focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement
      ? { start: focused.selectionStart, end: focused.selectionEnd, direction: focused.selectionDirection }
      : undefined
  const field = document.createElement("textarea")
  field.value = text
  field.setAttribute("aria-hidden", "true")
  field.style.cssText = "position:fixed;left:-9999px;top:0;"
  document.body.append(field)
  try {
    field.focus({ preventScroll: true })
    field.select()
    return document.execCommand("copy")
  } finally {
    field.remove()
    if (focused instanceof HTMLElement) focused.focus({ preventScroll: true })
    if (inputSelection && (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement)) {
      try {
        focused.setSelectionRange(inputSelection.start, inputSelection.end, inputSelection.direction ?? undefined)
      } catch {
        /* Some input types cannot hold a text selection. */
      }
    }
    if (selection) {
      selection.removeAllRanges()
      for (const range of ranges) selection.addRange(range)
    }
  }
}
async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      /* Try the HTTP-compatible selection path. */
    }
  }
  try {
    return copyWithSelection(text)
  } catch {
    return false
  }
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-copy-target][data-copy-value]")) {
  button.addEventListener("click", async () => {
    const status = button.parentElement?.querySelector(".copy-status")
    if (status) status.textContent = ""
    const copied = await copyText(button.dataset.copyValue ?? "")
    if (status) status.textContent = copied ? "Copied" : "Could not copy. Select and copy the text below."
  })
}
enhanceComments()
await enhanceReviewLoop()
