import { Schema } from "effect";
import { Runtime, Subscription } from "foldkit";
import { TRACES } from "./scenarios";
import { Message, Model, init, update, view } from "./main";
import "./style.css";

const subscriptions = Subscription.make<Model, Message>()((entry) => ({
  traceKeys: entry(
    { canRewind: Schema.Boolean, canAdvance: Schema.Boolean },
    {
      modelToDependencies: (model) => ({
        canRewind: model.trace >= 0 && model.cursor > 0,
        canAdvance: model.cursor < (TRACES[model.trace]?.events.length ?? 0),
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
