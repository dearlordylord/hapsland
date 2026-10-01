import { Runtime, Subscription } from "foldkit";
import { Message, Model, init, update, view } from "./site";
import "./site.css";

const subscriptions = Subscription.make<Model, Message>()((entry) => ({
  heroPlayback: Subscription.animationFrame<Model, Message>({
    isActive: (model) =>
      model.lifecycle === "expanding" ||
      model.lifecycle === "collapsing" ||
      (model.lifecycle === "running" && model.playing),
    toMessage: (deltaMs) => Message.Tick({ deltaMs }),
  }),
  viewport: entry(
    {},
    {
      modelToDependencies: () => ({}),
      dependenciesToStream: () =>
        Subscription.fromEvent({
          target: () => window,
          type: "resize",
          mapEvent: () =>
            Message.ViewportChanged({
              compact: window.matchMedia("(max-width: 760px)").matches,
            }),
        }),
    },
  ),
  motionPreference: entry(
    {},
    {
      modelToDependencies: () => ({}),
      dependenciesToStream: () =>
        Subscription.fromEvent({
          target: () => window.matchMedia("(prefers-reduced-motion: reduce)"),
          type: "change",
          mapEvent: (event) =>
            Message.MotionChanged({ reduced: event.matches }),
        }),
    },
  ),
}));
Runtime.run(
  Runtime.makeApplication({
    Model,
    init,
    update,
    view,
    subscriptions,
    container: document.getElementById("root"),
  }),
);
