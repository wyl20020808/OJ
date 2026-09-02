# Problem Judge Data Authorization Matrix V1

Authenticated problem owners/managers/admin capabilities map to `problem.judge_data.view`, `.manage` and `.publish`; authoring also requires the existing `problem.edit` capability. View returns metadata only. Manage changes drafts and uploads. Publish validates and freezes a version. Contestants and guest users are denied hidden bytes, object credentials and Judge credentials.
