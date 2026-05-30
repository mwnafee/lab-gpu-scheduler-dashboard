import subprocess
import json
from datetime import datetime, timezone

SERVERS = ["axis0", "axis1", "axis2", "h100-litjan2024", "deeprecon"]
MIN_STORAGE_BYTES = 40 * 1024 ** 3
MAX_STORAGE_MOUNTS = 4
EXCLUDED_FS_TYPES = {
    "tmpfs",
    "devtmpfs",
    "overlay",
    "squashfs",
    "efivarfs",
    "proc",
    "sysfs",
    "cgroup",
    "cgroup2",
    "pstore",
    "securityfs",
    "debugfs",
    "tracefs",
    "fusectl",
    "configfs",
    "mqueue",
    "hugetlbfs",
    "nfs",
    "nfs4",
    "cifs",
    "smbfs",
    "sshfs",
    "fuse.sshfs",
    "glusterfs",
    "ceph",
    "lustre",
}

GPU_QUERY = (
    "nvidia-smi "
    "--query-gpu=index,uuid,name,memory.used,memory.total,utilization.gpu "
    "--format=csv,noheader,nounits"
)

PROC_QUERY = (
    "nvidia-smi "
    "--query-compute-apps=gpu_uuid,pid,process_name,used_memory "
    "--format=csv,noheader,nounits"
)

STORAGE_QUERY = "df -B1 --output=source,target,size,used,avail,pcent,fstype"

OUTPUT_JSON = "/data/nafeem/lab-gpu-scheduler-dashboard/gpu_status.json"


def run_cmd(cmd):
    try:
        out = subprocess.check_output(
            cmd,
            shell=True,
            stderr=subprocess.STDOUT,
            timeout=8
        )
        return out.decode().strip()
    except Exception:
        return None


def run_server_cmd(server, cmd):
    if server == "deeprecon":
        return run_cmd(cmd)
    return run_cmd(
        f"ssh -o BatchMode=yes -o ConnectTimeout=3 {server} '{cmd}'"
    )


def get_user_for_pid(server, pid):
    ps_cmd = f"ps -o user= -p {pid}"
    out = run_server_cmd(server, ps_cmd)
    if out:
        return out.strip()
    return "unknown"


def collect_storage(server):
    storage_out = run_server_cmd(server, STORAGE_QUERY)
    if not storage_out:
        return []

    mounts = []
    for line in storage_out.splitlines()[1:]:
        parts = line.split()
        if len(parts) < 7:
            continue

        source, target, size, used, avail, percent, fs_type = parts[:7]
        if fs_type in EXCLUDED_FS_TYPES:
            continue

        try:
            size_bytes = int(size)
            used_bytes = int(used)
            avail_bytes = int(avail)
        except ValueError:
            continue

        if size_bytes < MIN_STORAGE_BYTES:
            continue

        mounts.append({
            "source": source,
            "mount": target,
            "size_bytes": size_bytes,
            "used_bytes": used_bytes,
            "avail_bytes": avail_bytes,
            "use_percent": percent,
            "fs_type": fs_type,
        })

    mounts.sort(key=lambda item: item["size_bytes"], reverse=True)
    return mounts[:MAX_STORAGE_MOUNTS]


def collect_server(server):
    storage = collect_storage(server)
    gpu_out = run_server_cmd(server, GPU_QUERY)

    if gpu_out is None:
        return {"status": "unreachable", "gpus": [], "storage": storage}

    gpus = []
    uuid_to_gpu_idx = {}

    for line in gpu_out.splitlines():
        parts = [x.strip() for x in line.split(",")]
        if len(parts) != 6:
            continue

        idx, uuid, name, used, total, util = parts
        used = int(used)
        total = int(total)
        util = int(util)

        usage_ratio = used / total if total > 0 else 0.0

        if usage_ratio < 0.10:
            state = "free"
        elif usage_ratio > 0.80:
            state = "busy"
        else:
            state = "mid"

        gpu_entry = {
            "index": idx,
            "uuid": uuid,
            "name": name,
            "used_mib": used,
            "total_mib": total,
            "util_percent": util,
            "state": state,
            "processes": []
        }

        gpus.append(gpu_entry)
        uuid_to_gpu_idx[uuid] = len(gpus) - 1

    proc_out = run_server_cmd(server, PROC_QUERY)

    if proc_out:
        for line in proc_out.splitlines():
            parts = [x.strip() for x in line.split(",")]
            if len(parts) != 4:
                continue

            gpu_uuid, pid, process_name, used_memory = parts

            try:
                used_memory = int(used_memory)
            except ValueError:
                continue

            user = get_user_for_pid(server, pid)

            proc_entry = {
                "pid": pid,
                "user": user,
                "name": process_name,
                "used_mib": used_memory
            }

            if gpu_uuid in uuid_to_gpu_idx:
                gpus[uuid_to_gpu_idx[gpu_uuid]]["processes"].append(proc_entry)

    return {"status": "ok", "gpus": gpus, "storage": storage}


def main():
    data = {
        "updated_utc": datetime.now(timezone.utc).isoformat(),
        "servers": {}
    }

    for server in SERVERS:
        data["servers"][server] = collect_server(server)

    with open(OUTPUT_JSON, "w") as f:
        json.dump(data, f, indent=2)


if __name__ == "__main__":
    main()


