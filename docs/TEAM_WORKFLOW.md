# Two-computer workflow

| Branch | Owner | Scope |
| --- | --- | --- |
| `main` | Both | Reviewed, reproducible integration and submission baseline |
| `feature/research` | Computer A | Source verification, scientific analysis, prediction and validation, and export provenance |
| `feature/app` | Computer B | Interface, maps, visualization, demo deployment, and submission materials |

After remote approval and once the event opens, clone the same private repository on both computers, recreate the virtual environments, and start each feature branch from the same `main` commit. Each computer owns its branch. Give both teammates access to the private repo and independently authorized Earthdata access where needed. Keep raw downloads and local credentials on the authorized machine.

```powershell
# Computer A
git fetch origin
git switch -c feature/research origin/main

# Computer B
git fetch origin
git switch -c feature/app origin/main
```

Open draft pull requests into `main` once meaningful changes exist. Include what changed, reproduction steps, validation evidence, limitations, and interface changes. The other computer reviews; merge a small coherent PR after checks pass. Fetch `main` after each merge and bring it into the active feature branch before the next integration. Avoid force-pushing shared branches. Use private coordination to agree on any shared-file edits before making them.

## Handoffs

1. **Kickoff.** Agree on the first region and crop, module ownership, artifact format and required fields, coordinate and timestamp conventions, and a missing-data state. Record the contract in the repo once the event begins.
2. **First real sample.** Computer A provides a small approved export with provenance. Computer B verifies the UI can load it and present coverage, units, and timestamps. Review contract revisions together.
3. **Day-one integration.** Merge reproducible trend output and a minimal interface that loads it. Exercise the selected location and out-of-coverage path from a clean checkout.
4. **Day-two release.** Merge prediction evaluation and an evidence-supported UI state, if available. Verify the demo on both computers and freeze `main` for submission.

Keep the export format stable once both sides rely on it. Coordinate README, dependency, schema, and submission edits through the PR owner. Share only redistributable outputs, and record the source and regeneration steps. If the GitHub remote is pending, exchange commit IDs and coordinate an approved shared route before trying to merge independent work.
