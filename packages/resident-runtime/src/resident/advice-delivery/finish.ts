import { type ResidentResponse } from "@hapsland/resident-transport/resident/protocol"

export const residentNoticeResponse = (response: ResidentResponse): boolean =>
  response.status === "advice" && response.findingCount === 0

export const residentResponseToken = (response: ResidentResponse): string =>
  response.status === "advice" ? response.token : ""
