import { Container, getContainer } from "@cloudflare/containers";
import { env as workerEnv } from "cloudflare:workers";

export class MagicArtBackend extends Container {
  defaultPort = 8000;
  sleepAfter = "10m";
  enableInternet = true;
  envVars = {
    PORT: "8000",
    DEV_MODE: "false",
    MAGICART_SERVER_ENV_B64: workerEnv.MAGICART_SERVER_ENV_B64 || "",
    D1_HTTP_BASE: "http://magicart.d1",
  };

  async fetch(request) {
    return this.containerFetch(request);
  }
}

MagicArtBackend.outboundByHost = {
  "magicart.d1": async (request, env) => {
    if (!env.MAGICART_D1) {
      return Response.json(
        {
          success: false,
          errors: [{ message: "MAGICART_D1 binding is not configured" }],
        },
        { status: 500 },
      );
    }

    if (request.method !== "POST") {
      return Response.json(
        {
          success: false,
          errors: [{ message: "Only POST is supported for D1 proxy requests" }],
        },
        { status: 405 },
      );
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return Response.json(
        {
          success: false,
          errors: [{ message: "Invalid JSON payload" }],
        },
        { status: 400 },
      );
    }

    const sql = `${payload?.sql || ""}`.trim();
    const params = Array.isArray(payload?.params) ? payload.params : [];
    if (!sql) {
      return Response.json(
        {
          success: false,
          errors: [{ message: "sql is required" }],
        },
        { status: 400 },
      );
    }

    try {
      const result = await env.MAGICART_D1.prepare(sql).bind(...params).run();
      return Response.json({
        success: true,
        result: [result],
      });
    } catch (error) {
      return Response.json(
        {
          success: false,
          errors: [{ message: error instanceof Error ? error.message : String(error) }],
        },
        { status: 500 },
      );
    }
  },
};

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    const instanceName = pathname.startsWith("/api/") || pathname.startsWith("/socket.io")
      ? "magicart-api"
      : "magicart-web";
    const container = getContainer(env.MAGICART_BACKEND, instanceName);
    return container.fetch(request);
  },
};
