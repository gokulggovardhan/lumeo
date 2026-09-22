import type { PublicToolStatus } from "@/lib/public-catalog/types";

export type PublicToolStateInput = {
  status: PublicToolStatus;
  isEnabled: boolean;
  maintenanceMessage?: string | null;
};

export type EffectivePublicToolState = {
  status: PublicToolStatus;
  discoverable: boolean;
  usable: boolean;
  message: string | null;
};

// This is the single policy boundary for the Admin status + enabled controls.
// Hidden tools remain unavailable on direct routes as well as absent from
// discovery; missing rows fail closed so an incomplete catalog cannot expose a
// processor that an administrator cannot control.
export function resolveEffectivePublicToolState(
  tool: PublicToolStateInput | null | undefined,
): EffectivePublicToolState {
  if (!tool || !tool.isEnabled || tool.status === "hidden") {
    return {
      status: "hidden",
      discoverable: false,
      usable: false,
      message: tool?.maintenanceMessage?.trim() || null,
    };
  }

  return {
    status: tool.status,
    discoverable: true,
    usable: tool.status === "active" || tool.status === "beta",
    message: tool.maintenanceMessage?.trim() || null,
  };
}
