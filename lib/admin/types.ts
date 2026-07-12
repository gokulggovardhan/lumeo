export type AdminRole = "owner" | "admin" | "analyst";

export type AdminMembership = {
  user_id: string;
  role: AdminRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminContext =
  | {
      authenticated: true;
      authorized: true;
      userId: string;
      email: string | null;
      role: AdminRole;
    }
  | {
      authenticated: false;
      authorized: false;
      userId: null;
      email: null;
      role: null;
    }
  | {
      authenticated: true;
      authorized: false;
      userId: string;
      email: string | null;
      role: null;
    };
