import type { Image } from "modal";
import { getModalClient } from "@/server/modal/client";

let image: Image | null = null;

export function getSessionImage(): Image {
  if (image) {
    return image;
  }

  const modal = getModalClient();
  image = modal.images
    .fromRegistry("node:22-bookworm-slim")
    .dockerfileCommands([
      "RUN apt-get update && apt-get install -y --no-install-recommends git gh curl sudo ca-certificates openssh-server && rm -rf /var/lib/apt/lists/*",
      'RUN set -eu; arch="$(dpkg --print-architecture)"; case "$arch" in amd64) claude_arch=x64 ;; arm64) claude_arch=arm64 ;; *) echo "Unsupported architecture: $arch" >&2; exit 1 ;; esac; claude_version=2.1.29; claude_url="https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases/$claude_version/linux-$claude_arch/claude"; curl -fsSL "$claude_url" -o /usr/local/bin/claude; chmod 755 /usr/local/bin/claude',
      "RUN printf '%s\\n' '#!/bin/sh' 'export DISABLE_AUTOUPDATER=1' >/etc/profile.d/claude-code.sh && chmod 755 /etc/profile.d/claude-code.sh",
      "RUN mkdir -p /workspace",
      "ENV DISABLE_AUTOUPDATER=1",
      "WORKDIR /workspace",
    ]);

  return image;
}
