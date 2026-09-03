# Submission Source Visibility Matrix V1

| Principal | Global evaluation summary | Submission detail source |
| --- | --- | --- |
| Authenticated user | Allowed; source omitted | Own source only |
| Submission owner | Allowed; source omitted | Allowed |
| Privileged password session with `submission:view:any` | Allowed; source omitted | Allowed |
| Ordinary unrelated user | Allowed; source omitted | `403 FORBIDDEN` |
| Unauthenticated user | `401 UNAUTHENTICATED` | `401 UNAUTHENTICATED` |

The list and detail contracts are intentionally separate. A submission ID is
not authority to retrieve source. Root/super-admin behavior is achieved by the
same explicit `submission:view:any` capability path as other privileged roles;
no username-based bypass exists.
