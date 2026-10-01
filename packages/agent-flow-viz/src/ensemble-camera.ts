import { Effect, Queue, Stream } from "effect";

export interface CameraAngles { readonly tilt: number; readonly turn: number }
interface Drag {
  readonly viewport: HTMLElement;
  readonly pointerId: number;
  readonly touch: boolean;
  readonly x: number;
  readonly y: number;
  readonly initial: CameraAngles;
  moved: boolean;
}
const wrap = (angle: number) => ((angle + 180) % 360 + 360) % 360 - 180;

/** Browser pointer gestures are presentation inputs; the subscription owns listeners and capture. */
export const cameraGestures = <Message>(readAngles: () => CameraAngles, toMessage: (angles: CameraAngles) => Message): Stream.Stream<Message> =>
  Stream.callback<Message>(queue => Effect.acquireRelease(Effect.sync(() => {
    let drag: Drag | undefined;
    let suppressClickUntil = 0;
    let suppressedViewport: HTMLElement | undefined;
    const finish = () => {
      const ending = drag;
      drag = undefined;
      if (!ending) return;
      ending.viewport.classList.remove("is-dragging");
      if (ending.viewport.hasPointerCapture(ending.pointerId)) ending.viewport.releasePointerCapture(ending.pointerId);
    };
    const down = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0 || drag) return;
      const viewport = event.target instanceof Element ? event.target.closest<HTMLElement>(".is-spatial .ensemble-viewport") : null;
      if (!viewport) return;
      suppressClickUntil = 0;
      drag = { viewport, pointerId: event.pointerId, touch: event.pointerType === "touch", x: event.clientX, y: event.clientY, initial: readAngles(), moved: false };
    };
    const move = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.moved) {
        if (Math.hypot(dx, dy) < 6) return;
        // A vertical touch gesture belongs to page scrolling (touch-action: pan-y).
        if (drag.touch && Math.abs(dy) > Math.abs(dx)) { finish(); return; }
        drag.moved = true;
        drag.viewport.setPointerCapture(event.pointerId);
        drag.viewport.classList.add("is-dragging");
      }
      event.preventDefault();
      Queue.offerUnsafe(queue, toMessage({
        turn: Math.round(wrap(drag.initial.turn + dx * 0.35) * 10) / 10,
        tilt: Math.round(Math.max(0, Math.min(65, drag.initial.tilt - dy * 0.25)) * 10) / 10,
      }));
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId !== drag?.pointerId) return;
      if (drag.moved) {
        suppressClickUntil = performance.now() + 600;
        suppressedViewport = drag.viewport;
      }
      finish();
    };
    const cancel = (event: PointerEvent) => { if (event.pointerId === drag?.pointerId) finish(); };
    const click = (event: MouseEvent) => {
      if (event.detail === 0 || performance.now() > suppressClickUntil || !(event.target instanceof Node) || !suppressedViewport?.contains(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClickUntil = 0;
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointermove", move, { capture: true, passive: false });
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", cancel, true);
    document.addEventListener("lostpointercapture", cancel, true);
    document.addEventListener("click", click, true);
    window.addEventListener("blur", finish);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", cancel, true);
      document.removeEventListener("lostpointercapture", cancel, true);
      document.removeEventListener("click", click, true);
      window.removeEventListener("blur", finish);
      finish();
    };
  }), cleanup => Effect.sync(cleanup)).pipe(Effect.flatMap(() => Effect.never)));
