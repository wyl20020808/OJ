# Product Judge Lifecycle Web Contract V1

Browser calls only `/api/admin/judge/*`. Reads require `judge.view`, existing drain/offline/enable require `judge.manage`, and Add/Start/Stop/Restart plus pool mode/policy require `judge.lifecycle`, CSRF, reason, idempotency and concurrency guards. Product owns audit and safe error mapping; Judge/Host credentials never reach the browser.
