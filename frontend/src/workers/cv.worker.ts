import { runDetectCorners } from "../lib/cv/operations/detectCorners";
import { runGrayscale } from "../lib/cv/operations/grayscale";
import { runPerspectiveTransform } from "../lib/cv/operations/perspectiveTransform";
import type { CvModule } from "../lib/cv/opencv-types";
import type { CvJobRequest, CvJobResult, CvWorkerOutboundMessage } from "../lib/cv/protocol";
import { loadOpenCv } from "./loadOpenCv";
import { getWorkerSelf } from "./worker-types";

const self = getWorkerSelf();

/**
 * OpenCV WASMの例外はC++例外がポインタとしてthrowされることがあるため、
 * `cv.exceptionFromPtr` で人間が読めるメッセージに変換する。それ以外の通常の
 * JSエラー（Errorインスタンス等）はそのままメッセージを使う。
 */
function toErrorMessage(err: unknown, cv: CvModule | undefined): string {
  if (cv) {
    try {
      return cv.exceptionFromPtr(err).msg;
    } catch {
      // errがOpenCVの例外ポインタでなければここに落ちる。下のフォールバックに任せる。
    }
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * `request` は `op` で判別可能なUnionなので、switchで分岐すると `request.input` も
 * その場で正しい型に絞り込まれる。戻り値もopごとに正しくタグ付けされた
 * `CvJobResult` になるため、呼び出し側でキャストは不要。
 */
function runOperation(cv: CvModule, request: CvJobRequest): CvJobResult {
  switch (request.op) {
    case "ping":
      return {
        kind: "job-result",
        id: request.id,
        op: "ping",
        ok: true,
        output: { message: "pong" },
      };
    case "grayscale":
      return {
        kind: "job-result",
        id: request.id,
        op: "grayscale",
        ok: true,
        output: runGrayscale(cv, request.input),
      };
    case "detectCorners":
      return {
        kind: "job-result",
        id: request.id,
        op: "detectCorners",
        ok: true,
        output: runDetectCorners(cv, request.input),
      };
    case "perspectiveTransform":
      return {
        kind: "job-result",
        id: request.id,
        op: "perspectiveTransform",
        ok: true,
        output: runPerspectiveTransform(cv, request.input),
      };
    default: {
      const exhaustiveCheck: never = request;
      throw new Error(`unknown cv operation: ${JSON.stringify(exhaustiveCheck)}`);
    }
  }
}

let readyCv: CvModule | undefined;

loadOpenCv()
  .then(({ cv }) => {
    readyCv = cv;
    const ready: CvWorkerOutboundMessage = { kind: "worker-ready" };
    self.postMessage(ready);
  })
  .catch((err: unknown) => {
    const fatal: CvWorkerOutboundMessage = {
      kind: "worker-fatal-error",
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(fatal);
  });

self.onmessage = (event: MessageEvent<CvJobRequest>) => {
  const request = event.data;
  void handleJob(request);
};

async function handleJob(request: CvJobRequest): Promise<void> {
  let cv: CvModule;
  try {
    ({ cv } = await loadOpenCv());
  } catch (err) {
    const result: CvJobResult = {
      kind: "job-result",
      id: request.id,
      op: request.op,
      ok: false,
      error: { message: toErrorMessage(err, readyCv) },
    };
    self.postMessage(result);
    return;
  }

  try {
    const result = runOperation(cv, request);
    self.postMessage(result);
  } catch (err) {
    const result: CvJobResult = {
      kind: "job-result",
      id: request.id,
      op: request.op,
      ok: false,
      error: { message: toErrorMessage(err, cv) },
    };
    self.postMessage(result);
  }
}
