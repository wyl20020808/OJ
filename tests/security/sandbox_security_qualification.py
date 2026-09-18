#!/usr/bin/env python3
"""Bounded Phase 6B-5 WSL sandbox security qualification client."""

from __future__ import annotations

import base64
import concurrent.futures
import hashlib
import json
import os
import pathlib
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

BASE_URL = os.environ["OJ_PHASE6B5_SUPERVISOR_URL"]
FIXTURE_ROOT = pathlib.Path(os.environ["OJ_PHASE6B5_FIXTURE_ROOT"])
RUN_ID = os.environ["OJ_PHASE6B5_RUN_ID"]
PROFILE = "cpp20-gcc-13-v1"
SUPERVISOR_UID = int(os.environ["OJ_PHASE6B5_SUPERVISOR_UID"])
SUPERVISOR_GID = int(os.environ["OJ_PHASE6B5_SUPERVISOR_GID"])


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def digest(value: bytes | str) -> str:
    if isinstance(value, str):
        value = value.encode()
    return hashlib.sha256(value).hexdigest()


def request_json(path: str, method: str = "GET", body: Any | None = None) -> tuple[int, Any]:
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(
        BASE_URL + path,
        data=data,
        method=method,
        headers={"content-type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=35) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        payload = error.read().decode(errors="replace")
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            pass
        return error.code, payload


def wait_result(path: str, key: str, value: str, timeout: float = 40) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    separator = "&" if "?" in path else "?"
    while time.monotonic() < deadline:
        status, payload = request_json(path + separator + urllib.parse.urlencode({key: value}))
        require(status == 200, f"status request failed: {status}")
        if payload.get("status") != "ACTIVE" and payload.get("outcome") != "SANDBOX_PROBE_RUNNING":
            return payload
        time.sleep(0.05)
    raise RuntimeError(f"bounded qualification timeout: {value}")


def event_value(raw: str, name: str) -> int:
    for line in str(raw).splitlines():
        fields = line.split()
        if len(fields) == 2 and fields[0] == name:
            return int(fields[1])
    return 0


def assert_residue_gone(result: dict[str, Any]) -> None:
    stage_values: list[dict[str, Any]] = []
    if result.get("resource_evidence"):
        stage_values.append(result)
    for name in ("compile", "runtime"):
        stage = result.get(name)
        if isinstance(stage, dict):
            stage_values.append(stage)
    for component in result.get("components", []):
        assert_residue_gone(component)
    record = result.get("aggregate_execution_set_record")
    if isinstance(record, dict):
        for testcase in record.get("testcases", []):
            member = testcase.get("record") or {}
            # Set-member records do not expose raw cgroup paths; cleanup_verified is authoritative.
            require(member.get("cleanup_verified") is True, "testcase cleanup not verified")
    for stage in stage_values:
        evidence = stage.get("resource_evidence") or stage.get("evidence") or {}
        cgroup = evidence.get("control_group")
        if cgroup:
            require(not pathlib.Path(cgroup).exists(), f"stale cgroup: {cgroup}")
    for sandbox_id in (result.get("compile_sandbox_id"), result.get("runtime_sandbox_id")):
        if sandbox_id:
            state = subprocess.run(
                ["/usr/bin/runc", "state", sandbox_id],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
            require(state.returncode != 0, f"stale runc container: {sandbox_id}")


def run_probe(probe_id: str, probe_hash: str, cancel: bool = False) -> dict[str, Any]:
    status, payload = request_json(
        "/v1/probes/start",
        "POST",
        {
            "probe_id": probe_id,
            "version": "1",
            "hash": probe_hash,
            "correlation_id": f"{RUN_ID}-{probe_id.lower()}",
        },
    )
    require(status == 202, f"{probe_id} start failed: {status} {payload}")
    if cancel:
        time.sleep(0.3)
        cancel_status, _ = request_json("/v1/probes/cancel", "POST", {"probe_id": probe_id})
        require(cancel_status == 200, f"{probe_id} cancel failed")
    result = wait_result("/v1/probes/status", "probe_id", probe_id)
    assert_residue_gone(result)
    return result


def fixture(name: str) -> str:
    return (FIXTURE_ROOT / name).read_text(encoding="utf-8")


def execution_request(name: str, source: str, input_bytes: bytes = b"") -> dict[str, Any]:
    request_id = f"{RUN_ID}-{name}"
    return {
        "protocol_version": "2C.3",
        "execution_request_id": request_id,
        "judge_job_id": f"{RUN_ID}-job-{name}",
        "submission_id": f"{RUN_ID}-submission-{name}",
        "attempt": 1,
        "correlation_id": f"{RUN_ID}-correlation-{name}",
        "problem_id": f"{RUN_ID}-problem",
        "problem_revision_id": f"{RUN_ID}-revision",
        "testdata_version_ref": f"{RUN_ID}-testdata",
        "testcase_id": f"{RUN_ID}-case-{name}",
        "testcase_input": list(input_bytes),
        "testcase_input_sha256": digest(input_bytes),
        "execution_profile_id": PROFILE,
        "language_profile_id": PROFILE,
        "source_snapshot_ref": f"{RUN_ID}-snapshot-{name}",
        "source_bytes": source,
        "source_sha256": digest(source),
        "controlled_input_id": f"{RUN_ID}-input-{name}",
        "deadline_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 90)),
        "cancellation_generation": 0,
    }


def start_execution(name: str, source: str, input_bytes: bytes = b"") -> str:
    body = execution_request(name, source, input_bytes)
    status, payload = request_json("/v1/executions/start", "POST", body)
    require(status == 202, f"execution {name} start failed: {status} {payload}")
    return body["execution_request_id"]


def run_execution(name: str, source: str, input_bytes: bytes = b"") -> dict[str, Any]:
    request_id = start_execution(name, source, input_bytes)
    result = wait_result("/v1/executions/status", "execution_request_id", request_id, 45)
    require(result.get("clean") is True, f"execution {name} cleanup failed")
    assert_residue_gone(result)
    return result


def parse_fixture_output(output: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in output.splitlines():
        if "=" in line:
            name, value = line.split("=", 1)
            values[name] = value
    return values


def manifest_hash(manifest: dict[str, Any]) -> str:
    parts = [
        "2C.4",
        manifest["problem_id"],
        manifest["problem_revision_id"],
        manifest["testdata_version_id"],
        manifest["testcase_set_id"],
        manifest["execution_profile_id"],
        str(len(manifest["entries"])),
    ]
    for entry in manifest["entries"]:
        parts.extend(
            [
                str(entry["index"]),
                entry["testcase_id"],
                entry["testdata_version_id"],
                entry["input_sha256"],
                entry["execution_profile_id"],
                entry.get("expected_output_sha256", ""),
            ]
        )
    return digest("\0".join(parts))


def run_testcase_set() -> dict[str, Any]:
    source = fixture("testcase-isolation.cpp")
    entries = []
    for index, value in enumerate((b"A\n", b"B\n")):
        entries.append(
            {
                "index": index,
                "testcase_id": f"case-{index}",
                "testdata_version_id": f"{RUN_ID}-testdata",
                "input": list(value),
                "input_sha256": digest(value),
                "execution_profile_id": PROFILE,
            }
        )
    manifest = {
        "problem_id": f"{RUN_ID}-problem",
        "problem_revision_id": f"{RUN_ID}-revision",
        "testdata_version_id": f"{RUN_ID}-testdata",
        "testcase_set_id": f"{RUN_ID}-set",
        "execution_profile_id": PROFILE,
        "entries": entries,
    }
    manifest["manifest_hash"] = manifest_hash(manifest)
    request_id = f"{RUN_ID}-testcase-set"
    status, payload = request_json(
        "/v1/execution-sets/start",
        "POST",
        {
            "protocol_version": "2C.4",
            "execution_set_request_id": request_id,
            "judge_job_id": f"{RUN_ID}-set-job",
            "submission_id": f"{RUN_ID}-set-submission",
            "attempt": 1,
            "correlation_id": f"{RUN_ID}-set-correlation",
            "manifest": manifest,
            "execution_policy": "RUN_ALL",
            "language_profile_id": PROFILE,
            "source_snapshot_ref": f"{RUN_ID}-set-snapshot",
            "source_bytes": source,
            "source_sha256": digest(source),
            "deadline_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 90)),
            "cancellation_generation": 0,
        },
    )
    require(status == 202, f"testcase set start failed: {status} {payload}")
    result = wait_result("/v1/execution-sets/status", "execution_set_request_id", request_id, 45)
    require(result.get("clean") is True, "testcase set cleanup failed")
    members = result["aggregate_execution_set_record"]["testcases"]
    require(len(members) == 2, "testcase set result count drift")
    require(base64.b64decode(members[0]["actual_stdout"]) == b"CASE_A_WRITTEN\n", "case A result drift")
    require(base64.b64decode(members[1]["actual_stdout"]) == b"CASE_B_ISOLATED\n", "testcase workspace leaked")
    assert_residue_gone(result)
    return result


def local_listener(stop: threading.Event, ready: threading.Event) -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listener.bind(("127.0.0.1", 19626))
        listener.listen(4)
        listener.settimeout(0.1)
        ready.set()
        while not stop.is_set():
            try:
                connection, _ = listener.accept()
                connection.close()
            except TimeoutError:
                pass


def main() -> None:
    status, health = request_json("/v1/health")
    require(status == 200 and health.get("real_submission_execution") is True, "isolated Supervisor unavailable")
    require(health.get("supervisor_uid") == SUPERVISOR_UID and health.get("supervisor_gid") == SUPERVISOR_GID, "Supervisor identity drift")
    capability_status, capabilities = request_json("/v1/executions/capabilities")
    require(capability_status == 200 and capabilities.get("real_submission_execution") is True, "execution capability preflight failed")

    stop_listener, listener_ready = threading.Event(), threading.Event()
    listener = threading.Thread(target=local_listener, args=(stop_listener, listener_ready), daemon=True)
    listener.start()
    require(listener_ready.wait(2), "local canary listener failed")

    probe_status, probe_catalog = request_json("/v1/probes")
    require(probe_status == 200, "probe catalog unavailable")
    hashes = {item["probe_id"]: item["sha256"] for item in probe_catalog["items"]}
    probe_results: dict[str, Any] = {}
    for probe_id in (
        "SANDBOX_PROBE_QUALIFICATION",
        "SANDBOX_PROBE_CPU_LIMIT",
        "SANDBOX_PROBE_MEMORY_LIMIT",
        "SANDBOX_PROBE_PIDS_LIMIT",
        "SANDBOX_PROBE_OUTPUT_LIMIT",
        "SANDBOX_PROBE_WORKSPACE_LIMIT",
        "SANDBOX_PROBE_WALL_TIMEOUT",
        "SANDBOX_PROBE_ABNORMAL_EXIT",
        "SANDBOX_PROBE_CONCURRENT_RESOURCES",
    ):
        result = run_probe(probe_id, hashes[probe_id])
        require(result.get("qualification_pass") is True and result.get("clean") is True, f"{probe_id} failed")
        probe_results[probe_id] = result
    cancelled = run_probe("SANDBOX_PROBE_CANCELLATION", hashes["SANDBOX_PROBE_CANCELLATION"], cancel=True)
    require(cancelled.get("qualification_pass") is True and cancelled.get("outcome") == "SANDBOX_CANCELLED", "cancellation failed")

    full_payload = json.loads(probe_results["SANDBOX_PROBE_QUALIFICATION"]["stdout"])
    require(full_payload["pid_is_init"] is True and full_payload["visible_pids"] == 1, "trusted process isolation failed")
    require(full_payload["cap_eff"] == "0000000000000000" and full_payload["no_new_privileges"] == "1", "trusted privilege isolation failed")
    require(full_payload["seccomp_mode"] == 2 and full_payload["default_route"] is False, "trusted seccomp/network evidence failed")

    memory_evidence = probe_results["SANDBOX_PROBE_MEMORY_LIMIT"]["evidence"]
    require(event_value(memory_evidence["memory_events"], "max") > 0, "trusted memory event absent")
    pids_evidence = probe_results["SANDBOX_PROBE_PIDS_LIMIT"]["evidence"]
    require(event_value(pids_evidence["pids_events"], "max") > 0, "trusted pids event absent")
    cpu_evidence = probe_results["SANDBOX_PROBE_CPU_LIMIT"]["evidence"]
    require(not str(cpu_evidence["cpu_max"]).startswith("max"), "trusted CPU quota absent")
    require(event_value(cpu_evidence["cpu_stat"], "nr_throttled") > 0, "CPU throttling absent")
    concurrent_components = probe_results["SANDBOX_PROBE_CONCURRENT_RESOURCES"]["components"]
    require(len(concurrent_components) == 2, "trusted concurrency component count drift")
    require(concurrent_components[0]["evidence"]["control_group"] != concurrent_components[1]["evidence"]["control_group"], "trusted cgroup collision")

    isolation_source = fixture("isolation.cpp").replace(
        "PHASE6B5_HOST_CANARY_PATH", os.environ["OJ_PHASE6B5_HOST_CANARY"]
    ).replace(
        "PHASE6B5_SIBLING_CANARY_PATH", os.environ["OJ_PHASE6B5_SIBLING_CANARY"]
    )
    isolation = run_execution("isolation", isolation_source)
    require(isolation["pipeline_outcome"] == "PIPELINE_COMPLETED", "isolation fixture did not complete")
    isolation_checks = parse_fixture_output(isolation["runtime"]["stdout"])
    required_isolation = {
        "guest_identity", "pid_namespace", "capabilities", "no_new_privs", "seccomp", "credentials",
        "filesystem", "rootfs_readonly", "symlink_escape", "path_traversal", "host_canary_network",
        "qualification_supervisor", "supervisor_loopback", "service_network", "dns", "mount_denied", "ptrace_denied", "dangerous_syscalls_denied", "proc_sys", "uts_namespace",
    }
    require(required_isolation <= isolation_checks.keys(), "isolation fixture evidence incomplete")
    require(all(isolation_checks[name] == "PASS" for name in required_isolation), f"isolation fixture failed: {isolation_checks}")

    memory = run_execution("memory", fixture("memory.cpp"))
    require(memory["runtime"]["raw_facts"]["memory_limit_event"] is True, "untrusted memory limit event absent")
    pids = run_execution("pids", fixture("pids.cpp"))
    require(pids["runtime"]["raw_facts"]["pids_limit_event"] is True, "untrusted pids limit event absent")
    output = run_execution("output", fixture("output.cpp"))
    require(output["runtime"]["raw_facts"]["stdout_truncated"] is True and output["runtime"]["stdout_bytes"] == 65536, "output limit failed")
    timeout = run_execution("timeout", fixture("timeout.cpp"))
    require(timeout["runtime"]["raw_facts"]["wall_limit_reached"] is True, "wall timeout failed")
    background = run_execution("background", fixture("background.cpp"))
    require(background["runtime"]["stdout"] == "BACKGROUND_CHILD_STARTED\n", "background fixture drift")
    crash = run_execution("crash", fixture("crash.cpp"))
    require(crash["runtime"]["exit_code"] != 0 and crash["runtime"]["raw_facts"]["process_exited"] is True, "crash classification failed")
    recovery = run_execution("recovery", fixture("normal.cpp"))
    require(recovery["runtime"]["stdout"] == "PHASE6B5_OK\n", "post-crash recovery failed")

    nofile = run_execution("nofile", fixture("nofile.cpp"))
    nofile_values = parse_fixture_output(nofile["runtime"]["stdout"])
    nofile_opened = int(nofile_values.get("NOFILE_OPENED", "0"))
    require(32 <= nofile_opened < 80 and nofile["runtime"]["exit_code"] == 0, "RLIMIT_NOFILE enforcement failed")
    file_size = run_execution("file-size", fixture("file-size.cpp"))
    require(file_size["runtime"]["exit_code"] == 0 and file_size["runtime"]["clean"] is True, "RLIMIT_FSIZE enforcement failed")
    workspace_files = run_execution("workspace-files", fixture("workspace-files.cpp"))
    require(workspace_files["runtime"]["exit_code"] == 0 and workspace_files["runtime"]["clean"] is True, "bounded multi-file workspace failed")
    post_limit_recovery = run_execution("post-limit-recovery", fixture("normal.cpp"))
    require(post_limit_recovery["runtime"]["stdout"] == "PHASE6B5_OK\n", "post file/descriptor limit recovery failed")

    invalid = run_execution("invalid", fixture("invalid.cpp"))
    require(invalid["compile"]["outcome"] == "COMPILE_FAILED" and invalid.get("runtime") is None, "invalid source handling failed")
    testcase_set = run_testcase_set()

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(run_execution, f"concurrent-{index}", fixture("concurrent.cpp")) for index in (1, 2)]
        concurrent_results = [future.result(timeout=50) for future in futures]
    require(all(item["runtime"]["stdout"] == "PHASE6B5_CONCURRENT_OK\n" for item in concurrent_results), "concurrent result crossed")
    require(concurrent_results[0]["runtime_sandbox_id"] != concurrent_results[1]["runtime_sandbox_id"], "runtime sandbox ID collision")
    require(concurrent_results[0]["runtime"]["resource_evidence"]["control_group"] != concurrent_results[1]["runtime"]["resource_evidence"]["control_group"], "runtime cgroup collision")

    cleanup_fault = run_probe("SANDBOX_PROBE_CLEANUP_FAILURE", hashes["SANDBOX_PROBE_CLEANUP_FAILURE"])
    require(cleanup_fault.get("outcome") == "SANDBOX_CLEANUP_FAILURE" and cleanup_fault.get("clean") is False and cleanup_fault.get("qualification_pass") is False, "cleanup failure did not fail closed")
    verify_status, verify = request_json("/v1/cleanup/verify", "POST", {})
    require(verify_status == 200 and verify.get("clean") is False, "cleanup fault falsely verified")
    recover_status, recovered = request_json("/v1/cleanup/recover", "POST", {})
    require(recover_status == 200 and recovered.get("clean") is True, "cleanup recovery failed")
    final_probe = run_probe("SANDBOX_PROBE_QUALIFICATION", hashes["SANDBOX_PROBE_QUALIFICATION"])
    require(final_probe.get("qualification_pass") is True and final_probe.get("clean") is True, "final qualification failed")

    stop_listener.set()
    listener.join(timeout=2)
    require(not listener.is_alive(), "canary listener cleanup failed")

    summary = {
        "status": "PASS",
        "run_id": RUN_ID,
        "supervisor_identity": f"{SUPERVISOR_UID}:{SUPERVISOR_GID}",
        "trusted_probes": len(probe_results) + 3,
        "untrusted_fixture_sources": 14,
        "compiler_rootfs_identity": capabilities["compiler_rootfs_identity"],
        "cpu_max": cpu_evidence["cpu_max"],
        "cpu_nr_throttled": event_value(cpu_evidence["cpu_stat"], "nr_throttled"),
        "memory_max": memory_evidence["memory_max"],
        "memory_events_max": event_value(memory_evidence["memory_events"], "max"),
        "pids_max": pids_evidence["pids_max"],
        "pids_events_max": event_value(pids_evidence["pids_events"], "max"),
        "bounded_stdout_bytes": output["runtime"]["stdout_bytes"],
        "timeout_wall_ms": timeout["runtime"]["wall_time_ms"],
        "network_isolation": "PASS",
        "filesystem_isolation": "PASS",
        "credential_isolation": "PASS",
        "docker_socket_isolation": "PASS",
        "process_isolation": "PASS",
        "pid_limit": "PASS",
        "cpu_limit": "PASS",
        "wall_time_limit": "PASS",
        "memory_limit": "PASS",
        "output_limit": "PASS",
        "cleanup": "PASS",
        "testcase_isolation": "PASS",
        "concurrent_isolation": "PASS",
        "compile_isolation": "PASS",
        "rootfs_readonly": "PASS",
        "no_new_privs": "PASS",
        "seccomp": "ACCEPTED_COMPENSATING_CONTROLS_AMD64_DENYLIST",
        "open_file_limit": "PASS_RLIMIT_NOFILE",
        "file_size_limit": "PASS_RLIMIT_FSIZE_WITH_ACCOUNTED_WORKSPACE",
        "production_judge_qualified": False,
    }
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
