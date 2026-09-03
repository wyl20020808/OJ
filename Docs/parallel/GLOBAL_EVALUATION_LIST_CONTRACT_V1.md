# Global Evaluation List Contract V1

`GET /api/evaluations` is the authenticated Product API for the global
evaluation list. It is additive; `GET /api/submissions` remains the owner's
submission history API.

The response is ordered by `created_at DESC, id DESC`. `nextCursor` is an
opaque keyset cursor containing that ordering boundary. Clients must return it
unchanged and must not construct or interpret it.

```ts
type EvaluationListItem = {
  submissionId: string;
  problem: { id: string; slug: string; title: string };
  submitter: { id: string; displayName: string };
  languageProfileId: string;
  status: string;
  verdict?: 'AC' | 'WA' | 'CE' | 'RE' | 'TLE' | 'MLE';
  createdAt: string;
  completedAt?: string;
  totalTimeMs?: number;
  peakMemoryBytes?: number;
};
```

Supported bounded query parameters are `limit` (1-100), `cursor`,
`problemId`, `submitterId`, `language`, `status`, and `verdict`. Status and
verdict values are allowlisted. All values are bound query parameters; callers
cannot select an arbitrary ordering or SQL expression.

The list never contains submission source, hidden testcase data, credentials,
or account security fields. Time and memory are emitted only from the current
authoritative evaluation detail when present. Selecting a row opens the
existing submission detail endpoint, whose source authorization is separate.
