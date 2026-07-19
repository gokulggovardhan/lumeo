import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { InboxClient } from "@/components/admin/InboxClient";
import { requireAdmin } from "@/lib/admin/auth";
import { getFeedbackQueries } from "@/lib/admin/data";
import { canManageInbox, canViewInbox } from "@/lib/admin/permissions";

const PAGE_SIZE = 25;

export default async function InboxPage() {
  const admin = await requireAdmin();

  if (!canViewInbox(admin.role)) {
    return (
      <div className="space-y-7">
        <AdminPageHeader eyebrow="Messaging" title="Inbox" description="Messages people send from your website." />
        <AdminEmptyState title="You don't have access to this page" description="Ask an owner to give you access if you need it." />
      </div>
    );
  }

  const initial = await getFeedbackQueries(PAGE_SIZE, 0);

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col space-y-5">
      <AdminPageHeader
        eyebrow="Messaging"
        title="Inbox"
        description="Messages people send from your website. Only you and your team can see them."
      />
      <div className="min-h-0 flex-1">
        <InboxClient
          initialItems={initial.data}
          initialError={initial.error}
          pageSize={PAGE_SIZE}
          canManage={canManageInbox(admin.role)}
        />
      </div>
    </div>
  );
}
