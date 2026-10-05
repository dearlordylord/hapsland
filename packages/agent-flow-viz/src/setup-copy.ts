export const SETUP_COPY = {
  instruction:
    "Install Hapsland for my coding agent using https://github.com/dearlordylord/hapsland/blob/master/docs/installation-workflows.md. Let me review and approve the setup changes interactively. Ask me to enter any Jev key in the masked setup prompt, not in chat.",
  install: "npm install -g --ignore-scripts @hapsland/hapsland",
  setup: "hapsland setup"
} as const
export type SetupCopyTarget = keyof typeof SETUP_COPY
