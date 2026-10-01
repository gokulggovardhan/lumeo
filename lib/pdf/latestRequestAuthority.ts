export type LatestRequestAuthority = Readonly<{
  begin: () => number;
  isCurrent: (token: number) => boolean;
  invalidate: () => void;
}>;

/**
 * Gives async UI work a single latest-request authority. Older work may
 * finish, but it cannot publish after a newer request or reset wins.
 */
export function createLatestRequestAuthority(): LatestRequestAuthority {
  let revision = 0;
  return {
    begin() {
      revision += 1;
      return revision;
    },
    isCurrent(token) {
      return token === revision;
    },
    invalidate() {
      revision += 1;
    },
  };
}
