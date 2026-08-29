# PHASE 2B Environment and Secret Isolation Policy

The Guest receives a minimal, explicit environment allowlist containing only non-sensitive probe metadata and supervisor-provided correlation data. It must not inherit database passwords, Redis or MinIO credentials, session secrets, authorization tokens, cookies, cloud or proxy credentials, developer secrets, host-sensitive PATH entries, or arbitrary host environment variables.

The Supervisor controls all input, output, runtime and result paths. The Guest cannot select a host path, mount, output destination or environment value. Secret-marker probes must enumerate visible keys and inspect controlled values without reading real credentials. Logs and qualification results are sanitized to exclude source, secrets, cookies, lease tokens and host paths.

