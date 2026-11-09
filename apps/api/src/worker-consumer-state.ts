import { RedisQueueBackend, type Worker } from "bullmq";

/** Observe both real connections, rather than treating the run loop as ready. */
export async function observeWorkerConsumer(
  worker: Pick<Worker, "getBackend" | "isRunning" | "isPaused">,
): Promise<() => "RUNNING" | "PAUSED" | "STOPPED"> {
  const backend = worker.getBackend();
  if (!(backend instanceof RedisQueueBackend)) return () => "STOPPED";
  const [regular, blocking] = await Promise.all([
    backend.client,
    backend.blockingClient,
  ]);
  return () => {
    if (regular.status !== "ready" || blocking?.status !== "ready")
      return "STOPPED";
    if (worker.isPaused()) return "PAUSED";
    return worker.isRunning() ? "RUNNING" : "STOPPED";
  };
}
