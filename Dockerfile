FROM node:22-alpine AS base

# -- System dependencies -------------------------------------------------------
RUN apk add --no-cache \
    python3 \
    python3-dev \
    py3-pip \
    gcc \
    musl-dev \
    linux-headers \
    git \
    openssh-client \
    curl \
    ca-certificates \
    libc6-compat \
    wget \
    bash \
    openssl \
    nmap \
    nmap-scripts \
    openjdk17-jre-headless

# -- Python scanner tools ------------------------------------------------------
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

RUN pip install --no-cache-dir \
    sslyze \
    ssh-audit \
    semgrep \
    checkov && \
    pip install --no-cache-dir kube-hunter || echo "kube-hunter install failed (netifaces C build issue) — skipping"

# -- Binary scanner tools (all optional — app runs without them) ---------------
# zgrab2
ARG ZGRAB2_VERSION=v0.1.8
RUN ARCH=$(uname -m) && \
    if   [ "$ARCH" = "x86_64"  ]; then GOARCH="amd64"; \
    elif [ "$ARCH" = "aarch64" ]; then GOARCH="arm64"; \
    else GOARCH="amd64"; fi && \
    wget -qO /usr/local/bin/zgrab2 \
      "https://github.com/zmap/zgrab2/releases/download/${ZGRAB2_VERSION}/zgrab2_linux_${GOARCH}" && \
    chmod +x /usr/local/bin/zgrab2 && zgrab2 --version || echo "zgrab2 install skipped"

# trivy
ARG TRIVY_VERSION=0.56.2
RUN ARCH=$(uname -m) && \
    if   [ "$ARCH" = "x86_64"  ]; then TARCH="Linux-64bit"; \
    elif [ "$ARCH" = "aarch64" ]; then TARCH="Linux-ARM64"; \
    else TARCH="Linux-64bit"; fi && \
    wget -qO /tmp/trivy.tar.gz \
      "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_${TARCH}.tar.gz" && \
    tar -xzf /tmp/trivy.tar.gz -C /usr/local/bin trivy && \
    rm -f /tmp/trivy.tar.gz && trivy --version || echo "trivy install skipped"

# syft
ARG SYFT_VERSION=1.4.1
RUN ARCH=$(uname -m) && \
    if   [ "$ARCH" = "x86_64"  ]; then SARCH="linux_amd64"; \
    elif [ "$ARCH" = "aarch64" ]; then SARCH="linux_arm64"; \
    else SARCH="linux_amd64"; fi && \
    wget -qO /tmp/syft.tar.gz \
      "https://github.com/anchore/syft/releases/download/v${SYFT_VERSION}/syft_${SYFT_VERSION}_${SARCH}.tar.gz" && \
    tar -xzf /tmp/syft.tar.gz -C /usr/local/bin syft && \
    rm -f /tmp/syft.tar.gz && syft version || echo "syft install skipped"

# grype
ARG GRYPE_VERSION=0.79.4
RUN ARCH=$(uname -m) && \
    if   [ "$ARCH" = "x86_64"  ]; then GARCH="linux_amd64"; \
    elif [ "$ARCH" = "aarch64" ]; then GARCH="linux_arm64"; \
    else GARCH="linux_amd64"; fi && \
    wget -qO /tmp/grype.tar.gz \
      "https://github.com/anchore/grype/releases/download/v${GRYPE_VERSION}/grype_${GRYPE_VERSION}_${GARCH}.tar.gz" && \
    tar -xzf /tmp/grype.tar.gz -C /usr/local/bin grype && \
    rm -f /tmp/grype.tar.gz && grype version || echo "grype install skipped"

# testssl.sh
RUN git clone --depth 1 --branch v3.2 \
      https://github.com/drwetter/testssl.sh.git /opt/testssl && \
    chmod +x /opt/testssl/testssl.sh || echo "testssl install skipped"

# gitleaks
ARG GITLEAKS_VERSION=8.21.2
RUN ARCH=$(uname -m) && \
    if   [ "$ARCH" = "x86_64"  ]; then GARCH="x64"; \
    elif [ "$ARCH" = "aarch64" ]; then GARCH="arm64"; \
    else GARCH="x64"; fi && \
    wget -qO /tmp/gitleaks.tar.gz \
      "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_${GARCH}.tar.gz" && \
    tar -xzf /tmp/gitleaks.tar.gz -C /usr/local/bin gitleaks && \
    rm -f /tmp/gitleaks.tar.gz && gitleaks version || echo "gitleaks install skipped"

# kube-bench
ARG KUBEBENCH_VERSION=0.8.0
RUN ARCH=$(uname -m) && \
    if   [ "$ARCH" = "x86_64"  ]; then KBARCH="amd64"; \
    elif [ "$ARCH" = "aarch64" ]; then KBARCH="arm64"; \
    else KBARCH="amd64"; fi && \
    wget -qO /tmp/kube-bench.tar.gz \
      "https://github.com/aquasecurity/kube-bench/releases/download/v${KUBEBENCH_VERSION}/kube-bench_${KUBEBENCH_VERSION}_linux_${KBARCH}.tar.gz" && \
    tar -xzf /tmp/kube-bench.tar.gz -C /usr/local/bin kube-bench && \
    rm -f /tmp/kube-bench.tar.gz && kube-bench --version || echo "kube-bench install skipped"

# cbomkit
RUN wget -qO /usr/local/bin/cbomkit.jar \
      "https://github.com/IBM/cbomkit/releases/latest/download/cbomkit-all.jar" && \
    printf '#!/bin/sh\nexec java -jar /usr/local/bin/cbomkit.jar "$@"\n' \
      > /usr/local/bin/cbomkit && \
    chmod +x /usr/local/bin/cbomkit || echo "cbomkit install skipped"

# -- Dependencies layer (cached unless package.json changes) -------------------
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# -- Build layer ---------------------------------------------------------------
FROM deps AS builder
WORKDIR /app
COPY . .
RUN npx prisma generate
RUN npm run build

# -- Production image ----------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PATH="/opt/venv/bin:$PATH"

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

RUN addgroup -g 1001 -S senqor && adduser -u 1001 -S senqor -G senqor && \
    mkdir -p .next/cache && \
    chown -R senqor:senqor /app
USER senqor

EXPOSE 4000
ENV PORT=4000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]

# ── Worker stage (job poller — runs alongside the app) ────────────────────────
FROM deps AS worker
WORKDIR /app

ENV NODE_ENV=production
ENV PATH="/opt/venv/bin:$PATH"

# Copy full source so tsx can run the poller directly
COPY . .
# Use the generated prisma client from the builder stage
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

CMD ["npx", "tsx", "src/workers/job-poller.ts"]
