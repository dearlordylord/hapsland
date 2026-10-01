import { Effect, Schema } from "effect";
import { Command, Runtime, type Update } from "foldkit";
import type { Document, HtmlBuilder } from "foldkit/html";
import { defineMessageUnion } from "foldkit/message";
import { replayImportScenario } from "./import-graph-replay";
import { projectFileGraphs } from "./import-graph-diagram";
import { SITE_SCENARIOS } from "./site-scenarios";
import { SITE_EXAMPLE } from "./site-example";
import { drawReviewLoop } from "./review-loop-renderer";

import { SETUP_COPY, type SetupCopyTarget } from "./setup-copy";
import { copyText } from "./site-clipboard";

const REPOSITORY = "https://github.com/dearlordylord/hapsland";
const guide = (name: string) => `${REPOSITORY}/blob/master/docs/${name}.md`;
export const Model = Schema.Struct({
  phase: Schema.Number,
  elapsed: Schema.Number,
  playing: Schema.Boolean,
  scenario: Schema.Number,
  checkpoint: Schema.Number,
  reducedMotion: Schema.Boolean,
  compactLoop: Schema.Boolean,
  copyInstruction: Schema.String,
  copyInstall: Schema.String,
  copySetup: Schema.String,
});
export interface Model extends Schema.Schema.Type<typeof Model> {}
export const Message = defineMessageUnion({
  Copy: { target: Schema.Literals(["instruction", "install", "setup"]) },
  Copied: {
    target: Schema.Literals(["instruction", "install", "setup"]),
    success: Schema.Boolean,
  },
  Play: {},
  Pause: {},
  HeroNext: {},
  Tick: { deltaMs: Schema.Number },
  MotionChanged: { reduced: Schema.Boolean },
  SelectCase: { index: Schema.Number },
  Next: {},
  Restart: {},
  ViewportChanged: { compact: Schema.Boolean },
  LoopPainted: {},
});
export type Message = typeof Message.Type;
export const init: Runtime.ApplicationInit<Model, Message> = () => {
  const model: Model = {
    copyInstruction: "",
    copyInstall: "",
    copySetup: "",
    phase: 0,
    elapsed: 0,
    playing: false,
    scenario: 0,
    checkpoint: 0,
    compactLoop: window.matchMedia("(max-width: 760px)").matches,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches,
  };
  return { model, commands: [paintLoop(model)] };
};
const CopyText = Command.define("CopyText", {
  args: { target: Schema.Literals(["instruction", "install", "setup"]) },
  messages: [Message.Copied],
  execute: ({ target }) =>
    copyText(SETUP_COPY[target]).pipe(
      Effect.map((success) => Message.Copied({ target, success })),
    ),
});
const copyField = (target: SetupCopyTarget) =>
  target === "instruction"
    ? "copyInstruction"
    : target === "install"
      ? "copyInstall"
      : "copySetup";
const copyButton = (
  model: Model,
  h: HtmlBuilder<Message>,
  target: SetupCopyTarget,
  label: string,
) =>
  h.div(
    [h.Class("copy-control")],
    [
      h.button(
        [
          h.Type("button"),
          h.Class(
            target === "instruction"
              ? "button-primary copy-button"
              : "copy-button",
          ),
          h.Id(`copy-${target}`),
          h.OnClick(Message.Copy({ target })),
        ],
        [label],
      ),
      h.span(
        [h.Class("copy-status"), h.AriaLive("polite")],
        [model[copyField(target)]],
      ),
    ],
  );
const PaintLoop = Command.define("PaintLoop", {
  args: {
    phase: Schema.Number,
    progress: Schema.Number,
    compact: Schema.Boolean,
    reducedMotion: Schema.Boolean,
  },
  messages: [Message.LoopPainted],
  execute: ({ phase, progress, compact, reducedMotion }) =>
    Effect.promise(async () => {
      await new Promise<void>((resolve) =>
        window.requestAnimationFrame(() => resolve()),
      );
      const canvas = document.getElementById("review-loop-canvas");
      if (canvas instanceof HTMLCanvasElement) {
        const ctx = canvas.getContext("2d");
        if (ctx)
          drawReviewLoop(ctx, phase, progress, { compact, reducedMotion });
      }
      return Message.LoopPainted();
    }),
});
const paintLoop = (model: Model) =>
  PaintLoop({
    phase: model.phase,
    progress: model.elapsed > 0 ? model.elapsed / 4000 : model.playing ? 0 : 1,
    compact: model.compactLoop,
    reducedMotion: model.reducedMotion,
  });
