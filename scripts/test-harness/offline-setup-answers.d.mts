export type OfflineSetupAnswer = {
  readonly answer: "" | "y" | "n"
  readonly verification: boolean
  readonly navigation: boolean
}
export function offlineSetupAnswers(output: string): OfflineSetupAnswer[]
