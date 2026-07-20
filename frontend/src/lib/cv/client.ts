import type {
  CvJobRequest,
  CvOpName,
  CvOperations,
  CvWorkerOutboundMessage,
} from "./protocol";

/**
 * 実 `Worker` のうち、このラッパーが必要とする部分だけを切り出した形。
 * テスト時はこの形を満たすフェイクを注入できる。
 */
export type CvWorkerLike = Pick<Worker, "postMessage" | "terminate"> & {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
};

export type CreateCvWorker = () => CvWorkerLike;

export interface CvWorkerClient {
  /** Worker側でOpenCV.jsの読み込みが完了すると解決する。失敗時はreject。 */
  ready: Promise<void>;
  run<K extends CvOpName>(
    op: K,
    input: CvOperations[K]["input"],
  ): Promise<CvOperations[K]["output"]>;
  terminate(): void;
}

function createId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const defaultCreateCvWorker: CreateCvWorker = () =>
  new Worker(new URL("../../workers/cv.worker.ts", import.meta.url));

type PendingJob = {
  resolve: (output: unknown) => void;
  reject: (error: unknown) => void;
};

/**
 * メインスレッドからcv Web Workerにジョブを送り、結果をPromiseで受け取る薄いラッパー。
 * `createWorker` を差し替えることで、Vitest（`environment: "node"`で実Workerが無い環境）でも
 * 呼び出しインターフェースを検証できる。
 */
export function createCvWorkerClient(
  createWorker: CreateCvWorker = defaultCreateCvWorker,
): CvWorkerClient {
  const worker = createWorker();
  const pending = new Map<string, PendingJob>();

  let resolveReady!: () => void;
  let rejectReady!: (error: unknown) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  worker.onmessage = (event: MessageEvent) => {
    const message = event.data as CvWorkerOutboundMessage;
    if (message.kind === "worker-ready") {
      resolveReady();
      return;
    }
    if (message.kind === "worker-fatal-error") {
      rejectReady(new Error(message.message));
      return;
    }

    const job = pending.get(message.id);
    if (!job) return;
    pending.delete(message.id);
    if (message.ok) {
      job.resolve(message.output);
    } else {
      job.reject(new Error(message.error.message));
    }
  };

  worker.onerror = (event: ErrorEvent) => {
    rejectReady(new Error(event.message));
  };

  return {
    ready,
    run(op, input) {
      return new Promise((resolve, reject) => {
        const id = createId();
        pending.set(id, { resolve: resolve as (output: unknown) => void, reject });
        // op と input は run<K> の型シグネチャで既に紐づいている。CvJobRequest は
        // opごとに判別されるUnionなので、ここではジェネリックな組み合わせを直接
        // 表現しきれずキャストが必要。
        worker.postMessage({ kind: "job", id, op, input } as CvJobRequest);
      });
    },
    terminate() {
      worker.terminate();
    },
  };
}
