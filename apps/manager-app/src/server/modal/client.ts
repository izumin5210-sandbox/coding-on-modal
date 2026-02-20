import { type App, ModalClient } from "modal";
import { getEnv } from "@/server/env";

let modalClient: ModalClient | null = null;
let appPromise: Promise<App> | null = null;

export function getModalClient(): ModalClient {
  if (!modalClient) {
    const env = getEnv();
    modalClient = new ModalClient({
      tokenId: env.MODAL_TOKEN_ID,
      tokenSecret: env.MODAL_TOKEN_SECRET,
      environment: env.MODAL_ENVIRONMENT,
    });
  }

  return modalClient;
}

export function getModalApp(): Promise<App> {
  if (!appPromise) {
    const env = getEnv();
    appPromise = getModalClient().apps.fromName(env.MODAL_APP_NAME, {
      createIfMissing: true,
    });
  }

  return appPromise;
}
