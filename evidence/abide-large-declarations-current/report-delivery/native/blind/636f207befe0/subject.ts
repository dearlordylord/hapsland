/** A report is downloaded by its requester or emailed to recipients. Download has no recipient list; email has at least one recipient. */
export type CaseState =
  | {
      displayLabel: string;
      deliveryMode: "download";
      recipients?: never;
    }
  | {
      displayLabel: string;
      deliveryMode: "email";
      recipients: readonly [string, ...string[]];
    };
