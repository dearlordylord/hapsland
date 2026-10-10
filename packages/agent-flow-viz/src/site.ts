import { Effect, Option, Schema } from "effect"
import { type Runtime, Command, type Update } from "foldkit"
import type { Document, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { SITE_EXAMPLE } from "./site-example"
import { drawReviewLoop } from "./review-loop-renderer"

import { SETUP_COPY, type SetupCopyTarget } from "../../agent-flow-projection/src/setup-copy"
import { copyText } from "./site-clipboard"
import productIcon from "./brand/product-icon.svg?url"
import githubIcon from "./github.svg?url"

const DOWNLOADS = "https://github.com/dearlordylord/hapsland-releases/releases/latest"
const REPOSITORY = "https://github.com/dearlordylord/hapsland"
const guide = (name: string) => `${REPOSITORY}/blob/master/docs/${name}.md`
export const Model = Schema.Struct({
  commentIndex: Schema.Number,
  commentElapsed: Schema.Number,
  commentSwipe: Schema.NullOr(Schema.Struct({ x: Schema.Number, y: Schema.Number, pointerId: Schema.Number })),
  commentsHovered: Schema.Boolean,
  commentsFocus: Schema.Literals(["none", "pointer", "keyboard"]),
  phase: Schema.Number,
  elapsed: Schema.Number,
  reducedMotion: Schema.Boolean,
  compactLoop: Schema.Boolean,
  copyInstruction: Schema.String,
  copyInstall: Schema.String,
  copySetup: Schema.String
})
export interface Model extends Schema.Schema.Type<typeof Model> {}
export const Message = defineMessageUnion({
  Copy: { target: Schema.Literals(["instruction", "install", "setup"]) },
  Copied: { target: Schema.Literals(["instruction", "install", "setup"]), success: Schema.Boolean },
  CommentStep: { direction: Schema.Literals(["previous", "next"]) },
  CommentSwipeStart: { x: Schema.Number, y: Schema.Number, pointerId: Schema.Number },
  CommentSwipeEnd: { x: Schema.Number, y: Schema.Number, pointerId: Schema.Number },
  CommentSwipeCancel: { pointerId: Schema.NullOr(Schema.Number) },
  CommentTick: {},
  CommentHover: { hovered: Schema.Boolean },
  CommentFocus: { focused: Schema.Boolean },
  HeroSelect: { phase: Schema.Number },
  Tick: { deltaMs: Schema.Number },
  MotionChanged: { reduced: Schema.Boolean },
  ViewportChanged: { compact: Schema.Boolean },
  LoopPainted: {}
})
export type Message = typeof Message.Type
export const init: Runtime.ApplicationInit<Model, Message> = () => {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const model: Model = {
    commentIndex: 0,
    commentElapsed: 0,
    commentSwipe: null,
    commentsHovered: false,
    commentsFocus: "none",
    copyInstruction: "",
    copyInstall: "",
    copySetup: "",
    phase: 0,
    elapsed: 0,
    compactLoop: window.matchMedia("(max-width: 760px)").matches,
    reducedMotion
  }
  return { model, commands: [paintLoop(model)] }
}
const CopyText = Command.define("CopyText", {
  args: { target: Schema.Literals(["instruction", "install", "setup"]) },
  messages: [Message.Copied],
  execute: ({ target }) =>
    copyText(SETUP_COPY[target]).pipe(Effect.map((success) => Message.Copied({ target, success })))
})
const copyField = (target: SetupCopyTarget) =>
  target === "instruction" ? "copyInstruction" : target === "install" ? "copyInstall" : "copySetup"
const copyButton = (model: Model, h: HtmlBuilder<Message>, target: SetupCopyTarget, label: string) =>
  h.div(
    [h.Class("copy-control")],
    [
      h.button(
        [
          h.Type("button"),
          h.Class(target === "instruction" ? "button-primary copy-button" : "copy-button"),
          h.Id(`copy-${target}`),
          h.OnClick(Message.Copy({ target }))
        ],
        [label]
      ),
      h.span([h.Class("copy-status"), h.AriaLive("polite")], [model[copyField(target)]])
    ]
  )
const PaintLoop = Command.define("PaintLoop", {
  args: { phase: Schema.Number, progress: Schema.Number, compact: Schema.Boolean, reducedMotion: Schema.Boolean },
  messages: [Message.LoopPainted],
  execute: ({ phase, progress, compact, reducedMotion }) =>
    Effect.promise(async () => {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
      const canvas = document.getElementById("review-loop-canvas")
      if (canvas instanceof HTMLCanvasElement) {
        const ctx = canvas.getContext("2d")
        if (ctx) drawReviewLoop(ctx, phase, progress, { compact, reducedMotion })
      }
      return Message.LoopPainted()
    })
})
const paintLoop = (model: Model) =>
  PaintLoop({
    phase: model.phase,
    progress: model.reducedMotion ? 1 : model.elapsed / 4000,
    compact: model.compactLoop,
    reducedMotion: model.reducedMotion
  })
const updateModel = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    Copy: ({ target }) => ({ model: { ...model, [copyField(target)]: "" }, commands: [CopyText({ target })] }),
    Copied: ({ target, success }) => ({
      model: { ...model, [copyField(target)]: success ? "Copied" : "Could not copy. Select and copy the text below." }
    }),
    CommentStep: ({ direction }) => ({
      model: {
        ...model,
        commentElapsed: 0,
        commentsFocus: "keyboard",
        commentIndex: (model.commentIndex + (direction === "next" ? 1 : COMMENTS.length - 1)) % COMMENTS.length
      }
    }),
    CommentSwipeStart: ({ x, y, pointerId }) => ({
      model: model.commentSwipe ? model : { ...model, commentsFocus: "pointer", commentSwipe: { x, y, pointerId } }
    }),
    CommentSwipeEnd: ({ x, y, pointerId }) => {
      const start = model.commentSwipe
      if (!start || start.pointerId !== pointerId) return { model }
      const horizontal = x - start.x
      const vertical = y - start.y
      const swipe = Math.abs(horizontal) >= 48 && Math.abs(horizontal) > Math.abs(vertical) * 1.5
      return {
        model: {
          ...model,
          commentSwipe: null,
          commentElapsed: swipe ? 0 : model.commentElapsed,
          commentIndex: swipe
            ? (model.commentIndex + (horizontal < 0 ? 1 : COMMENTS.length - 1)) % COMMENTS.length
            : model.commentIndex
        }
      }
    },
    CommentSwipeCancel: ({ pointerId }) => ({
      model:
        pointerId === null || model.commentSwipe?.pointerId === pointerId ? { ...model, commentSwipe: null } : model
    }),
    CommentTick: () => {
      if (!commentsAutoPlaying(model)) return { model }
      const elapsed = model.commentElapsed + COMMENT_TICK_MS
      return {
        model: {
          ...model,
          commentElapsed: elapsed % COMMENT_CYCLE_MS,
          commentIndex: elapsed >= COMMENT_CYCLE_MS ? (model.commentIndex + 1) % COMMENTS.length : model.commentIndex
        }
      }
    },
    CommentHover: ({ hovered }) => ({ model: { ...model, commentsHovered: hovered } }),
    CommentFocus: ({ focused }) => ({
      model: {
        ...model,
        commentsFocus: focused ? (model.commentsFocus === "pointer" ? "pointer" : "keyboard") : "none"
      }
    }),
    MotionChanged: ({ reduced }) => ({ model: { ...model, reducedMotion: reduced, elapsed: 0 } }),
    HeroSelect: ({ phase }) => ({ model: { ...model, phase, elapsed: 0 } }),
    Tick: ({ deltaMs }) => {
      if (!Number.isFinite(deltaMs) || deltaMs < 0) return { model }
      const elapsed = model.elapsed + Math.min(deltaMs, 100)
      if (model.reducedMotion) return { model }
      if (elapsed < 4000) return { model: { ...model, elapsed } }
      return { model: { ...model, phase: (model.phase + 1) % 6, elapsed: 0 } }
    },
    ViewportChanged: ({ compact }) => ({ model: { ...model, compactLoop: compact } }),
    LoopPainted: () => ({ model })
  })
