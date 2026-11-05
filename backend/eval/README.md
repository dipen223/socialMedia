# Translation eval

A small, hand-written test set for the live-call translation, so a change to a
prompt, model or setting can be judged by a number instead of a feeling.

**Free check (no API calls):** `node scripts/eval-translation.mjs --dry`
proves the dataset and scoring work - it "translates" each item to its own
reference and should score 100.

**Real run (costs one API call per item, ~47):**

```bash
node scripts/eval-translation.mjs --yes --out before.json
# ...change the prompt / model / settings...
node scripts/eval-translation.mjs --yes --compare before.json
```

Useful filters: `--lang ne-NP`, `--tag number`, `--limit 10`.

## What the numbers mean

- **chrF (0-100):** how many character sequences the translation shares with
  the reference. Higher is closer. It is a rough proxy - there are many correct
  ways to translate a sentence, so treat differences under about 2 points as
  noise and look at the trend across many items.
- **Must-contain:** names, numbers and times that must survive translation (a
  reminder for the wrong hour is a real failure). This is the one to watch.
- **Latency p50 / p95:** typical and worst-case response time.

## Limits

The references were written by hand and are short and conversational. Have a
native speaker review them - especially Nepali, Hindi and Japanese - before
trusting small differences. Grow the set with the phrases your users actually
say; 47 items is a smoke test, not a benchmark.
