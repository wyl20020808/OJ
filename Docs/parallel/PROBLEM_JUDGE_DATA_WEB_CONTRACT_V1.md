# Problem Judge Data Web Contract V1

Product API namespace: `/api/problems/:problemId/judge-data`. Reads are overview, draft, versions, version detail and metadata-only testcase projections. Mutations are config PUT, testcase upload/ZIP upload, validate and publish. Browsers never receive object-storage credentials or hidden bytes. Published summaries contain version id/number, manifest hash, testcase count, checker, timestamps and publisher.
