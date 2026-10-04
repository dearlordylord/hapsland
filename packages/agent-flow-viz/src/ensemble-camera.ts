import { Effect, Queue, Stream } from "effect"

export type CameraMovement =
  | { readonly kind: "zoom"; readonly factor: number }
  | { readonly kind: "orbit"; readonly dx: number; readonly dy: number }
interface Drag {
  readonly viewport: HTMLElement
  readonly pointerId: number
  readonly touch: boolean
  x: number
  y: number
  moved: boolean
}

/** Browser pointer gestures are presentation inputs; the subscription owns listeners and capture. */
export const cameraGestures = <Message>(toMessage: (movement: CameraMovement) => Message): Stream.Stream<Message> =>
  Stream.callback<Message>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        let drag: Drag | undefined
        let pinch: { viewport: HTMLElement; distance: number } | undefined
        let suppressClickUntil = 0
        let suppressedViewport: HTMLElement | undefined
        let wheelDelta = 0
        let wheelFrame: number | undefined
        const finish = () => {
          const ending = drag
          drag = undefined
          if (!ending) return
          ending.viewport.classList.remove("is-dragging")
          if (ending.viewport.hasPointerCapture(ending.pointerId))
            ending.viewport.releasePointerCapture(ending.pointerId)
        }
        const down = (event: PointerEvent) => {
          if (pinch || !event.isPrimary || event.button !== 0 || drag) return
          const viewport =
            event.target instanceof Element ? event.target.closest<HTMLElement>(".is-spatial .ensemble-viewport") : null
          if (!viewport) return
          suppressClickUntil = 0
          drag = {
            viewport,
            pointerId: event.pointerId,
            touch: event.pointerType === "touch",
            x: event.clientX,
            y: event.clientY,
            moved: false
          }
        }
        const move = (event: PointerEvent) => {
          if (pinch || !drag || event.pointerId !== drag.pointerId) return
          const dx = event.clientX - drag.x
          const dy = event.clientY - drag.y
          if (!drag.moved) {
            if (Math.hypot(dx, dy) < 6) return
            // A vertical touch gesture belongs to page scrolling (touch-action: pan-y).
            if (drag.touch && Math.abs(dy) > Math.abs(dx)) {
              finish()
              return
            }
            drag.moved = true
            drag.viewport.setPointerCapture(event.pointerId)
            drag.viewport.classList.add("is-dragging")
          }
          event.preventDefault()
          drag.x = event.clientX
          drag.y = event.clientY
          Queue.offerUnsafe(queue, toMessage({ kind: "orbit", dx, dy }))
        }
        const up = (event: PointerEvent) => {
          if (event.pointerId !== drag?.pointerId) return
          if (drag.moved) {
            suppressClickUntil = performance.now() + 600
            suppressedViewport = drag.viewport
          }
          finish()
        }
        const cancel = (event: PointerEvent) => {
          if (event.pointerId === drag?.pointerId) finish()
        }
        const click = (event: MouseEvent) => {
          if (
            event.detail === 0 ||
            performance.now() > suppressClickUntil ||
            !(event.target instanceof Node) ||
            !suppressedViewport?.contains(event.target)
          )
            return
          event.preventDefault()
          event.stopImmediatePropagation()
          suppressClickUntil = 0
        }
        const zoom = (factor: number) => Queue.offerUnsafe(queue, toMessage({ kind: "zoom", factor }))
        const wheel = (event: WheelEvent) => {
          const viewport =
            event.target instanceof Element ? event.target.closest<HTMLElement>(".is-spatial .ensemble-viewport") : null
          if (!viewport) return
          if (!event.cancelable || event.deltaY === 0) return
          event.preventDefault()
          const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1)
          if (!Number.isFinite(pixels) || pixels === 0) return
          // Bound individual wheel notches and coalesce touchpad bursts once per frame.
          wheelDelta = Math.max(-80, Math.min(80, wheelDelta + Math.max(-60, Math.min(60, pixels))))
          if (wheelFrame !== undefined) return
          wheelFrame = requestAnimationFrame(() => {
            wheelFrame = undefined
            const delta = wheelDelta
            wheelDelta = 0
            zoom(Math.exp(-delta * 0.001))
          })
        }
        const distance = (touches: TouchList) =>
          Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)
        const touchStart = (event: TouchEvent) => {
          if (event.touches.length !== 2) return
          const viewport =
            event.target instanceof Element ? event.target.closest<HTMLElement>(".is-spatial .ensemble-viewport") : null
          if (!viewport) return
          event.preventDefault()
          finish()
          pinch = { viewport, distance: distance(event.touches) }
        }
        const touchMove = (event: TouchEvent) => {
          if (!pinch || event.touches.length !== 2) return
          event.preventDefault()
          const nextDistance = distance(event.touches)
          zoom(nextDistance / Math.max(1, pinch.distance))
          pinch.distance = nextDistance
        }
        const touchEnd = () => {
          pinch = undefined
        }
        document.addEventListener("wheel", wheel, { passive: false })
        document.addEventListener("touchstart", touchStart, { passive: false })
        document.addEventListener("touchmove", touchMove, { passive: false })
        document.addEventListener("touchend", touchEnd)
        document.addEventListener("touchcancel", touchEnd)
        document.addEventListener("pointerdown", down, true)
        document.addEventListener("pointermove", move, { capture: true, passive: false })
        document.addEventListener("pointerup", up, true)
        document.addEventListener("pointercancel", cancel, true)
        document.addEventListener("lostpointercapture", cancel, true)
        document.addEventListener("click", click, true)
        window.addEventListener("blur", finish)
        return () => {
          document.removeEventListener("wheel", wheel)
          document.removeEventListener("touchstart", touchStart)
          document.removeEventListener("touchmove", touchMove)
          document.removeEventListener("touchend", touchEnd)
          document.removeEventListener("touchcancel", touchEnd)
          pinch = undefined
          if (wheelFrame !== undefined) cancelAnimationFrame(wheelFrame)
          wheelDelta = 0
          document.removeEventListener("pointerdown", down, true)
          document.removeEventListener("pointermove", move, true)
          document.removeEventListener("pointerup", up, true)
          document.removeEventListener("pointercancel", cancel, true)
          document.removeEventListener("lostpointercapture", cancel, true)
          document.removeEventListener("click", click, true)
          window.removeEventListener("blur", finish)
          finish()
        }
      }),
      (cleanup) => Effect.sync(cleanup)
    ).pipe(Effect.flatMap(() => Effect.never))
  )
