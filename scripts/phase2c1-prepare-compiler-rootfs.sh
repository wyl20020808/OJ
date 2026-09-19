#!/usr/bin/env bash
set -euo pipefail

# Manifest ordering is part of the rootfs identity. Pin collation so identical
# content produces one identity across deployment-host locales.
export LC_ALL=C

profile=cpp20-gcc-13-v1
image=ojplatform/compiler-rootfs:${profile}
target=${OJPLATFORM_CPP20_ROOTFS:-/opt/ojplatform/compiler-rootfs/${profile}}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd -- "${script_dir}/.." && pwd)

if [[ ${EUID} -ne 0 ]]; then
  echo "compiler rootfs preparation requires root" >&2
  exit 2
fi
if [[ ${target} != /opt/ojplatform/compiler-rootfs/${profile} ]]; then
  echo "refusing unexpected compiler rootfs target" >&2
  exit 2
fi

docker build --pull=false \
  --file "${repo_root}/scripts/phase2c1-compiler-rootfs.Dockerfile" \
  --tag "${image}" "${repo_root}"

container=$(docker create "${image}")
tmp=$(mktemp -d /tmp/ojplatform-phase2c1-rootfs.XXXXXX)
cleanup() {
  docker rm -f "${container}" >/dev/null 2>&1 || true
  rm -rf -- "${tmp}"
}
trap cleanup EXIT

docker export "${container}" --output "${tmp}/rootfs.tar"
mkdir -p "${tmp}/rootfs"
tar --extract --file "${tmp}/rootfs.tar" --directory "${tmp}/rootfs"

mkdir -p "${tmp}/rootfs/workspace/input" "${tmp}/rootfs/workspace/build"

# The dedicated non-root Supervisor audits the complete immutable tree before
# enabling real execution. Normalize exported image metadata so every directory
# is traversable during that audit while no rootfs path remains writable.
find "${tmp}/rootfs" -xdev -type d -exec chmod a-w,a+rx {} +
find "${tmp}/rootfs" -xdev -type f -exec chmod a-w,a+r {} +

docker run --rm "${image}" dpkg-query -W >"${tmp}/packages.txt"
docker run --rm "${image}" /usr/bin/g++-13 --version >"${tmp}/compiler-version.txt"
docker image inspect --format '{{.Id}}' "${image}" >"${tmp}/image-id.txt"
docker image inspect --format '{{json .RepoDigests}}' "${image}" >"${tmp}/repo-digests.json"

(
  cd "${tmp}/rootfs"
  find . -xdev -type f -print0 | sort -z | xargs -0 sha256sum
  find . -xdev -type l -printf 'LINK %p %l\n' | sort
  find . -xdev ! -type l -printf 'META %m %U %G %y %p\n' | sort
) >"${tmp}/content-manifest.txt"
sha256sum "${tmp}/content-manifest.txt" | awk '{print $1}' >"${tmp}/rootfs-identity.txt"

rm -rf -- "${target}"
install -d -m 0755 "$(dirname -- "${target}")"
mv "${tmp}/rootfs" "${target}"
install -m 0644 "${tmp}/packages.txt" "${target}.packages.txt"
install -m 0644 "${tmp}/compiler-version.txt" "${target}.compiler-version.txt"
install -m 0644 "${tmp}/image-id.txt" "${target}.image-id.txt"
install -m 0644 "${tmp}/repo-digests.json" "${target}.repo-digests.json"
install -m 0644 "${tmp}/content-manifest.txt" "${target}.content-manifest.txt"
install -m 0644 "${tmp}/rootfs-identity.txt" "${target}.identity"
chown -R root:root "${target}" "${target}."*
find "${target}" -xdev -type d -exec chmod a-w,a+rx {} +
find "${target}" -xdev -type f -exec chmod a-w,a+r {} +

printf 'PROFILE=%s\nROOTFS=%s\nIDENTITY=%s\n' \
  "${profile}" "${target}" "$(cat "${target}.identity")"
