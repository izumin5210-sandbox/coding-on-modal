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
      "RUN apt-get update && apt-get install -y --no-install-recommends git curl ca-certificates ttyd && rm -rf /var/lib/apt/lists/*",
      "RUN npm install -g @anthropic-ai/claude-code",
      "RUN mkdir -p /workspace",
      "WORKDIR /workspace",
    ]);

  return image;
}
