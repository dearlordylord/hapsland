import type { HtmlBuilder } from "foldkit/html";
import type { CanonicalProjection } from "../../../src/canonical/adapter";
import { validateJevIntervention, type JevInterventionControl, type JevInterventionReport } from "../../monkey-business/src/jev-interventions";

const outcomes = [
  ["neverSent", "Never sent"], ["backendFailure", "Backend failure"], ["timeout", "Timeout"],
  ["interrupted", "Interrupt"], ["finding", "Finding"], ["clear", "Clear"],
] as const;
const results = {
  applied: "Applied", requestMissing: "Refused: request is unknown, belongs to another scope, or has completed",
  requestAlreadyStarted: "Refused: an already started request cannot become never sent",
  requestAlreadyInterrupted: "Refused: an interrupted request must finish as interrupted",
} as const;

/** Browser action decoding only; shared Bend decides whether the target applies. */
export const jevFaultAction = (action: string): JevInterventionControl | undefined => {
  if (action.startsWith("credentials:")) {
    const credential = action.slice("credentials:".length);
    if (credential !== "unavailable" && credential !== "restore" && credential !== "rotate") throw new TypeError("invalid credential action");
    return validateJevIntervention({ kind: "credentials", action: credential });
  }
  if (!action.startsWith("jev-request:")) return undefined;
  const [identity, outcome, extra] = action.slice("jev-request:".length).split(":");
  if (!identity || extra !== undefined || !outcomes.some(([kind]) => kind === outcome)) throw new TypeError("invalid Jev request action");
  const values = identity.split(",").map(Number);
  if (values.length !== 5) throw new TypeError("Jev request target requires its full identity");
  const [partition, lifetime, round, operation, request] = values;
  if (partition === undefined || lifetime === undefined || round === undefined || operation === undefined || request === undefined) throw new TypeError("incomplete Jev request target");
  return validateJevIntervention({ kind: "jevRequest", target: { partition, lifetime, round, operation, request },
    outcome: outcome as typeof outcomes[number][0] });
};

export const jevFaultControls = <Message>(h: HtmlBuilder<Message>, projection: CanonicalProjection,
  reports: readonly JevInterventionReport[], act: (action: string) => Message, disabled: boolean) => {
  const button = (label: string, action: string) => h.button([h.Type("button"), h.Disabled(disabled), h.OnClick(act(action))], [label]);
  return h.details([h.Class("simulation-jev-interventions")], [
    h.summary([], ["Jev request interventions & credentials"]),
    h.p([], ["Request interventions affect the selected active request. Jev settings above affect future requests. Completed requests retain their recorded outcome."]),
    h.div([h.Class("simulation-controls")], [button("Make credentials unavailable", "credentials:unavailable"),
      button("Restore credentials", "credentials:restore"), button("Rotate credentials", "credentials:rotate")]),
    ...(projection.dispatch.requests.length ? projection.dispatch.requests.map(target => {
      const identity = [target.partition, target.lifetime, target.round, target.operation, target.request].join(",");
      return h.fieldset([], [
        h.legend([], [`Agent ${target.partition} · lifetime ${target.lifetime} · round ${target.round} · operation ${target.operation} · request ${target.request}`]),
        h.p([], [target.interrupted ? "Interrupted; awaiting settlement" : target.started ? "Started; awaiting outcome" : "Issued; not started"]),
        h.div([h.Class("simulation-controls")], outcomes.map(([outcome, label]) => button(label, `jev-request:${identity}:${outcome}`))),
      ]);
    }) : [h.p([], ["No active Jev requests."])]),
    h.ol([h.AriaLabel("Jev intervention results")], reports.slice(-12).map(report => {
      const target = report.control.kind === "jevRequest"
        ? `Agent ${report.control.target.partition}, lifetime ${report.control.target.lifetime}, round ${report.control.target.round}, operation ${report.control.target.operation}, request ${report.control.target.request}: ${report.control.outcome}`
        : `Credentials: ${report.control.action}`;
      return h.li([], [`${report.at} virtual ms · action ${report.controlSequence} · ${target} · ${results[report.result]}`]);
    })),
  ]);
};
