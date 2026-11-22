---
name: principle-attack-the-premise
description: "Apply when two or more fixes that share one premise have failed the same gate, or when a second wait or retry for an external state change (policy, token, cache, propagation) has ended without the change. Write the premise down and test it directly before you write another fix or wait again."
disable-model-invocation: true
---

# Attack the Premise

When two or more fixes that share one premise have failed the same gate, suspect the premise, not the fixes. The same holds when a second wait or retry for an external state change (a policy, a token, a cache, a propagation) ends without the change. Before you wait again, read the record that shows the current state and when it was last fetched.

- Write the premise down: the one sentence every failed fix assumed.
- Test it before the next fix. Find an observation that would come out differently if the premise were false, and make it. Look at how the failures are distributed, not only at how large they are.
- If the evidence contradicts the premise, look for what the failures share that it did not predict. If one part always lands on the losing side, change what puts it there instead of adding a mechanism that cleans up after it.

Do not start the next fix or the next wait before the premise is written down and tested.
