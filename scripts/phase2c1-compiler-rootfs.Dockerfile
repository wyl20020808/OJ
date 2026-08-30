FROM ubuntu@sha256:33ceb71981b602c1a7443a53469e4dba065f7503eab3078a2d7a57a2ab987517

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        binutils=2.42-4ubuntu2.10 \
        g++-13=13.3.0-6ubuntu2~24.04.1 \
        gcc-13=13.3.0-6ubuntu2~24.04.1 \
        libc6-dev=2.39-0ubuntu8.8 \
        libstdc++-13-dev=13.3.0-6ubuntu2~24.04.1 \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/* /home/* /root/* \
    && chmod 0555 /home /root

LABEL org.ojplatform.profile="cpp20-gcc-13-v1"
LABEL org.ojplatform.phase="2C.1"
