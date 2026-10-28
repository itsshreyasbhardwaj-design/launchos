## What changed

<!-- One paragraph. -->

## Why

<!-- What problem this solves. -->

## Checklist

- [ ] `npm test` passes
- [ ] `npm run lint` and `npx tsc -p tsconfig.core.json --noEmit` pass
- [ ] Business logic lives in `src/core`, not in `src/app`
- [ ] New behaviour has a test; new **refusals** have a test that they refuse
- [ ] No new runtime dependency in `src/core`
- [ ] No paid service is required by anything added here

## Honesty check

- [ ] This does not report a number LaunchOS cannot evidence
- [ ] This does not publish, submit or send anything automatically
- [ ] Any new registry entry was verified by opening it, and its
      `verificationSource` says how
- [ ] If this changes a refusal, the description explains why the refusal was wrong
