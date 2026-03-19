import { execFile } from "child_process";
import { homedir } from "os";
import { join } from "path";

const TEMPO_REQUEST = join(homedir(), ".tempo", "bin", "tempo-request");

export interface PaymentResult {
  success: boolean;
  statusCode: number;
  response: any;
  responseRaw: string;
  error?: string;
  latencyMs: number;
}

export async function payRequest(
  url: string,
  method: string = "GET",
  headers: Record<string, string> = {},
  body?: string
): Promise<PaymentResult> {
  const start = Date.now();

  const args: string[] = ["-X", method];

  for (const [key, val] of Object.entries(headers)) {
    args.push("-H", `${key}: ${val}`);
  }

  if (body) {
    args.push("--json", body);
  }

  args.push(url);

  return new Promise((resolve) => {
    execFile(TEMPO_REQUEST, args, { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      const latencyMs = Date.now() - start;

      if (err && (err as any).code === "ENOENT") {
        resolve({
          success: false,
          statusCode: 0,
          response: null,
          responseRaw: "",
          error: "tempo-request binary not found",
          latencyMs,
        });
        return;
      }

      const exitCode = (err as any)?.status ?? 0;
      const output = stdout.trim();

      // Try to parse as JSON
      let parsed: any = null;
      try {
        parsed = JSON.parse(output);
      } catch {
        parsed = output;
      }

      // Exit code 2 = payment error
      if (exitCode === 2) {
        resolve({
          success: false,
          statusCode: 402,
          response: parsed,
          responseRaw: output,
          error: typeof parsed === "object" ? parsed?.message || "Payment failed" : "Payment failed",
          latencyMs,
        });
        return;
      }

      // Exit code 3+ = other error (network, etc)
      if (exitCode > 0) {
        resolve({
          success: false,
          statusCode: exitCode,
          response: parsed,
          responseRaw: output,
          error: stderr.trim() || (typeof parsed === "object" ? parsed?.message : output) || "Request failed",
          latencyMs,
        });
        return;
      }

      resolve({
        success: true,
        statusCode: 200,
        response: parsed,
        responseRaw: output,
        latencyMs,
      });
    });
  });
}