export const update = (model: Model, message: Message): Update.Return<Model, Message> => {
  const result = updateModel(model, message)
  const commands = [...(result.commands ?? [])]
  if (["HeroSelect", "Tick", "MotionChanged", "ViewportChanged"].includes(message._tag))
    commands.push(paintLoop(result.model))
  return { ...result, commands }
}
export const COMMENT_TICK_MS = 100
const COMMENT_CYCLE_MS = 4000
type CodeToken = {
  readonly kind: "plain" | "keyword" | "type" | "string" | "function"
  readonly text: string
  readonly emphasis?: "conflict" | "attention"
}
// Fixed, pre-tokenized samples: the displayed source is never parsed at runtime.
const COMMENTS = [
  {
    label: "MEANINGLESS COMBINATIONS",
    quote: "Can a field be set in a state where it has no meaning?",
    code: [
      { kind: "keyword", text: "type" },
      { kind: "plain", text: " " },
      { kind: "type", text: "Order" },
      { kind: "plain", text: " = {\n  status: " },
      { kind: "string", text: '"pending"' },
      { kind: "plain", text: " | " },
      { kind: "string", text: '"delivered"' },
      { kind: "plain", text: ";\n  deliveredAt: " },
      { kind: "type", text: "Date" },
      { kind: "plain", text: " | " },
      { kind: "keyword", text: "null" },
      { kind: "plain", text: ";\n};\n\n" },
      { kind: "keyword", text: "const" },
      { kind: "plain", text: " order: " },
      { kind: "type", text: "Order" },
      { kind: "plain", text: " = {\n  status: " },
      { kind: "string", text: '"pending"' },
      { kind: "plain", text: ",\n" },
      { kind: "plain", text: "  deliveredAt: new Date()", emphasis: "conflict" },
      { kind: "plain", text: "\n};" }
    ],
    note: "This compiles. A pending order has no delivery time."
  },
  {
    label: "DOMAIN VALUES",
    quote: "Can values with different domain meanings be used interchangeably?",
    code: [
      { kind: "keyword", text: "type" },
      { kind: "plain", text: " " },
      { kind: "type", text: "UserId" },
      { kind: "plain", text: " = " },
      { kind: "type", text: "string" },
      { kind: "plain", text: ";\n" },
      { kind: "keyword", text: "type" },
      { kind: "plain", text: " " },
      { kind: "type", text: "OrderId" },
      { kind: "plain", text: " = " },
      { kind: "type", text: "string" },
      { kind: "plain", text: ";\n\n" },
      { kind: "keyword", text: "function" },
      { kind: "plain", text: " " },
      { kind: "function", text: "userPath" },
      { kind: "plain", text: "(id: " },
      { kind: "type", text: "UserId" },
      { kind: "plain", text: ") {\n  " },
      { kind: "keyword", text: "return" },
      { kind: "plain", text: " " },
      { kind: "string", text: "`/users/${id}`" },
      { kind: "plain", text: ";\n}\n\n" },
      { kind: "keyword", text: "const" },
      { kind: "plain", text: " orderId: " },
      { kind: "type", text: "OrderId" },
      { kind: "plain", text: " = " },
      { kind: "string", text: '"order-42"' },
      { kind: "plain", text: ";\n" },
      { kind: "function", text: "userPath" },
      { kind: "plain", text: "(orderId);" }
    ],
    note: "Example: userPath(orderId) compiles despite receiving an order ID."
  },
  {
    label: "PARTS OF ONE FACT",
    quote: "Can one part of a fact be supplied without the rest?",
    code: [
      { kind: "keyword", text: "type" },
      { kind: "plain", text: " " },
      { kind: "type", text: "MapPin" },
      { kind: "plain", text: " = {\n  latitude?: " },
      { kind: "type", text: "number" },
      { kind: "plain", text: ";\n  longitude?: " },
      { kind: "type", text: "number" },
      { kind: "plain", text: ";\n};\n\n" },
      { kind: "keyword", text: "const" },
      { kind: "plain", text: " pin: " },
      { kind: "type", text: "MapPin" },
      { kind: "plain", text: " = {\n" },
      { kind: "plain", text: "  latitude: 51.5", emphasis: "conflict" },
      { kind: "plain", text: "\n};" }
    ],
    note: "This compiles. Latitude alone cannot place a pin on a map."
  },
  {
    label: "ABSENCE CONFUSION",
    quote: "Can the same absence be represented in different ways?",
    code: [
      { kind: "keyword", text: "type" },
      { kind: "plain", text: " " },
      { kind: "type", text: "Person" },
      { kind: "plain", text: " = {\n" },
      { kind: "plain", text: "  middleName?: string | null;", emphasis: "attention" },
      { kind: "plain", text: "\n};\n\n" },
      { kind: "keyword", text: "const" },
      { kind: "plain", text: " people: " },
      { kind: "type", text: "Person" },
      { kind: "plain", text: "[] = [\n  {},\n  { middleName: " },
      { kind: "keyword", text: "null" },
      { kind: "plain", text: " },\n  { middleName: " },
      { kind: "string", text: '""' },
      { kind: "plain", text: " }\n];" }
    ],
    note: "No middle name, three representations. Callers must account for all three."
  },
  {
    label: "NAME AND TYPE",
    quote: "Does the type allow values its name rules out?",
    code: [
      { kind: "keyword", text: "type" },
      { kind: "plain", text: " " },
      { kind: "type", text: "Count" },
      { kind: "plain", text: " = " },
      { kind: "type", text: "number" },
      { kind: "plain", text: ";\n\n" },
      { kind: "keyword", text: "const" },
      { kind: "plain", text: " missing: " },
      { kind: "type", text: "Count" },
      { kind: "plain", text: " = " },
      { kind: "plain", text: "-1", emphasis: "conflict" },
      { kind: "plain", text: ";\n" },
      { kind: "keyword", text: "const" },
      { kind: "plain", text: " partial: " },
      { kind: "type", text: "Count" },
      { kind: "plain", text: " = " },
      { kind: "plain", text: "1.5", emphasis: "conflict" },
      { kind: "plain", text: ";" }
    ],
    note: "Both compile. A count of items cannot be negative or fractional."
  },
  {
    label: "VISIBLE DEPENDENCIES",
    quote: "Does the body read or change anything its declaration leaves out?",
    code: [
      { kind: "keyword", text: "function" },
      { kind: "plain", text: " " },
      { kind: "function", text: "isExpired" },
      { kind: "plain", text: "(at: " },
      { kind: "type", text: "number" },
      { kind: "plain", text: "): " },
      { kind: "type", text: "boolean" },
      { kind: "plain", text: " {\n  " },
      { kind: "keyword", text: "return" },
      { kind: "plain", text: " " },
      { kind: "type", text: "Date" },
      { kind: "plain", text: "." },
      { kind: "function", text: "now" },
      { kind: "plain", text: "() > at;\n}" }
    ],
    note: "Example: the result depends on a clock absent from the declaration."
  }
] as const satisfies readonly { label: string; quote: string; code: readonly CodeToken[]; note: string }[]
export const commentsAutoPlaying = (model: Model) =>
  !model.reducedMotion && !model.commentsHovered && model.commentsFocus !== "keyboard" && !model.commentSwipe
