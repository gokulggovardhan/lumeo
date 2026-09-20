import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(path, "utf8");
}

test("admin shell owns one unread inbox realtime subscription for both navigation surfaces", () => {
  const shell = read("components/admin/ControlCenterShell.tsx");
  const sidebar = read("components/admin/ControlCenterSidebar.tsx");
  const mobile = read("components/admin/ControlCenterMobileNav.tsx");
  const realtime = read("components/admin/InboxCountBadge.tsx");

  assert.match(shell, /<InboxCountProvider initialCount=\{unreadInboxCount\}>/);
  assert.match(sidebar, /<InboxCountBadge \/>/);
  assert.match(mobile, /<InboxCountBadge \/>/);
  assert.doesNotMatch(sidebar, /<InboxCountBadge initialCount=/);
  assert.doesNotMatch(mobile, /<InboxCountBadge initialCount=/);
  assert.equal(
    (realtime.match(/\.channel\(/g) ?? []).length,
    1,
    "Unread count provider should own exactly one channel setup.",
  );
});

test("unread inbox realtime configures every postgres handler before subscribe and cleans up the exact channel", () => {
  const realtime = read("components/admin/InboxCountBadge.tsx");
  const subscribeIndex = realtime.indexOf(".subscribe()");
  const handlerIndexes = [...realtime.matchAll(/\.on\(/g)].map((match) => match.index);

  assert.equal(handlerIndexes.length, 3);
  assert.ok(subscribeIndex > 0);
  assert.ok(handlerIndexes.every((index) => index < subscribeIndex));
  assert.match(
    realtime,
    /feedback_queries_unread_badge:\$\{crypto\.randomUUID\(\)\}/,
  );
  assert.match(realtime, /removeChannel\(channel\)/);
  assert.match(realtime, /count: "exact", head: true/);
});

test("full Inbox realtime owns INSERT, UPDATE, DELETE before subscribe and cleans up its unique channel", () => {
  const inbox = read("components/admin/InboxClient.tsx");
  const subscribeIndex = inbox.indexOf(".subscribe()");
  const handlerIndexes = [...inbox.matchAll(/\.on\(/g)].map((match) => match.index);

  assert.match(
    inbox,
    /feedback_queries_inbox:\$\{crypto\.randomUUID\(\)\}/,
  );
  assert.equal(handlerIndexes.length, 3);
  assert.ok(handlerIndexes.every((index) => index < subscribeIndex));
  assert.match(inbox, /event: "INSERT"/);
  assert.match(inbox, /event: "UPDATE"/);
  assert.match(inbox, /event: "DELETE"/);
  assert.match(inbox, /removeChannel\(channel\)/);
  assert.match(inbox, /serverOffset/);
  assert.doesNotMatch(inbox, /\.range\(items\.length/);
});
