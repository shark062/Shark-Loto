import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  const selfUrl = process.env["RENDER_EXTERNAL_URL"];
  if (selfUrl) {
    const PING_INTERVAL_MS = 10 * 60 * 1000;
    setInterval(async () => {
      try {
        await fetch(`${selfUrl}/api/health`);
        logger.info("Keep-alive ping OK");
      } catch (e) {
        logger.warn({ e }, "Keep-alive ping failed");
      }
    }, PING_INTERVAL_MS);
    logger.info({ selfUrl }, "Keep-alive scheduled every 10 minutes");
  }
});
