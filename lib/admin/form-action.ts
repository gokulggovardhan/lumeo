export type AdminFormAction = (formData: FormData) => void | Promise<void>;

export function asAdminFormAction(
  action: (formData: FormData) => Promise<unknown>,
): AdminFormAction {
  return action as AdminFormAction;
}