const updateModel = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    Copy: ({ target }) => ({
      model: { ...model, [copyField(target)]: "" },
      commands: [CopyText({ target })],
    }),
    Copied: ({ target, success }) => ({
      model: {
        ...model,
        [copyField(target)]: success
          ? "Copied"
          : "Could not copy. Select and copy the text below.",
      },
    }),
    Play: () => ({
      model: {
        ...model,
        phase: model.phase === 5 ? 0 : model.phase,
        elapsed: 0,
        playing: !model.reducedMotion,
      },
    }),
    Pause: () => ({ model: { ...model, playing: false } }),
    MotionChanged: ({ reduced }) => ({
      model: {
        ...model,
        reducedMotion: reduced,
        playing: false,
      },
    }),
    HeroNext: () => ({
      model: {
        ...model,
        phase: (model.phase + 1) % 6,
        elapsed: 0,
        playing: false,
      },
    }),
    Tick: ({ deltaMs }) => {
      if (!model.playing || !Number.isFinite(deltaMs) || deltaMs < 0)
        return { model };
      const elapsed = model.elapsed + Math.min(deltaMs, 100);
      if (elapsed < 4000) return { model: { ...model, elapsed } };
      const phase = Math.min(5, model.phase + 1);
      return { model: { ...model, phase, elapsed: 0, playing: phase < 5 } };
    },
    SelectCase: ({ index }) => ({
      model: {
        ...model,
        scenario: index >= 0 && index < SITE_SCENARIOS.length ? index : 0,
        checkpoint: 0,
      },
    }),
    Next: () => ({
      model: {
        ...model,
        checkpoint: Math.min(
          model.checkpoint + 1,
          SITE_SCENARIOS[model.scenario].checkpoints.length - 1,
        ),
      },
    }),
    Restart: () => ({ model: { ...model, checkpoint: 0 } }),
    ViewportChanged: ({ compact }) => ({
      model: { ...model, compactLoop: compact },
    }),
    LoopPainted: () => ({ model }),
  });
