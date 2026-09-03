# Problem Capability Projection V1

Problem list and detail responses carry a server-derived projection:

```ts
capabilities: {
  canEdit: boolean;
}
```

`canEdit` is evaluated through the existing Problem authorization policy for
the current authenticated principal. It is true for an owner, including a
Guest owner, and for password-authenticated principals granted the canonical
`problem.edit` capability. It is false for ordinary non-owners unless their
assigned scope grants that capability.

The Web Problem Detail page uses `capabilities.canEdit` to show its edit
entry. The projection is presentation guidance only; `PATCH /api/problems/:id`
remains server-authorized and returns `403 FORBIDDEN` for an unauthorized
mutation.
