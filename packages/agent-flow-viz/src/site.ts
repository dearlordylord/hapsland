import { Effect, Schema } from "effect";
import { Command, Runtime, type Update } from "foldkit";
import type { Document, HtmlBuilder } from "foldkit/html";
import { defineMessageUnion } from "foldkit/message";
import { SITE_EXAMPLE } from "./site-example";
import { drawReviewLoop } from "./review-loop-renderer";

import { SETUP_COPY, type SetupCopyTarget } from "./setup-copy";
import { copyText } from "./site-clipboard";
import productIcon from "./brand/product-icon.svg?url";
import githubIcon from "./github.svg?url";

const REPOSITORY = "https://github.com/dearlordylord/hapsland";
const guide = (name: string) => `${REPOSITORY}/blob/master/docs/${name}.md`;
export const Model = Schema.Struct({
  lifecycle: Schema.Literals([
    "collapsed",
    "expanding",
    "running",
    "collapsing",
  ]),
  hasRun: Schema.Boolean,
  phase: Schema.Number,
  transitionElapsed: Schema.Number,
  elapsed: Schema.Number,
  playing: Schema.Boolean,
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
  OpenExample: {},
  CloseExample: {},
  Play: {},
  Pause: {},
  HeroNext: {},
  Tick: { deltaMs: Schema.Number },
  MotionChanged: { reduced: Schema.Boolean },
  ViewportChanged: { compact: Schema.Boolean },
  LoopPainted: {},
});
export type Message = typeof Message.Type;
export const init: Runtime.ApplicationInit<Model, Message> = () => {
  const model: Model = {
    copyInstruction: "",
    copyInstall: "",
    copySetup: "",
    lifecycle: "collapsed",
    hasRun: false,
    phase: 0,
    transitionElapsed: 0,
    elapsed: 0,
    playing: false,
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
const closeExample = (model: Model): Model => ({
  ...model,
  lifecycle: model.reducedMotion ? "collapsed" : "collapsing",
  hasRun: true,
  transitionElapsed: 0,
  elapsed: 0,
  playing: false,
});
const ReturnExampleFocus = Command.define("ReturnExampleFocus", {
  messages: [Message.LoopPainted],
  execute: Effect.sync(() => {
    const panel = document.getElementById("example-expanded-body");
    if (panel?.contains(document.activeElement))
      document
        .getElementById("example-starter")
        ?.focus({ preventScroll: true });
    return Message.LoopPainted();
  }),
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
    OpenExample: () => ({
      model:
        model.lifecycle !== "collapsed"
          ? model
          : {
              ...model,
              lifecycle: model.reducedMotion ? "running" : "expanding",
              phase: 0,
              elapsed: 0,
              transitionElapsed: 0,
              playing: false,
            },
    }),
    CloseExample: () => ({ model: closeExample(model) }),
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
        lifecycle:
          reduced && model.lifecycle === "expanding"
            ? "running"
            : reduced && model.lifecycle === "collapsing"
              ? "collapsed"
              : model.lifecycle,
      },
    }),
    HeroNext: () => ({
      model:
        model.phase === 5
          ? closeExample(model)
          : { ...model, phase: model.phase + 1, elapsed: 0, playing: false },
    }),
    Tick: ({ deltaMs }) => {
      if (!Number.isFinite(deltaMs) || deltaMs < 0) return { model };
      const elapsed = model.elapsed + Math.min(deltaMs, 100);
      const transitionElapsed =
        model.transitionElapsed + Math.min(deltaMs, 100);
      if (model.lifecycle === "expanding")
        return {
          model:
            transitionElapsed >= 500
              ? {
                  ...model,
                  lifecycle: "running",
                  transitionElapsed: 0,
                  elapsed: 0,
                  playing: !model.reducedMotion,
                }
              : { ...model, transitionElapsed },
        };
      if (model.lifecycle === "collapsing")
        return {
          model:
            transitionElapsed >= 450
              ? {
                  ...model,
                  lifecycle: "collapsed",
                  transitionElapsed: 0,
                  elapsed: 0,
                }
              : { ...model, transitionElapsed },
        };
      if (!model.playing || model.lifecycle !== "running") return { model };
      if (elapsed < 4000) return { model: { ...model, elapsed } };
      return {
        model:
          model.phase === 5
            ? closeExample(model)
            : { ...model, phase: model.phase + 1, elapsed: 0 },
      };
    },
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
  const commands = [...(result.commands ?? [])];
  if (
    [
      "OpenExample",
      "Play",
      "Pause",
      "HeroNext",
      "Tick",
      "MotionChanged",
      "ViewportChanged",
    ].includes(message._tag) &&
    result.model.lifecycle !== "collapsed"
  )
    commands.push(paintLoop(result.model));
  if (
    model.lifecycle === "running" &&
    (result.model.lifecycle === "collapsing" ||
      result.model.lifecycle === "collapsed")
  )
    commands.push(ReturnExampleFocus());
  return { ...result, commands };
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
    [
      h.Id("review-example"),
      h.Class(
        `hero-illustration phase-${model.phase} lifecycle-${model.lifecycle}${model.hasRun ? " has-run" : ""}`,
      ),
    ],
    [
      h.button(
        [
          h.Id("example-starter"),
          h.Type("button"),
          h.Class("example-starter"),
          h.OnClick(Message.OpenExample()),
          h.AriaExpanded(model.lifecycle !== "collapsed"),
          h.AriaControls("example-expanded-body"),
          h.Inert(
            model.lifecycle === "running" || model.lifecycle === "expanding",
          ),
        ],
        [
          h.span([h.Class("starter-title")], ["Example edit"]),
          h.pre(
            [],
            [
              h.code(
                [],
                SITE_EXAMPLE.initialDiff.map((line) =>
                  h.span(
                    [h.Class(line.startsWith("+") ? "added-line" : "")],
                    [line + "\n"],
                  ),
                ),
              ),
            ],
          ),
          h.span(
            [h.Class("click-sticker")],
            [model.hasRun ? "Replay example ↗" : "✦ CLICK ME ✦",
              ...(!model.hasRun ? [0, 1, 2, 3].map(i => h.span([h.Class(`emitted-star star-${i}`), h.AriaHidden(true)], [i % 2 ? "✧" : "✦"])) : []),
            ],
          ),
        ],
      ),
      h.div(
        [
          h.Class("example-expand-grid"),
          h.Inert(
            model.lifecycle === "collapsed" || model.lifecycle === "collapsing",
          ),
        ],
        [
          h.div(
            [h.Id("example-expanded-body"), h.Class("example-expanded-body")],
            [
              h.canvas(
                [
                  h.Id("review-loop-canvas"),
                  h.Class("review-loop-canvas"),
                  h.Role("img"),
                  h.AriaLabel(PHASE_COPY[model.phase]),
                ],
                [
                  "Read the current stage below for the code and review details.",
                ],
              ),
              h.details(
                [h.Class("stage-transcript"), h.Open(model.compactLoop)],
                [
                  h.summary([], ["Read this stage"]),
                  h.div(
                    [h.Class("hero-scene gallery-scene")],
                    [
                      ...(model.phase === 0
                        ? [
                            codeCard(
                              "Agent edit",
                              SITE_EXAMPLE.initialDiff,
                              "DIFF",
                            ),
                          ]
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
                            codeCard(
                              "Gallery",
                              SITE_EXAMPLE.after,
                              "EXAMPLE EDIT",
                            ),
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
                    [
                      h.Class("phase-steps"),
                      h.AriaLabel("Illustration stages"),
                    ],
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
                                  model.playing
                                    ? Message.Pause()
                                    : Message.Play(),
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
                        [model.phase === 5 ? "Finish example" : "Next frame →"],
                      ),
                      h.button(
                        [h.Type("button"), h.OnClick(Message.CloseExample())],
                        ["Close example"],
                      ),
                    ],
                  ),
                  h.p(
                    [h.Class("sample-provenance muted")],
                    [
                      "Example adapted from our video demo. The edit is shown for illustration. ",
                      h.a(
                        [h.Href(SITE_EXAMPLE.recordedSample.source)],
                        ["Source ↗"],
                      ),
                    ],
                  ),
                ],
              ),
            ],
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
        [h.Class("skip-link"), h.Href("#review-example")],
        ["Skip to interactive example"],
      ),
      h.header(
        [h.Class("site-header")],
        [
          h.a(
            [h.Href("#"), h.Class("wordmark")],
            [
              h.img([h.Class("brand-mark"), h.Src(productIcon), h.Alt(""), h.Width("48"), h.Height("48")]),
              "Hapsland",
              h.span([h.Class("brand-period")], ["."]),
            ],
          ),
          h.a(
            [h.Href(REPOSITORY), h.Class("github-link"), h.AriaLabel("Hapsland repository on GitHub")],
            [h.img([h.Src(githubIcon), h.Alt(""), h.Width("24"), h.Height("24")])],
          ),
        ],
      ),
      h.section(
        [h.Class("hero section")],
        [
          h.div(
            [h.Class("hero-copy")],
            [
              h.h1(
                [],
                [
                  "IMMEDIATE CODE REVIEW for coding agents: ",
                  h.span(
                    [h.Style({ color: "var(--red)" })],
                    ["SLAP THAT HAND!"],
                  ),
                ],
              ),
              h.p(
                [h.Class("hero-subtitle")],
                ["to make invalid states unrepresentable™"],
              ),
              h.p(
                [h.Class("hero-intro")],
                [
                  "Hapsland expands the agent’s edit diff into changed types, functions, and their related definitions. That gives the review model much richer code context than the diff alone. Your rules are evaluated by ",
                  h.span([h.Class("blazingly")], ["BLAZINGLY"]),
                  " fast classifiers such as Jev, so feedback can arrive before more changes build on the decision. ",
                  h.strong(
                    [],
                    [
                      "Early feedback lets the agent reconsider a data or code decision before building more changes on that ",
                      h.span([h.Class("necromantic")], ["false"]),
                      " assumption. The agent decides how to respond.",
                    ],
                  ),
                ],
              ),
              h.div(
                [h.Class("hero-actions")],
                [
                  h.a(
                    [h.Href("#setup"), h.Class("text-link")],
                    ["Read the setup guide ↓"],
                  ),
                ],
              ),
            ],
          ),
          hero(model, h),
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
                  "Selected definitions contain source code. With credentials and no file settings, all otherwise eligible files are selected. The current recipient is Jev; there is no per-request approval prompt. The integration is designed for other classifiers too.",
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
          h.a([h.Href("#"), h.Class("wordmark")], [h.img([h.Class("brand-mark"), h.Src(productIcon), h.Alt(""), h.Width("48"), h.Height("48")]), "Hapsland. ", h.span([h.Class("footer-tagline")], ["Slap that hand."])]),
          h.a([h.Href(REPOSITORY), h.Class("github-link"), h.AriaLabel("Source on GitHub")], [h.img([h.Src(githubIcon), h.Alt(""), h.Width("28"), h.Height("28")])]),
        ],
      ),
    ],
  ),
});
