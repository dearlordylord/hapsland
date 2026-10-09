// Shared website setup copy; instruction also generates README and installation-guide sections.
export const SETUP_COPY = {
  instruction:
    "Install Hapsland for my coding agent using https://github.com/dearlordylord/hapsland/blob/master/docs/installation-workflows.md. Let me review and approve the setup changes interactively. Ask me to enter any Jev key in the masked setup prompt, not in chat.",
  install: "brew install dearlordylord/tap/hapsland",
  setup: "hapsland setup"
} as const
export type SetupCopyTarget = keyof typeof SETUP_COPY
