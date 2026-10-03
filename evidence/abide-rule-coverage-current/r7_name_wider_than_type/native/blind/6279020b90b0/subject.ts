export type EndpointUrl = `http://${string}` | `https://${string}`;

export interface CaseState {
  /** Presentation text. */
  displayLabel: string;
  /** An endpoint address must start with the HTTP or HTTPS scheme. This example checks that prefix only, not full URL validity. */
  endpointUrl: EndpointUrl;
}
