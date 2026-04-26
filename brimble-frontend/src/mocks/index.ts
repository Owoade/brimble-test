import { installMockServer } from "./server";

let installed = false;

export function installMocks(apiPrefix?: string): void {
  if (installed) return;
  installed = true;
  installMockServer(apiPrefix);
}
