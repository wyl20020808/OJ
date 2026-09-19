FROM ubuntu@sha256:33ceb71981b602c1a7443a53469e4dba065f7503eab3078a2d7a57a2ab987517 AS snapshot-ca

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates=20240203 \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/*

FROM ubuntu@sha256:33ceb71981b602c1a7443a53469e4dba065f7503eab3078a2d7a57a2ab987517

ARG DEBIAN_FRONTEND=noninteractive
ARG UBUNTU_SNAPSHOT=20260820T000000Z

COPY --from=snapshot-ca /etc/ssl/certs/ca-certificates.crt /tmp/snapshot-ca-certificates.crt

# Ubuntu archives supersede security package revisions. Pin repository state as
# well as package versions so a fresh host can still reproduce this rootfs.
RUN cp /etc/apt/sources.list.d/ubuntu.sources /tmp/ubuntu.sources \
    && printf 'Types: deb\nURIs: https://snapshot.ubuntu.com/ubuntu/%s\nSuites: noble noble-updates noble-security\nComponents: main universe\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n' "${UBUNTU_SNAPSHOT}" > /etc/apt/sources.list.d/ubuntu.sources \
    && apt-get -o Acquire::Check-Valid-Until=false -o Acquire::https::CaInfo=/tmp/snapshot-ca-certificates.crt update \
    && apt-get -o Acquire::https::CaInfo=/tmp/snapshot-ca-certificates.crt install -y --no-install-recommends \
        binutils=2.42-4ubuntu2.10 \
        g++-13=13.3.0-6ubuntu2~24.04.1 \
        gcc-13=13.3.0-6ubuntu2~24.04.1 \
        libc6-dev=2.39-0ubuntu8.8 \
        libstdc++-13-dev=13.3.0-6ubuntu2~24.04.1 \
        linux-libc-dev=6.8.0-138.138 \
    && mv /tmp/ubuntu.sources /etc/apt/sources.list.d/ubuntu.sources \
    && rm -f /tmp/snapshot-ca-certificates.crt \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/* /var/log/apt/* /home/* /root/* \
    && rm -f /var/lib/apt/extended_states /var/log/dpkg.log /var/cache/ldconfig/aux-cache \
    && chmod 0555 /home /root

LABEL org.ojplatform.profile="cpp20-gcc-13-v1"
LABEL org.ojplatform.phase="2C.1"