const commentDeck = (model: Model, h: HtmlBuilder<Message>) =>
  h.aside(
    [
      h.Class("comment-deck"),
      h.AriaLabel("Familiar code review comments"),
      h.OnMouseEnter(Message.CommentHover({ hovered: true })),
      h.OnMouseLeave(Message.CommentHover({ hovered: false })),
      h.OnFocusEnter(Message.CommentFocus({ focused: true })),
      h.OnFocusLeave(Message.CommentFocus({ focused: false })),
      h.OnKeyDownPreventDefault((key) =>
        key === "ArrowLeft" || key === "ArrowRight"
          ? Option.some(Message.CommentStep({ direction: key === "ArrowLeft" ? "previous" : "next" }))
          : Option.none()
      )
    ],
    [
      h.div(
        [
          h.Class(`comment-stack${model.commentSwipe ? " is-swiping" : ""}`),
          h.Id("review-comments"),
          h.Tabindex(0),
          h.AriaLabel("Review comments. Swipe left or right, or use the arrow keys."),
          h.AriaLive(commentsAutoPlaying(model) ? "off" : "polite"),
          h.OnPointerDown((_pointerType, button, x, y, _time, _clientX, _clientY, pointerId) =>
            button === 0 ? Option.some(Message.CommentSwipeStart({ x, y, pointerId })) : Option.none()
          )
        ],
        COMMENTS.map((comment, index) => {
          const position = (index - model.commentIndex + COMMENTS.length) % COMMENTS.length
          return h.article(
            [
              h.Key(comment.label),
              h.Class(`comment-card card-position-${Math.min(position, 3)}`),
              h.AriaHidden(position !== 0)
            ],
            [
              h.div(
                [h.Class("comment-card-heading")],
                [
                  h.span([h.Class("micro")], [comment.label]),
                  h.span([h.Class("comment-card-number"), h.AriaHidden(true)], [`0${index + 1}`])
                ]
              ),
              h.blockquote([], [comment.quote]),
              h.div(
                [h.Class("comment-code")],
                [
                  h.pre(
                    [],
                    [
                      h.code(
                        [],
                        comment.code.map((token: CodeToken) =>
                          h.span(
                            [h.Class(`code-${token.kind}${token.emphasis ? ` code-${token.emphasis}` : ""}`)],
                            [token.text]
                          )
                        )
                      )
                    ]
                  ),
                  h.p([], [comment.note])
                ]
              ),
              h.div(
                [h.Class("comment-progress"), h.AriaHidden(true)],
                [
                  h.div(
                    [
                      h.Class("comment-progress-fill"),
                      h.Style({
                        transform: `scaleX(${position === 0 ? model.commentElapsed / COMMENT_CYCLE_MS : 0})`,
                        transition: position === 0 && commentsAutoPlaying(model) ? "transform 100ms linear" : "none"
                      })
                    ],
                    []
                  )
                ]
              )
            ]
          )
        })
      )
    ]
  )

