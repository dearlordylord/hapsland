import { Schema, Stream } from "effect";
import { cameraGestures } from "./ensemble-camera";
import { Runtime, Subscription } from "foldkit";
import { CANONICAL_SCENARIOS, guidedIndex } from "./canonical-replay";
import { Message, Model, init, update, view } from "./production-main";
import "./style.css";

const subscriptions = Subscription.make<Model, Message>()((entry) => ({
  ensembleCamera: entry(
    { flat: Schema.Boolean, tilt: Schema.String, turn: Schema.String, zoom: Schema.String },
    {
      modelToDependencies: model => ({ flat: model.simulation.flat, tilt: model.simulation.tilt, turn: model.simulation.turn, zoom: model.simulation.zoom }),
      keepAliveEquivalence: (before, after) => before.flat === after.flat,
      dependenciesToStream: ({ flat }, read) => flat ? Stream.never : cameraGestures(
        () => ({ tilt: Number(read().tilt), turn: Number(read().turn), zoom: Number(read().zoom) }),
        angles => Message.SimulationCameraMoved(angles),
      ),
    },
  ),
  simulationPlayback: Subscription.animationFrame<Model, Message>({ isActive: model => model.simulation.playing, toMessage: deltaMs => Message.SimulationTick({ deltaMs }) }),
  traceKeys: entry(
    { canRewind: Schema.Boolean, canAdvance: Schema.Boolean },
    {
      modelToDependencies: (model) => ({
        canRewind: model.position > 0,
        canAdvance: model.position < model.history.length || guidedIndex(model.history as Parameters<typeof guidedIndex>[0], model.position) < CANONICAL_SCENARIOS[model.scenario].events.length,
      }),
      dependenciesToStream: ({ canRewind, canAdvance }) => Subscription.keyBindings<Message>({
        bindings: [
          { keys: "ArrowLeft", isEnabled: canRewind, whenRepeated: "Allow", mapEvent: () => Message.Rewound() },
          { keys: "ArrowRight", isEnabled: canAdvance, whenRepeated: "Allow", mapEvent: () => Message.HistoryForward() },
          { keys: "Shift+ArrowLeft", isEnabled: canRewind, mapEvent: () => Message.GuidedMoved({ direction: -1 }) },
          { keys: "Shift+ArrowRight", isEnabled: canAdvance, mapEvent: () => Message.GuidedMoved({ direction: 1 }) },
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
