import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import type { StatsDatabase, GeoLookupConfig, GeoLookupProvider } from "../../db.js";
import type { RealtimeStore } from "../../realtime.js";

declare module "fastify" {
  interface FastifyInstance {
    db: StatsDatabase;
    realtimeStore: RealtimeStore;
  }
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function toGeoLookupResponse(config: GeoLookupConfig) {
  const configuredProvider = config.provider;
  const effectiveProvider =
    configuredProvider === "local" && config.localMmdbReady === false
      ? "online"
      : configuredProvider;

  return {
    ...config,
    configuredProvider,
    effectiveProvider,
  };
}

const configController: FastifyPluginAsync = async (fastify: FastifyInstance): Promise<void> => {
  // Compatibility routes: DB management
  fastify.get("/stats", async () => {
    return {
      size: fastify.db.getDatabaseSize(),
      totalConnectionsCount: fastify.db.getTotalConnectionLogsCount(),
    };
  });

  fastify.post("/cleanup", async (request, reply) => {
    if (fastify.authService.isShowcaseMode()) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const body = request.body as { days?: number; backendId?: number };
    const days = body?.days;
    const backendId = typeof body?.backendId === "number" ? body.backendId : undefined;

    if (typeof days !== "number" || days < 0) {
      return reply.status(400).send({ error: "Valid days parameter required" });
    }

    const result = fastify.db.cleanupOldData(backendId ?? null, days);

    if (days === 0) {
      if (backendId) {
        fastify.realtimeStore.clearBackend(backendId);
      } else {
        const backends = fastify.db.getAllBackends();
        for (const backend of backends) {
          fastify.realtimeStore.clearBackend(backend.id);
        }
      }

      return {
        message: `Cleaned all data: ${result.deletedConnections} connections, ${result.deletedDomains} domains, ${result.deletedProxies} proxies`,
        deleted: result.deletedConnections,
        domains: result.deletedDomains,
        ips: result.deletedIPs,
        proxies: result.deletedProxies,
        rules: result.deletedRules,
      };
    }

    return {
      message: `Cleaned ${result.deletedConnections} old connection logs`,
      deleted: result.deletedConnections,
    };
  });

  fastify.post("/vacuum", async (_request, reply) => {
    if (fastify.authService.isShowcaseMode()) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    fastify.db.vacuum();
    return { message: "Database vacuumed successfully" };
  });

  fastify.get("/retention", async () => {
    return fastify.db.getRetentionConfig();
  });

  fastify.put("/retention", async (request, reply) => {
    if (fastify.authService.isShowcaseMode()) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const body = request.body as {
      connectionLogsDays?: number;
      hourlyStatsDays?: number;
      autoCleanup?: boolean;
    };

    if (
      body.connectionLogsDays !== undefined &&
      (body.connectionLogsDays < 1 || body.connectionLogsDays > 90)
    ) {
      return reply.status(400).send({ error: "connectionLogsDays must be between 1 and 90" });
    }

    if (
      body.hourlyStatsDays !== undefined &&
      (body.hourlyStatsDays < 7 || body.hourlyStatsDays > 365)
    ) {
      return reply.status(400).send({ error: "hourlyStatsDays must be between 7 and 365" });
    }

    const config = fastify.db.updateRetentionConfig({
      connectionLogsDays: body.connectionLogsDays,
      hourlyStatsDays: body.hourlyStatsDays,
      autoCleanup: body.autoCleanup,
    });

    return { message: "Retention configuration updated", config };
  });

  fastify.get("/geoip", async () => {
    return toGeoLookupResponse(fastify.db.getGeoLookupConfig());
  });

  fastify.put("/geoip", async (request, reply) => {
    if (fastify.authService.isShowcaseMode()) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const body = request.body as {
      provider?: GeoLookupProvider;
      onlineApiUrl?: string;
    };

    if (body.provider !== undefined && body.provider !== "online" && body.provider !== "local") {
      return reply.status(400).send({ error: "provider must be 'online' or 'local'" });
    }

    if (body.onlineApiUrl !== undefined) {
      const trimmed = body.onlineApiUrl.trim();
      if (!trimmed || !isValidHttpUrl(trimmed)) {
        return reply.status(400).send({ error: "onlineApiUrl must be a valid http/https URL" });
      }
      body.onlineApiUrl = trimmed;
    }

    if (body.provider === "local") {
      const current = fastify.db.getGeoLookupConfig();
      if (!current.localMmdbReady) {
        return reply.status(400).send({
          error: "Local MMDB is not ready. Missing required files.",
          missingMmdbFiles: current.missingMmdbFiles || [],
        });
      }
    }

    const config = fastify.db.updateGeoLookupConfig({
      provider: body.provider,
      onlineApiUrl: body.onlineApiUrl,
    });

    return {
      message: "GeoIP configuration updated",
      config: toGeoLookupResponse(config),
    };
  });
};

export default configController;
