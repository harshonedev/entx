// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "./client";
import { migrate } from "./migrate";
import { ensureViewerRole } from "./viewer";

describe("ensureViewerRole", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
    await migrate(db);
  });
  afterEach(() => db.close());

  const privileges = (table: string) =>
    db.query<{ privilege_type: string }>(
      "select privilege_type from information_schema.role_table_grants where grantee = 'viewer' and table_name = $1 order by 1",
      [table],
    );

  it("creates a login role that can only select", async () => {
    await ensureViewerRole(db, "s3cret-Pass_1");
    const [role] = await db.query<{ rolcanlogin: boolean; rolsuper: boolean }>(
      "select rolcanlogin, rolsuper from pg_roles where rolname = 'viewer'",
    );
    expect(role).toEqual({ rolcanlogin: true, rolsuper: false });
    expect((await privileges("snapshots")).map((p) => p.privilege_type)).toEqual(["SELECT"]);
    expect((await privileges("job_runs")).map((p) => p.privilege_type)).toEqual(["SELECT"]);
  });

  it("is idempotent and rotates the password", async () => {
    await ensureViewerRole(db, "first-pass");
    await expect(ensureViewerRole(db, "second-pass")).resolves.toBeUndefined();
  });

  it("covers tables created by later migrations", async () => {
    await ensureViewerRole(db, "p");
    await db.exec("create table later_table (id int)");
    expect((await privileges("later_table")).map((p) => p.privilege_type)).toEqual(["SELECT"]);
  });

  it("rejects passwords that could break out of the literal", async () => {
    await expect(ensureViewerRole(db, "x'; drop table snapshots; --")).rejects.toThrow(/password/);
  });
});
