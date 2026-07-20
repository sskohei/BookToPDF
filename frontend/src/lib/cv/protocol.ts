/**
 * メインスレッドとcv Web Worker間でやり取りするメッセージのプロトコル定義。
 * 後続の画像処理issue（四隅検出・透視変換・gutter検出など）は CvOperations に
 * キーを追加していく形で拡張する。
 */
export interface CvOperations {
  ping: { input: undefined; output: { message: "pong" } };
  grayscale: { input: { imageData: ImageData }; output: { imageData: ImageData } };
}

export type CvOpName = keyof CvOperations;

type CvJobRequestFor<K extends CvOpName> = {
  kind: "job";
  id: string;
  op: K;
  input: CvOperations[K]["input"];
};
/**
 * `{ [K in CvOpName]: ... }[CvOpName]` の形にすることで、opごとにinputの型が
 * 正しく紐づいた判別可能なUnionにしている（switch (request.op) での型の絞り込みに必要）。
 */
export type CvJobRequest = { [K in CvOpName]: CvJobRequestFor<K> }[CvOpName];

type CvJobResultFor<K extends CvOpName> =
  | { kind: "job-result"; id: string; op: K; ok: true; output: CvOperations[K]["output"] }
  | { kind: "job-result"; id: string; op: K; ok: false; error: { message: string } };
export type CvJobResult = { [K in CvOpName]: CvJobResultFor<K> }[CvOpName];

export type CvWorkerReadyMessage = { kind: "worker-ready" };
export type CvWorkerFatalErrorMessage = { kind: "worker-fatal-error"; message: string };

/** Worker → メインスレッド */
export type CvWorkerOutboundMessage =
  | CvJobResult
  | CvWorkerReadyMessage
  | CvWorkerFatalErrorMessage;

/** メインスレッド → Worker */
export type CvWorkerInboundMessage = CvJobRequest;
