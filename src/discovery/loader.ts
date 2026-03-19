import { execSync } from "child_process";
import { homedir } from "os";
import { join } from "path";

export interface Endpoint {
  method: string;
  path: string;
  description: string;
  payment: {
    intent?: string;
    amount?: string;
    decimals?: number;
  };
}

export interface Service {
  id: string;
  name: string;
  service_url: string;
  description: string;
  categories: string[];
  tags: string[];
  endpoints: Endpoint[];
}

const TEMPO_BIN = join(homedir(), ".tempo", "bin", "tempo");

export function loadServices(): Service[] {
  const raw = execSync(`${TEMPO_BIN} wallet services list`, {
    encoding: "utf-8",
    timeout: 15000,
  });
  const services: Service[] = JSON.parse(raw);
  return services;
}