const PHASES = ["The edit", "Related code", "Review request", "Agent feedback", "Example edit", "Recheck"]
const PHASE_COPY = [
  "The agent adds a field for the cover image’s width. The diff shows the new line and the lines around it.",
  "Hapsland finds the changed Gallery type, then follows cover and dimensions to their definitions.",
  "Jev receives the selected source code and the review question, then returns a classification. Here both width fields mean the current cover image’s width.",
  "Hapsland sends the feedback message configured for this rule.",
  "One possible edit removes the second copy of the width. Later code can read it from the cover image instead.",
  "The revised type is reviewed with its related definitions again. Rechecking does not prove the code correct."
]
const hero = (model: Model, h: HtmlBuilder<Message>) => {
  const codeCard = (name: string, lines: readonly string[], tag: string) =>
    h.div(
      [h.Class("example-code-card")],
      [
        h.div([h.Class("code-heading")], [name, h.span([h.Class("code-tag")], [tag])]),
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
                        : line.includes("cover:") || line.includes("dimensions:")
                          ? "reference-line"
                          : line.includes("width:")
                            ? "relevant-line"
                            : ""
                    )
                  ],
                  [line + (i < lines.length - 1 ? "\n" : "")]
                )
              )
            )
          ]
        )
      ]
    )
  const dependencyGraph = (compact: boolean) => {
    const definitions = compact
      ? [
          ["interface Gallery {", "  cover: ImageFile;", "  coverWidth: number;", "  // other fields omitted", "}"],
          ["interface ImageFile {", "  dimensions: Dimensions;", "  // other fields omitted", "}"],
          ["interface Dimensions {", "  width: number;", "  // other fields omitted", "}"]
        ]
      : [SITE_EXAMPLE.before, ...SITE_EXAMPLE.dependencies]
    return h.div(
      [
        h.Class(`hero-dependency-graph${compact ? " compact" : ""}`),
        h.AriaLabel("Gallery references ImageFile through cover; ImageFile references Dimensions through dimensions")
      ],
      definitions.flatMap((lines, i) => [
        ...(i > 0
          ? [
              h.div(
                [h.Class("dependency-edge")],
                [
                  h.span([h.Class("dependency-edge-label")], [i === 1 ? "cover" : "dimensions"]),
                  h.span([h.Class("dependency-arrow"), h.AriaHidden(true)], ["↓"])
                ]
              )
            ]
          : []),
        codeCard(
          SITE_EXAMPLE.definitionNames[i],
          lines,
          compact ? "EXCERPT" : i === 0 ? "CHANGED TYPE" : "RELATED TYPE"
        )
      ])
    )
  }
  return h.div(
    [h.Id("review-example"), h.Class(`hero-illustration phase-${model.phase}`)],
    [
      h.div(
        [h.Id("example-expanded-body"), h.Class("example-expanded-body")],
        [
          h.canvas(
            [
              h.Id("review-loop-canvas"),
              h.Class("review-loop-canvas"),
              h.Role("img"),
              h.AriaLabel(PHASE_COPY[model.phase])
            ],
            ["Read the current stage below for the code and review details."]
          ),
          h.details(
            [h.Class("stage-transcript"), h.Open(model.compactLoop)],
            [
              h.summary([], ["Read this stage"]),
              h.div(
                [h.Class("hero-scene gallery-scene")],
                [
                  ...(model.phase === 0 ? [codeCard("Agent edit", SITE_EXAMPLE.initialDiff, "DIFF")] : []),
                  ...(model.phase === 1 ? [dependencyGraph(false)] : []),
                  ...(model.phase === 2
                    ? [
                        dependencyGraph(true),
                        h.div(
                          [h.Class("rule-question")],
                          [
                            h.span([h.Class("micro")], ["REVIEW QUESTION"]),
                            h.p([], ["Can this type store two copies of the same fact that disagree?"])
                          ]
                        )
                      ]
                    : []),
                  ...(model.phase === 3
                    ? [
                        h.div(
                          [h.Class("sample-feedback")],
                          [
                            h.span([h.Class("micro")], ["FEEDBACK SENT TO THE AGENT"]),
                            h.p([h.Class("configured-feedback")], [SITE_EXAMPLE.feedbackMessage])
                          ]
                        )
                      ]
                    : []),
                  ...(model.phase === 4
                    ? [
                        codeCard("Gallery", SITE_EXAMPLE.after, "EXAMPLE EDIT"),
                        h.p(
                          [h.Class("repair-explanation")],
                          ["Read the width from cover.dimensions.width instead of maintaining two copies."]
                        ),
                        h.p(
                          [h.Class("muted")],
                          ["This edit is shown for illustration. The agent chooses how to respond to feedback."]
                        )
                      ]
                    : []),
                  ...(model.phase === 5
                    ? [
                        codeCard("Gallery", SITE_EXAMPLE.after, "RECHECK"),
                        ...SITE_EXAMPLE.dependencies.map((lines, i) =>
                          codeCard(SITE_EXAMPLE.definitionNames[i + 1], lines, "RELATED TYPE")
                        )
                      ]
                    : [])
                ]
              )
            ]
          ),
          h.div(
            [h.Class("animation-bottom")],
            [
              h.ol(
                [h.Class("phase-steps"), h.AriaLabel("Illustration stages")],
                PHASES.map((phase, i) =>
                  h.li(
                    [h.Class(i === model.phase ? "active" : i < model.phase ? "done" : "")],
                    [
                      h.button(
                        [
                          h.Type("button"),
                          h.OnClick(Message.HeroSelect({ phase: i })),
                          h.AriaLabel(`Show stage ${i + 1}: ${phase}`),
                          h.AriaCurrent(i === model.phase ? "step" : "false")
                        ],
                        [h.span([], [`0${i + 1}`]), phase]
                      )
                    ]
                  )
                )
              ),
              h.p(
                [h.Class("phase-caption"), h.AriaLive(model.reducedMotion ? "polite" : "off")],
                [PHASE_COPY[model.phase]]
              )
            ]
          )
        ]
      )
    ]
  )
}
export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: "Hapsland — realtime semantic agentic feedback",
  body: h.main(
    [h.Class("site")],
    [
      h.a([h.Class("skip-link"), h.Href("#review-example")], ["Skip to interactive example"]),
      h.header(
        [h.Class("site-header")],
        [
          h.a(
            [h.Href("#"), h.Class("wordmark")],
            [
              h.img([h.Class("brand-mark"), h.Src(productIcon), h.Alt(""), h.Width("48"), h.Height("48")]),
              "Hapsland",
              h.span([h.Class("brand-period")], ["."])
            ]
          ),
          h.nav(
            [h.AriaLabel("Main navigation")],
            [
              h.a([h.Href("#review-example")], ["See an example"]),
              h.a([h.Href("#control")], ["Your controls"]),
              h.a([h.Href("#setup"), h.Class("nav-setup")], ["Get started"]),
              h.a(
                [h.Href(REPOSITORY), h.Class("github-link"), h.AriaLabel("Hapsland repository on GitHub")],
                [h.img([h.Src(githubIcon), h.Alt(""), h.Width("24"), h.Height("24")])]
              )
            ]
          )
        ]
      ),
      h.section(
        [h.Class("hero section")],
        [
          h.div(
            [h.Class("hero-lead")],
            [
              h.div(
                [h.Class("hero-copy")],
                [
                  h.h1([], ["IMMEDIATE CODE REVIEW for coding agents"]),
                  h.p([h.Class("hero-subtitle")], ["and make invalid states unrepresentable™"]),
                  h.p(
                    [h.Class("hero-intro")],
                    [
                      h.strong([], ["Catch questionable decisions"]),
                      " while your coding agent is still working. Hapsland reviews changed types and functions against your rules and catches mistakes before they waste tokens and time. ",
                      h.strong([], ["Stop context poisoning before it starts"])
                    ]
                  ),
                  h.div(
                    [h.Class("hero-actions")],
                    [
                      h.a([h.Href(DOWNLOADS), h.Class("button-primary")], ["Download Hapsland ↗"]),
                      h.a([h.Href("#setup"), h.Class("text-link")], ["Set up with your agent ↓"])
                    ]
                  ),
                  h.div(
                    [h.Class("hero-install")],
                    [
                      h.p([h.Class("hero-install-label")], ["Or install with Homebrew"]),
                      h.div(
                        [h.Class("hero-install-row")],
                        [h.pre([], [h.code([], [SETUP_COPY.install])]), copyButton(model, h, "install", "Copy")]
                      )
                    ]
                  )
                ]
              ),
              commentDeck(model, h)
            ]
          ),
          hero(model, h)
        ]
      ),
      h.section(
        [h.Class("section review-workflow"), h.AriaLabel("How review works")],
        [
          h.p([h.Class("eyebrow")], ["FROM EDIT TO FEEDBACK"]),
          h.h2([], ["Review the decision before more code depends on it."]),
          h.ol(
            [h.Class("workflow-steps")],
            [
              h.li(
                [],
                [
                  h.span([h.Class("step-number"), h.AriaHidden(true)], ["01"]),
                  h.h3([], ["Your agent makes an edit"]),
                  h.p([], ["Hapsland selects eligible changed declarations using your file settings."])
                ]
              ),
              h.li(
                [],
                [
                  h.span([h.Class("step-number"), h.AriaHidden(true)], ["02"]),
                  h.h3([], ["Your rules get code context"]),
                  h.p(
                    [],
                    ["Related definitions enrich the diff. Jev classifies the supplied code against your questions."]
                  )
                ]
              ),
              h.li(
                [],
                [
                  h.span([h.Class("step-number"), h.AriaHidden(true)], ["03"]),
                  h.h3([], ["Your agent gets feedback"]),
                  h.p(
                    [],
                    [
                      "Hapsland prepares a message from the result and your settings, so the agent can reconsider its approach."
                    ]
                  )
                ]
              )
            ]
          )
        ]
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
                  "Sending source to another service is a data-sharing decision. Retention after submission depends on the review service’s policy. Set includes, exclusions and privacy exclusions to choose which files can be used. Supporting files pass the same checks before reading; a project’s include cannot restore your exclusion."
                ]
              ),
              h.pre(
                [h.Class("config-example")],
                [
                  h.code(
                    [],
                    ['{\n  "version": 1,\n  "includes": ["src/**"],\n  "privacyExcludes": ["src/private/**"]\n}']
                  )
                ]
              ),
              h.p(
                [h.Class("fine-print")],
                [
                  "Selected definitions contain source code. With credentials and no file settings, all otherwise eligible files are selected. The current recipient is Jev; there is no per-request approval prompt. The integration is designed for other classifiers too."
                ]
              ),
              h.a([h.Href(guide("configuration")), h.Class("text-link")], ["Explore file settings ↗"])
            ]
          ),
          h.article(
            [],
            [
              h.p([h.Class("eyebrow")], ["RULES"]),
              h.h2([], ["Built-in questions. Room for your own."]),
              h.p(
                [],
                [
                  "Hapsland’s default rules ask about data and code design. Type rules examine what values a type permits. The built-in function rule asks whether a body uses structure its declaration does not reveal."
                ]
              ),
              h.blockquote([], ["Can this type store the same fact twice, with copies that disagree?"]),
              h.p(
                [],
                [
                  "Jev classifies code against the questions; Hapsland uses the result and your settings to choose the feedback message. Add local rules for your team's concerns. Choose their scope, thresholds and feedback messages. Rules run only when the supplied code meets their evidence needs. No feedback does not mean every check passed: a check may be skipped or fail to run."
                ]
              ),
              h.a([h.Href(`${guide("rules")}#editable-rule-files`), h.Class("text-link")], ["See custom rules ↗"])
            ]
          )
        ]
      ),
      h.section(
        [h.Class("section setup"), h.Id("setup")],
        [
          h.p([h.Class("eyebrow")], ["SETUP"]),
          h.h2([], ["Install and set up Hapsland."]),
          h.p([], ["Ready-made packages for macOS arm64 and Linux arm64. Runtime included; no source build required."]),
          h.div(
            [h.Class("download-strip")],
            [
              h.div(
                [],
                [
                  h.h3([], ["1. Install Hapsland"]),
                  h.a([h.Href(DOWNLOADS), h.Class("download-link")], ["Download a ready-made package ↗"])
                ]
              ),
              h.p([], ["macOS arm64 · Linux arm64 · Archives and checksums"])
            ]
          ),
          h.div(
            [h.Class("agent-setup")],
            [
              h.h3([], ["2. Set up your agent"]),
              h.p(
                [],
                [
                  "Copy this instruction into your agent’s conversation. Setup previews hook changes and asks before applying them."
                ]
              ),
              copyButton(model, h, "instruction", "Copy instruction"),
              h.pre([h.Class("agent-instruction")], [h.code([], [SETUP_COPY.instruction])])
            ]
          ),
          h.details(
            [h.Class("manual-setup")],
            [
              h.summary([], ["Run setup manually after installing"]),
              h.div(
                [h.Class("setup-command")],
                [
                  h.h3([], ["Run setup in your Git repository"]),
                  copyButton(model, h, "setup", "Copy setup command"),
                  h.pre([], [h.code([], [SETUP_COPY.setup])])
                ]
              ),
              h.p(
                [],
                [
                  "Homebrew installs the runtime and commands. Setup previews changes to your agent hooks before applying them."
                ]
              )
            ]
          ),
          h.p(
            [],
            [
              "Choose Claude Code, Codex CLI, or both. Setup previews the hooks, asks before applying them, and requests your Jev key if needed. Restart the selected client and complete its trust prompts."
            ]
          ),
          h.p(
            [h.Class("fine-print")],
            [
              "The integration applies to your client profile. File settings determine which repositories and files can be reviewed. Setup itself sends no review request."
            ]
          ),
          h.a(
            [h.Href(guide("installation-workflows")), h.Class("text-link")],
            ["Installation details and development builds ↗"]
          ),
          h.div(
            [h.Class("verify-setup")],
            [
              h.h3([], ["3. Check a new edit"]),
              h.p(
                [],
                [
                  "Restart the selected agent and complete its trust prompts. To inspect a review, enable local recording, make a new supported edit, then run:"
                ]
              ),
              h.pre([], [h.code([], ["hapsland dashboard"])]),
              h.p(
                [h.Class("fine-print")],
                [
                  "Recording is opt-in and contains source code and review messages. It does not backfill earlier edits. Opening the dashboard does not enable it."
                ]
              ),
              h.a(
                [h.Href(`${guide("status")}#opt-in-local-inspection`), h.Class("text-link")],
                ["Enable recording and inspect a review ↗"]
              )
            ]
          )
        ]
      ),
      h.footer(
        [h.Class("site-footer")],
        [
          h.a(
            [h.Href("#"), h.Class("wordmark")],
            [
              h.img([h.Class("brand-mark"), h.Src(productIcon), h.Alt(""), h.Width("48"), h.Height("48")]),
              "Hapsland. ",
              h.span([h.Class("footer-tagline")], ["Slap that hand."])
            ]
          ),
          h.a(
            [h.Href(REPOSITORY), h.Class("github-link"), h.AriaLabel("Source on GitHub")],
            [h.img([h.Src(githubIcon), h.Alt(""), h.Width("28"), h.Height("28")])]
          )
        ]
      )
    ]
  )
})
