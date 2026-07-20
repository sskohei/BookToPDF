/**
 * `self` はプロジェクト全体の `dom` libにより `Window & typeof globalThis` 型になっている。
 * 実際にはDedicatedWorkerGlobalScopeだが、`webworker` libを追加すると`dom`と衝突するため
 * 追加しない。代わりに、Workerとして実際に使うAPIだけを持つ狭い型を用意し、
 * `self as unknown as WorkerSelf` という1箇所のキャストで橋渡しする。
 */
export interface WorkerSelf {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  cv?: unknown;
}

export function getWorkerSelf(): WorkerSelf {
  return self as unknown as WorkerSelf;
}
