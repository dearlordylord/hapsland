# Comparisons with existing solutions

**Purpose:** Route readers to current architectural guidance and concise historical comparison summaries.
**Audience:** Prospective users; rule authors; evaluation contributors and reviewers.
**Status:** Maintained comparison navigation.
**Authority:** Maintained navigation for comparative research advisory; historical summaries are validation evidence, not a product contract or release certification.
**Expected use:** Understand the comparison's scope and limitations, then inspect its immutable source snapshot when needed.
**Lifecycle:** Update when a comparison owner or its scope changes; remove routes when their summaries are retired.

[Documentation guide](README.md) → Comparisons

## Abide

Start with [Hapsland and Abide](abide-comparison.md) for review inputs, access
and storage boundaries, and observations of joint operation. The completed
comparisons below use selected team-authored synthetic inputs. Their results do
not provide a general product ranking, release certification, or proof that one
workflow is generally more accurate.

| Historical comparison | Scope | Summary |
| --- | --- | --- |
| [Larger declarations and layout](abide-large-declaration-study.md) | Six scenarios, 36 input variants, 12 native defect sessions | 11/12 Hapsland repairs and 2/12 Abide repairs; one Hapsland false warning among 36 repeated clean observations |
| [Nine-rule comparison](abide-contextual-review-study.md) | Duplicate-fact cases and eight other rules plus a replacement resource-rule batch | 12/12 versus 1/12 on duplicate-fact cases; 6/16 versus 3/16 on the broader matrix |
| [Hapsland and Abide](abide-comparison.md) | Review inputs, file access and data retention | Architecture, joint operation and study limitations |

The studies used different input populations and repetitions, so their counts
are not combined. Their [immutable source reports and evidence](https://github.com/dearlordylord/hapsland/tree/e0a071afea12c1808f54aefba4ff2d44bc825341/docs)
preserve the full methodology and original artifacts. No current check regenerates
those historical outcomes.
