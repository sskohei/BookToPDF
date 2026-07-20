import { describe, expect, it, vi } from "vitest";
import { createCvWorkerClient, type CvWorkerLike } from "./client";
import type { CvJobRequest, CvWorkerOutboundMessage } from "./protocol";

function createFakeWorker() {
  const worker: CvWorkerLike = {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    onmessage: null,
    onerror: null,
  };
  const emit = (message: CvWorkerOutboundMessage) => {
    worker.onmessage?.({ data: message } as MessageEvent);
  };
  return { worker, emit };
}

function sentRequests(worker: CvWorkerLike): CvJobRequest[] {
  return (worker.postMessage as ReturnType<typeof vi.fn>).mock.calls.map(
    (call) => call[0] as CvJobRequest,
  );
}

describe("createCvWorkerClient", () => {
  it("posts a job message shaped for the requested operation", () => {
    const { worker } = createFakeWorker();
    const client = createCvWorkerClient(() => worker);

    void client.run("ping", undefined);

    const [request] = sentRequests(worker);
    expect(request).toMatchObject({ kind: "job", op: "ping", input: undefined });
    expect(typeof request.id).toBe("string");
  });

  it("resolves run() with the output of a matching successful job-result", async () => {
    const { worker, emit } = createFakeWorker();
    const client = createCvWorkerClient(() => worker);

    const promise = client.run("ping", undefined);
    const [request] = sentRequests(worker);
    emit({ kind: "job-result", id: request.id, op: "ping", ok: true, output: { message: "pong" } });

    await expect(promise).resolves.toEqual({ message: "pong" });
  });

  it("rejects run() with an Error when the job-result reports failure", async () => {
    const { worker, emit } = createFakeWorker();
    const client = createCvWorkerClient(() => worker);

    const promise = client.run("ping", undefined);
    const [request] = sentRequests(worker);
    emit({ kind: "job-result", id: request.id, op: "ping", ok: false, error: { message: "boom" } });

    await expect(promise).rejects.toThrow("boom");
  });

  it("correlates concurrent requests by id, even when results arrive out of order", async () => {
    const { worker, emit } = createFakeWorker();
    const client = createCvWorkerClient(() => worker);

    const first = client.run("ping", undefined);
    const second = client.run("ping", undefined);
    const [firstRequest, secondRequest] = sentRequests(worker);

    // Resolve the second request's job first to prove correlation isn't FIFO-based.
    emit({
      kind: "job-result",
      id: secondRequest.id,
      op: "ping",
      ok: true,
      output: { message: "pong" satisfies "pong" } as { message: "pong" },
    });
    emit({ kind: "job-result", id: firstRequest.id, op: "ping", ok: true, output: { message: "pong" } });

    await expect(first).resolves.toEqual({ message: "pong" });
    await expect(second).resolves.toEqual({ message: "pong" });
  });

  it("resolves ready when the worker announces it is ready", async () => {
    const { worker, emit } = createFakeWorker();
    const client = createCvWorkerClient(() => worker);

    emit({ kind: "worker-ready" });

    await expect(client.ready).resolves.toBeUndefined();
  });

  it("rejects ready when the worker reports a fatal error", async () => {
    const { worker, emit } = createFakeWorker();
    const client = createCvWorkerClient(() => worker);

    emit({ kind: "worker-fatal-error", message: "failed to load opencv" });

    await expect(client.ready).rejects.toThrow("failed to load opencv");
  });

  it("terminates the underlying worker", () => {
    const { worker } = createFakeWorker();
    const client = createCvWorkerClient(() => worker);

    client.terminate();

    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
