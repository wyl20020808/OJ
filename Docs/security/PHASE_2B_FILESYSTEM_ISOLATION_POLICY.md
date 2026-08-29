# PHASE 2B Filesystem Isolation Policy

The Guest root is a minimal immutable runtime assembled by the Supervisor. Only the assigned input and a per-job workspace are visible. Runtime and testdata assets are read-only; the workspace is the sole writable location and has a size limit.

The host root, project source, `.git`, user home, credentials, Docker/WSL sockets, Redis/PostgreSQL/MinIO data, other job workspaces, other testdata, and `/mnt/c` are never mounted. Arbitrary bind mounts, device mounts and host paths are rejected. Path traversal and symlink resolution are checked against canonical workspace roots.

The Supervisor owns staging and result paths. On every close it removes workspace, mounts, temporary files, namespace references and cgroups, then verifies absence. Cleanup failure blocks closure and is surfaced as a security-significant error.

