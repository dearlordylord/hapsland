# Issue tracker: GitHub Issues

**Audience:** Contributors, including coding agents locating originating issues and owner decisions.

Work items for this repository live in [Hapsland Issues](https://github.com/dearlordylord/hapsland/issues). This file tells agent skills where to find issues; it does not replace product specifications or make research reports normative. Run `gh` from this repository so it selects the configured remote.

## Reading an originating issue

For a commit reference such as `#64`, first determine whether the number names an issue or a pull request. GitHub shares one number sequence: use `gh issue view 64 --json number,title,body,comments,labels,state,url`; if that number is a pull request, use `gh pr view 64 --json number,title,body,comments,state,url` and follow its linked issue. Read the issue body and relevant comments before treating it as the change's spec. A commit's `#number` is a lookup clue, not proof that the issue governs the diff.

For an issue URL, read that issue directly. If no issue is linked, check local specification files using the calling skill's search order; report an absent spec rather than inventing one.

## Tracker operations

- List open work: `gh issue list --state open --json number,title,labels,url` (add `--label` when needed).
- Create an issue: `gh issue create --title "..." --body-file <prepared-file>`.
- Comment: `gh issue comment <number> --body-file <prepared-file>`.
- Apply a label: `gh issue edit <number> --add-label "..."`.
- Close: `gh issue close <number>` after its acceptance criteria are met.

**Pull requests as a triage request surface: no.** PRs are implementation and review records; the project tracks requested work in Issues.