export const update = (
  model: Model,
  message: Message,
): Update.Return<Model, Message> => {
  const result = updateModel(model, message);
  return [
    "Play",
    "Pause",
    "HeroNext",
    "Tick",
    "MotionChanged",
    "ViewportChanged",
  ].includes(message._tag)
    ? {
        ...result,
        commands: [...(result.commands ?? []), paintLoop(result.model)],
      }
    : result;
};
const PHASES = [
  "The edit",
  "Related code",
  "Review request",
  "Agent feedback",
  "Example edit",
  "Recheck",
];
const PHASE_COPY = [
  "The agent adds a field for the cover image’s width. The diff shows the new line and the lines around it.",
  "Hapsland finds the changed Gallery type, then follows cover and dimensions to their definitions.",
  "Jev receives the selected source code and the review question, then returns a classification. Here both width fields mean the current cover image’s width.",
  "Hapsland sends the feedback message configured for this rule.",
  "One possible edit removes the second copy of the width. Later code can read it from the cover image instead.",
  "The revised type is reviewed with its related definitions again. Rechecking does not prove the code correct.",
];
const hero = (model: Model, h: HtmlBuilder<Message>) => {
  const codeCard = (name: string, lines: readonly string[], tag: string) =>
    h.div(
      [h.Class("example-code-card")],
      [
        h.div(
          [h.Class("code-heading")],
          [name, h.span([h.Class("code-tag")], [tag])],
        ),
        h.pre(
          [],
          [
            h.code(
              [],
              lines.map((line, i) =>
                h.span(
                  [
                    h.Class(
                      line.includes("coverWidth:")
                        ? "added-line"
                        : line.includes("cover:") ||
                            line.includes("dimensions:")
                          ? "reference-line"
                          : line.includes("width:")
                            ? "relevant-line"
                            : "",
                    ),
                  ],
                  [line + (i < lines.length - 1 ? "\n" : "")],
                ),
              ),
            ),
          ],
        ),
      ],
    );
  const dependencyGraph = (compact: boolean) => {
    const definitions = compact
      ? [
          [
            "interface Gallery {",
            "  cover: ImageFile;",
            "  coverWidth: number;",
            "  // other fields omitted",
            "}",
          ],
          [
            "interface ImageFile {",
            "  dimensions: Dimensions;",
            "  // other fields omitted",
            "}",
          ],
          [
            "interface Dimensions {",
            "  width: number;",
            "  // other fields omitted",
            "}",
          ],
        ]
      : [SITE_EXAMPLE.before, ...SITE_EXAMPLE.dependencies];
    return h.div(
      [
        h.Class(`hero-dependency-graph${compact ? " compact" : ""}`),
        h.AriaLabel(
          "Gallery references ImageFile through cover; ImageFile references Dimensions through dimensions",
        ),
      ],
      definitions.flatMap((lines, i) => [
        ...(i > 0
          ? [
              h.div(
                [h.Class("dependency-edge")],
                [
                  h.span(
                    [h.Class("dependency-edge-label")],
                    [i === 1 ? "cover" : "dimensions"],
                  ),
                  h.span(
                    [h.Class("dependency-arrow"), h.AriaHidden(true)],
                    ["↓"],
                  ),
                ],
              ),
            ]
          : []),
        codeCard(
          SITE_EXAMPLE.definitionNames[i],
          lines,
          compact ? "EXCERPT" : i === 0 ? "CHANGED TYPE" : "RELATED TYPE",
        ),
      ]),
    );
  };
  return h.div(
    [h.Class(`hero-illustration phase-${model.phase}`)],
    [
      h.div(
        [h.Class("illustration-top")],
        [
          h.span([h.Class("micro")], ["FROM AN EDIT TO A REVIEW"]),
          h.span([h.Class("demo-label")], ["Example"]),
        ],
      ),
      h.canvas(
        [
          h.Id("review-loop-canvas"),
          h.Class("review-loop-canvas"),
          h.Role("img"),
          h.AriaLabel(PHASE_COPY[model.phase]),
        ],
        ["Read the current stage below for the code and review details."],
      ),
      h.details(
        [h.Class("stage-transcript"), h.Open(model.compactLoop)],
        [
          h.summary([], ["Read this stage"]),
          h.div(
            [h.Class("hero-scene gallery-scene")],
            [
              ...(model.phase === 0
                ? [codeCard("Agent edit", SITE_EXAMPLE.initialDiff, "DIFF")]
                : []),
              ...(model.phase === 1 ? [dependencyGraph(false)] : []),
              ...(model.phase === 2
                ? [
                    dependencyGraph(true),
                    h.div(
                      [h.Class("rule-question")],
                      [
                        h.span([h.Class("micro")], ["REVIEW QUESTION"]),
                        h.p(
                          [],
                          [
                            "Can this type store two copies of the same fact that disagree?",
                          ],
                        ),
                      ],
                    ),
                  ]
                : []),
              ...(model.phase === 3
                ? [
                    h.div(
                      [h.Class("sample-feedback")],
                      [
                        h.span(
                          [h.Class("micro")],
                          ["FEEDBACK SENT TO THE AGENT"],
                        ),
                        h.p(
                          [h.Class("configured-feedback")],
                          [SITE_EXAMPLE.feedbackMessage],
                        ),
                      ],
                    ),
                  ]
                : []),
              ...(model.phase === 4
                ? [
                    codeCard("Gallery", SITE_EXAMPLE.after, "EXAMPLE EDIT"),
                    h.p(
                      [h.Class("repair-explanation")],
                      [
                        "Read the width from cover.dimensions.width instead of maintaining two copies.",
                      ],
                    ),
                    h.p(
                      [h.Class("muted")],
                      [
                        "This edit is shown for illustration. The agent chooses how to respond to feedback.",
                      ],
                    ),
                  ]
                : []),
              ...(model.phase === 5
                ? [
                    codeCard("Gallery", SITE_EXAMPLE.after, "RECHECK"),
                    ...SITE_EXAMPLE.dependencies.map((lines, i) =>
                      codeCard(
                        SITE_EXAMPLE.definitionNames[i + 1],
                        lines,
                        "RELATED TYPE",
                      ),
                    ),
                  ]
                : []),
            ],
          ),
        ],
      ),
      h.div(
        [h.Class("animation-bottom")],
        [
          h.ol(
            [h.Class("phase-steps"), h.AriaLabel("Illustration stages")],
            PHASES.map((phase, i) =>
              h.li(
                [
                  h.Class(
                    i === model.phase
                      ? "active"
                      : i < model.phase
                        ? "done"
                        : "",
                  ),
                ],
                [h.span([], [`0${i + 1}`]), phase],
              ),
            ),
          ),
          h.p(
            [h.Class("phase-caption"), h.AriaLive("polite")],
            [PHASE_COPY[model.phase]],
          ),
          h.div(
            [h.Class("animation-controls")],
            [
              ...(model.reducedMotion
                ? [
                    h.span(
                      [h.Class("muted")],
                      ["Reduced motion · manual steps"],
                    ),
                  ]
                : [
                    h.button(
                      [
                        h.Type("button"),
                        h.OnClick(
                          model.playing ? Message.Pause() : Message.Play(),
                        ),
                      ],
                      [
                        model.playing
                          ? "Pause animation"
                          : model.phase === 5
                            ? "Replay animation"
                            : "Play animation",
                      ],
                    ),
                  ]),
              h.button(
                [h.Type("button"), h.OnClick(Message.HeroNext())],
                ["Next frame →"],
              ),
            ],
          ),
          h.p(
            [h.Class("sample-provenance muted")],
            [
              "Example adapted from our video demo. The edit is shown for illustration. ",
              h.a([h.Href(SITE_EXAMPLE.recordedSample.source)], ["Source ↗"]),
            ],
          ),
        ],
      ),
    ],
  );
};
const demo = (model: Model, h: HtmlBuilder<Message>) => {
  const selected = SITE_SCENARIOS[model.scenario];
  const checkpoint = selected.checkpoints[model.checkpoint];
  const replay = replayImportScenario(
    selected.scenario,
    checkpoint.cursor,
    selected.limits,
  );
  const graph = projectFileGraphs(1, replay.history)[0];
  const accepted = [...graph.nodes.values()].filter(
    (node) => node.sizeAccepted === true,
  );
  const state = replay.states[0];
  const names = SITE_EXAMPLE.definitionNames;
  return h.section(
    [h.Id("explore"), h.Class("explore section")],
    [
      h.div(
        [h.Class("section-head")],
        [
          h.div(
            [],
            [
              h.p([h.Class("eyebrow")], ["SOURCE CONTROLS"]),
              h.h2([], ["Choose what code can leave your repository."]),
            ],
          ),
          h.span([h.Class("demo-label")], ["Interactive example"]),
        ],
      ),
      h.p(
        [h.Class("section-intro")],
        [
          "Try excluding a supporting file or limiting how much code is included. Compare what is read locally with what is selected for review. This example does not read your files or send a request.",
        ],
      ),
      h.div(
        [
          h.Class("case-picker"),
          h.Role("group"),
          h.AriaLabel("Traversal example"),
        ],
        SITE_SCENARIOS.map((item, index) =>
          h.button(
            [
              h.Type("button"),
              h.OnClick(Message.SelectCase({ index })),
              h.AriaPressed(String(index === model.scenario)),
              h.Class(index === model.scenario ? "selected" : ""),
            ],
            [item.title],
          ),
        ),
      ),
      h.div(
        [h.Class("demo-workspace")],
        [
          h.div(
            [h.Class("traversal")],
            [
              h.div([h.Class("tree-connector"), h.AriaHidden(true)], []),
              ...names.map((name, index) => {
                const node = graph.nodes.get(index + 1);
                const status = node?.sizeAccepted
                  ? "included"
                  : node?.reason === "Excluded"
                    ? "excluded"
                    : node?.reason === "TreeLimit"
                      ? "omitted"
                      : node?.status === "read requested"
                        ? "requested"
                        : "waiting";
                const label =
                  status === "included"
                    ? "Read locally · included"
                    : status === "excluded"
                      ? "Excluded before read"
                      : status === "omitted"
                        ? "Read locally · over size limit"
                        : status === "requested"
                          ? "Read requested"
                          : "Not reached yet";
                return h.div(
                  [h.Class(`definition-node node-${index} ${status}`)],
                  [
                    h.span(
                      [h.Class("node-kind")],
                      [index === 0 ? "CHANGED TYPE" : "RELATED TYPE"],
                    ),
                    h.strong([], [name]),
                    h.span([h.Class("node-status")], [label]),
                  ],
                );
              }),
            ],
          ),
          h.div(
            [h.Class("context-outline")],
            [
              h.p([h.Class("micro")], ["INCLUDED FOR REVIEW"]),
              h.div(
                [h.Class("outline-heading")],
                [
                  h.strong(
                    [],
                    [
                      `${accepted.length} ${accepted.length === 1 ? "definition" : "definitions"}`,
                    ],
                  ),
                  h.span(
                    [],
                    [
                      model.scenario === 2
                        ? state.treeBytes >= state.limits.treeBytes
                          ? "Code limit reached"
                          : "Capacity remaining"
                        : "Source code",
                    ],
                  ),
                ],
              ),
              h.div(
                [
                  h.Class(
                    model.scenario === 2
                      ? "budget-track"
                      : "budget-track budget-secondary",
                  ),
                  h.Role("img"),
                  h.AriaLabel(
                    state.treeBytes >= state.limits.treeBytes
                      ? "Code limit reached"
                      : "Code capacity remaining",
                  ),
                ],
                [
                  h.span(
                    [
                      h.Style({
                        width: `${(state.treeBytes / state.limits.treeBytes) * 100}%`,
                      }),
                    ],
                    [],
                  ),
                ],
              ),
              h.ol(
                [h.Class("included-list")],
                accepted.map((node) =>
                  h.li(
                    [],
                    [
                      h.strong([], [names[node.target - 1]]),
                      h.pre(
                        [],
                        [
                          h.code(
                            [],
                            [
                              (node.target === 1
                                ? SITE_EXAMPLE.before
                                : SITE_EXAMPLE.dependencies[node.target - 2]
                              ).join("\n"),
                            ],
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              h.p(
                [h.Class("muted outline-disclaimer")],
                [
                  "Review models have limited context. Hapsland caps the code it includes; rule questions also take space in the request. Checks that require a missing definition are skipped; other applicable checks may still run.",
                ],
              ),
            ],
          ),
        ],
      ),
      h.div(
        [h.Class("demo-bottom")],
        [
          h.div(
            [h.Class("step-explanation"), h.AriaLive("polite")],
            [
              h.span(
                [h.Class("micro")],
                [
                  `STEP ${model.checkpoint + 1} / ${selected.checkpoints.length}`,
                ],
              ),
              h.h3([], [checkpoint.title]),
              h.p([], [checkpoint.description]),
            ],
          ),
          h.div(
            [h.Class("demo-controls")],
            [
              h.button(
                [h.Type("button"), h.OnClick(Message.Restart())],
                ["Restart"],
              ),
              h.button(
                [
                  h.Type("button"),
                  h.Class("button-primary"),
                  h.OnClick(Message.Next()),
                  h.Disabled(
                    model.checkpoint === selected.checkpoints.length - 1,
                  ),
                ],
                ["Next step →"],
              ),
            ],
          ),
        ],
      ),
      h.details(
        [h.Class("technical-details")],
        [
          h.summary([], ["Implementation details"]),
          h.p(
            [],
            [
              "This replay uses the same compiled import-graph decision core as Hapsland. Paths and byte counts are synthetic facts; the page does not execute source capture, parsing, rule selection or Jev transport. The original recorded Gallery review used one file. Here the same declarations are placed in separate example files to demonstrate exclusions.",
            ],
          ),
          h.a(
            [h.Href("./index.html#import-graph")],
            ["Open the full architecture dashboard ↗"],
          ),
        ],
      ),
    ],
  );
};
export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: "Hapsland — review the decisions behind an edit",
  body: h.main(
    [h.Class("site")],
    [
      h.a(
        [h.Class("skip-link"), h.Href("#explore")],
        ["Skip to interactive example"],
      ),
      h.header(
        [h.Class("site-header")],
        [
          h.a(
            [h.Href("#"), h.Class("wordmark")],
            [
              h.span([h.Class("brand-mark"), h.AriaHidden(true)], ["H"]),
              "Hapsland",
              h.span([h.Class("brand-period")], ["."]),
            ],
          ),
          h.nav(
            [h.AriaLabel("Main navigation")],
            [
              h.a([h.Href("#explore")], ["The example"]),
              h.a([h.Href(guide("architecture"))], ["Architecture ↗"]),
              h.a(
                [h.Href(`${REPOSITORY}#installation`), h.Class("nav-setup")],
                ["Set up Hapsland ↗"],
              ),
            ],
          ),
        ],
      ),
      h.section(
        [h.Class("hero section")],
        [
          h.div(
            [h.Class("hero-copy")],
            [
              h.p([h.Class("eyebrow")], ["EARLY CODE REVIEW"]),
              h.h1(
                [],
                ["Review code changes with the definitions behind them."],
              ),
              h.p(
                [h.Class("hero-intro")],
                [
                  "Hapsland uses the agent’s edit diff to find changed types and functions, then expands them into a graph of related definitions. It reviews that source against your rules, giving the agent a chance to reconsider before more changes build on the decision.",
                ],
              ),
              h.div(
                [h.Class("hero-actions")],
                [
                  h.a(
                    [h.Href("#explore"), h.Class("button-primary")],
                    ["Follow one change ↓"],
                  ),
                  h.a(
                    [
                      h.Href(`${REPOSITORY}#installation`),
                      h.Class("text-link"),
                    ],
                    ["Read the setup guide ↗"],
                  ),
                ],
              ),
              h.p(
                [h.Class("hero-note")],
                [
                  "Early feedback lets the agent reconsider a data or code decision before building more changes on that assumption. The agent decides how to respond.",
                ],
              ),
            ],
          ),
          hero(model, h),
        ],
      ),
      h.div(
        [h.Class("principles")],
        [
          h.span([], [h.b([], ["01"]), " Related definitions"]),
          h.span([], [h.b([], ["02"]), " Rules you choose"]),
          h.span([], [h.b([], ["03"]), " A visible source boundary"]),
        ],
      ),
      h.section(
        [h.Class("section story-grid"), h.Id("control")],
        [
          h.article(
            [],
            [
              h.p([h.Class("eyebrow")], ["FILE SETTINGS"]),
              h.h2([], ["Choose which files can enter the review."]),
              h.p(
                [],
                [
                  "Sending source to another service is a data-sharing decision. Retention after submission depends on the review service’s policy. Set includes, exclusions and privacy exclusions to choose which files can be used. Supporting files pass the same checks before reading; a project’s include cannot restore your exclusion.",
                ],
              ),
              h.pre(
                [h.Class("config-example")],
                [
                  h.code(
                    [],
                    [
                      '{\n  "version": 1,\n  "includes": ["src/**"],\n  "privacyExcludes": ["src/private/**"]\n}',
                    ],
                  ),
                ],
              ),
              h.p(
                [h.Class("fine-print")],
                [
                  "Selected definitions contain source code. With credentials and no file settings, all otherwise eligible files are selected. The current recipient is Jev; there is no per-request approval prompt.",
                ],
              ),
              h.a(
                [h.Href(guide("configuration")), h.Class("text-link")],
                ["Explore file settings ↗"],
              ),
            ],
          ),
          h.article(
            [],
            [
              h.p([h.Class("eyebrow")], ["RULES"]),
              h.h2([], ["Built-in questions. Room for your own."]),
              h.p(
                [],
                [
                  "The built-in Noul rules ask about data and code design. Type rules examine what values a type permits. The built-in function rule asks whether a body uses structure its declaration does not reveal.",
                ],
              ),
              h.blockquote(
                [],
                [
                  "Can this type store the same fact twice, with copies that disagree?",
                ],
              ),
              h.p(
                [],
                [
                  "Jev classifies code against the questions; Hapsland uses the result and your settings to choose the feedback message. Add local rule packs for your team's concerns. Choose their scope, thresholds and feedback messages. Rules run only when the supplied code meets their evidence needs. No feedback does not mean every check passed: a check may be skipped or fail to run.",
                ],
              ),
              h.a(
                [
                  h.Href(`${guide("configuration")}#declarative-rule-packs`),
                  h.Class("text-link"),
                ],
                ["See custom rule packs ↗"],
              ),
            ],
          ),
        ],
      ),
      demo(model, h),
      h.section(
        [h.Class("section evidence")],
        [
          h.p([h.Class("eyebrow")], ["VERIFICATION"]),
          h.h2([], ["Checks behind source selection."]),
          h.div(
            [h.Class("evidence-row")],
            [
              h.span([], ["01 / PROOFS"]),
              h.div(
                [],
                [
                  h.h3([], ["Review models have limited context."]),
                  h.p(
                    [],
                    [
                      "Selected code and rule questions must share that space. Hapsland limits how much code is included. Formal proofs check that the code stays within its configured size limit.*",
                    ],
                  ),
                ],
              ),
            ],
          ),
          h.div(
            [h.Class("evidence-row")],
            [
              h.span([], ["02 / REPLAY"]),
              h.div(
                [],
                [
                  h.h3([], ["Replay the same decisions and failures."]),
                  h.p(
                    [],
                    [
                      "Deterministic simulation repeats source-selection decisions with the same inputs, including failures and recovery.",
                    ],
                  ),
                ],
              ),
            ],
          ),
          h.div(
            [h.Class("evidence-row")],
            [
              h.span([], ["03 / NATIVE TESTS"]),
              h.div(
                [],
                [
                  h.h3([], ["Control what reaches the review service."]),
                  h.p(
                    [],
                    [
                      "Your task prompt and agent conversation stay out of Jev review requests. Jev receives permitted source definitions and rule questions. Integration tests check file access, what is sent, and delivery to the agent.",
                    ],
                  ),
                ],
              ),
            ],
          ),
          h.p(
            [h.Class("verification-footnote muted")],
            [
              "* A checked exclusion case proves that the core issues no read command for the denied dependency. These proofs apply to stated properties and cases in the core logic. They do not prove absence of every leak across the core or the whole system. Simulation does not exercise real files or network transport.",
            ],
          ),
          h.a(
            [h.Href(guide("architecture")), h.Class("text-link")],
            ["Read the architecture and proof scope ↗"],
          ),
        ],
      ),
      h.section(
        [h.Class("section setup"), h.Id("setup")],
        [
          h.p([h.Class("eyebrow")], ["SETUP"]),
          h.h2([], ["Install and set up Hapsland."]),
          h.p(
            [],
            [
              "Requires npm and a supported Claude Code or Codex CLI installation.",
            ],
          ),
          h.div(
            [h.Class("agent-setup")],
            [
              h.h3([], ["Ask your agent to set it up"]),
              h.p(
                [],
                ["Copy this instruction into your agent’s conversation."],
              ),
              copyButton(model, h, "instruction", "Copy instruction"),
              h.pre(
                [h.Class("agent-instruction")],
                [h.code([], [SETUP_COPY.instruction])],
              ),
            ],
          ),
          h.details(
            [h.Class("manual-setup")],
            [
              h.summary([], ["Install manually"]),
              h.div(
                [h.Class("setup-command")],
                [
                  h.h3([], ["1. Install Hapsland"]),
                  copyButton(model, h, "install", "Copy installation command"),
                  h.pre([], [h.code([], [SETUP_COPY.install])]),
                ],
              ),
              h.div(
                [h.Class("setup-command")],
                [
                  h.h3([], ["2. Run setup in your Git repository"]),
                  copyButton(model, h, "setup", "Copy setup command"),
                  h.pre([], [h.code([], [SETUP_COPY.setup])]),
                ],
              ),
              h.p(
                [],
                [
                  "Uses your npm global installation. For permissions or PATH issues, see the installation guide.",
                ],
              ),
            ],
          ),
          h.p(
            [],
            [
              "Choose Claude Code, Codex CLI, or both. Setup previews the hooks, asks before applying them, and requests your Jev key if needed. Restart the selected client and complete its trust prompts.",
            ],
          ),
          h.p(
            [h.Class("fine-print")],
            [
              "The integration applies to your client profile. File settings determine which repositories and files can be reviewed. Setup itself sends no review request.",
            ],
          ),
          h.a(
            [h.Href(guide("installation-workflows")), h.Class("text-link")],
            ["Installation details and development builds ↗"],
          ),
          h.a(
            [h.Href(guide("status")), h.Class("text-link")],
            ["Check review activity ↗"],
          ),
        ],
      ),
      h.footer(
        [h.Class("site-footer")],
        [
          h.a([h.Href("#"), h.Class("wordmark")], ["Hapsland."]),
          h.p([], ["Hapsland is the integration. Jev is the review backend."]),
          h.a([h.Href(REPOSITORY)], ["Source on GitHub ↗"]),
        ],
      ),
    ],
  ),
});
