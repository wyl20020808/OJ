# PHASE 1E-R Recovery Contract Addendum

This addendum clarifies, but does not redesign, the frozen Phase 1E contract.

- A lease is ownership proof: completion/retry/terminalization must require the current unexpired lease token and attempt.
- Stale recovery clears the expired lease, preserves linkage metadata, and either requeues once or terminalizes at the retry cap. A late old-token completion must not overwrite the recovered attempt.
- Submission is immutable intake source-of-truth; JudgeJob is a separate, Redis-authoritative local qualification object. `0006` remains unallocated unless a future approved durability decision requires relational persistence.
- Queue publication and idempotency must converge to one logical job per submission under concurrency and failure; exactly-once delivery is not claimed.
- Fake worker inputs are deterministic fixture/control metadata only. Submitted source remains inert text and never drives any compiler, interpreter, subprocess, filesystem or network action.
- Browser status must be server-backed after refresh and label all synthetic completion as `SYNTHETIC / QUALIFICATION ONLY / NOT A REAL EXECUTION VERDICT`.
- Recovery success requires every matrix row to have executed evidence, or the Phase remains PARTIAL.

