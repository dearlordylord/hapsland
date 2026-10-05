import { validateExpiryControl, type ExpiryControl } from "../../monkey-business/src/expiry-controls";
import type { HtmlBuilder } from "foldkit/html";
import { validateNoticeControl, type NoticeControl } from "../../monkey-business/src/notice-controls";
import type { CanonicalProjection } from "../../../src/canonical/adapter";

type NoticeAction = NoticeControl | ExpiryControl;
const validateAction = (control: NoticeAction): NoticeAction => control.kind === "expiryProfile" ? validateExpiryControl(control) : validateNoticeControl(control);

export function noticeAction(value: string): NoticeAction | undefined {
  if (!value.startsWith("notice:")) return undefined;
  return validateAction(JSON.parse(decodeURIComponent(value.slice(7))));
}
export function noticeControls<Message>(h: HtmlBuilder<Message>, projection: CanonicalProjection,
  scopes: readonly { partition: number; agent: string }[], act: (value: string) => Message, disabled: boolean) {
  const button = (label: string, control: NoticeAction) => h.button([h.Type("button"), h.Disabled(disabled),
    h.OnClick(act(`notice:${encodeURIComponent(JSON.stringify(validateAction(control)))}`))], [label]);
  return h.details([], [h.summary([], ["Operational notices"]),
    h.p([], ["Supply an operational failure, collect notices or acknowledge an owned notice. These diagnostics are separate from review findings."]),
    h.p([], ["Collection removes expired notices at their deadline. Changing these durations affects newly retained notices; existing notices keep their original lifetime."]),
    button("Use short notice lifetimes", { kind: "expiryProfile", profile: { pendingMs: 100, leaseMs: 20, cooldownMs: 200 } }),
    button("Use ordinary notice lifetimes", { kind: "expiryProfile", profile: { pendingMs: 600000, leaseMs: 30000, cooldownMs: 60000 } }),
    ...scopes.map(scope => h.fieldset([], [h.legend([], [scope.agent]),
      ...(["capacity", "backend", "credential", "output-limit"] as const).map(diagnostic => button(`Report ${diagnostic} failure`,
        { kind: "noticeFailure", target: { partition: scope.partition, group: scope.partition, key: 900000 + scope.partition }, diagnostic })),
      button("Collect notices", { kind: "noticeCollect", partition: scope.partition, group: scope.partition, composed: false, authorityBound: false, allowed: [] }),
    ])),
    ...projection.notices.map(notice => h.fieldset([], [h.legend([], [`Advicee ${notice.partition} · notice ${notice.id}`]),
      button("Lease notice", { kind: "noticeLease", target: { partition: notice.partition, group: notice.group, key: notice.id } }),
      button("Acknowledge notice", { kind: "noticeAcknowledge", target: { partition: notice.partition, group: notice.group, key: notice.id } }),
    ])),
  ]);
}
