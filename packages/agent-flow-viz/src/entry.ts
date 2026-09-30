import { Schema } from "effect";
import { Runtime, Subscription } from "foldkit";
import { CANONICAL_SCENARIOS, guidedIndex } from "./canonical-replay";
import { Message, Model, init, update, view } from "./production-main";
import "./style.css";

const subscriptions = Subscription.make<Model, Message>()((entry) => ({
  simulationPlayback: Subscription.animationFrame<Model, Message>({ isActive: model => model.simulation.playing, toMessage: deltaMs => Message.SimulationTick({ deltaMs }) }),
  traceKeys: entry(
    { canRewind: Schema.Boolean, canAdvance: Schema.Boolean },
    {
      modelToDependencies: (model) => ({
        canRewind: model.position > 0,
        canAdvance: guidedIndex(model.history as Parameters<typeof guidedIndex>[0], model.position) < CANONICAL_SCENARIOS[model.scenario].events.length,
      }),
      dependenciesToStream: ({ canRewind, canAdvance }) => Subscription.keyBindings<Message>({
        bindings: [
          { keys: "ArrowLeft", isEnabled: canRewind, mapEvent: () => Message.Rewound() },
          { keys: "ArrowRight", isEnabled: canAdvance, mapEvent: () => Message.Advanced() },
        ],
      }),
    },
  ),
}));

const application = Runtime.makeApplication({
  Model,
  init,
  update,
  view,
  subscriptions,
  container: document.getElementById("root"),
  devTools: { Message },
});

Runtime.run(application);
