import { Schema, Stream } from "effect"
import { brandReady } from "./review-loop-renderer"
import { Runtime, Subscription } from "foldkit"
import { COMMENT_TICK_MS, Message, Model, commentsAutoPlaying, init, update, view } from "./site"
import "./site.css"

const subscriptions = Subscription.make<Model, Message>()((entry) => ({
  commentPlayback: entry(
    { active: Schema.Boolean, index: Schema.Number },
    {
      modelToDependencies: (model) => ({ active: commentsAutoPlaying(model), index: model.commentIndex }),
      dependenciesToStream: ({ active }) =>
        active
          ? Stream.tick(COMMENT_TICK_MS).pipe(
              Stream.drop(1),
              Stream.map(() => Message.CommentTick())
            )
          : Stream.empty
    }
  ),
  heroPlayback: Subscription.animationFrame<Model, Message>({
    isActive: (model) => !model.reducedMotion,
    toMessage: (deltaMs) => Message.Tick({ deltaMs })
  }),
  swipeCompletion: entry(
    {},
    {
      modelToDependencies: () => ({}),
      dependenciesToStream: () =>
        Subscription.fromEvent({
          target: () => window,
          type: "pointerup",
          mapEvent: (event) =>
            Message.CommentSwipeEnd({ x: event.screenX, y: event.screenY, pointerId: event.pointerId })
        })
    }
  ),
  lostGesture: entry(
    {},
    {
      modelToDependencies: () => ({}),
      dependenciesToStream: () =>
        Subscription.fromEvent({
          target: () => window,
          type: "blur",
          mapEvent: () => Message.CommentSwipeCancel({ pointerId: null })
        })
    }
  ),
  swipeCancellation: entry(
    {},
    {
      modelToDependencies: () => ({}),
      dependenciesToStream: () =>
        Subscription.fromEvent({
          target: () => window,
          type: "pointercancel",
          mapEvent: (event) => Message.CommentSwipeCancel({ pointerId: event.pointerId })
        })
    }
  ),
  viewport: entry(
    {},
    {
      modelToDependencies: () => ({}),
      dependenciesToStream: () =>
        Subscription.fromEvent({
          target: () => window,
          type: "resize",
          mapEvent: () => Message.ViewportChanged({ compact: window.matchMedia("(max-width: 760px)").matches })
        })
    }
  ),
  motionPreference: entry(
    {},
    {
      modelToDependencies: () => ({}),
      dependenciesToStream: () =>
        Subscription.fromEvent({
          target: () => window.matchMedia("(prefers-reduced-motion: reduce)"),
          type: "change",
          mapEvent: (event) => Message.MotionChanged({ reduced: event.matches })
        })
    }
  )
}))
await brandReady
Runtime.run(
  Runtime.makeApplication({ Model, init, update, view, subscriptions, container: document.getElementById("root") })
)
