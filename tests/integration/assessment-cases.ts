import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

export function assessmentCases(
  getBase: () => string,
  getDb: () => PrismaClient,
  password: string,
  hash: () => Promise<string>,
) {
  describe("assessment administration and publication against real PostgreSQL", () => {
    const tenant = randomUUID(),
      foreign = randomUUID(),
      classId = randomUUID(),
      foreignClass = randomUUID(),
      s1 = randomUUID(),
      s2 = randomUUID(),
      foreignStudent = randomUUID();
    const ids = {
      owner: randomUUID(),
      backup: randomUUID(),
      academic: randomUUID(),
      teacher: randomUUID(),
      wrong: randomUUID(),
      student: randomUUID(),
      guardian: randomUUID(),
      accountant: randomUUID(),
      foreign: randomUUID(),
    };
    const tokens = {
      owner: "",
      academic: "",
      teacher: "",
      wrong: "",
      student: "",
      guardian: "",
      accountant: "",
    };
    let primary = "";
    async function api(
      route: string,
      method = "GET",
      body?: unknown,
      token = tokens.owner,
    ) {
      const response = await fetch(getBase() + route, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    }
    async function create(title: string, token = tokens.owner) {
      const r = await api(
        `/classes/${classId}/assessments`,
        "POST",
        { title, heldAt: "2026-11-15", maxScore: "10.00" },
        token,
      );
      expect(r.status).toBe(201);
      return r.body.data;
    }
    const published = (token = tokens.student) =>
      api("/mobile/my/grades", "GET", undefined, token);
    const guardianGrades = () =>
      api(
        `/mobile/guardian/students/${s1}/grades`,
        "GET",
        undefined,
        tokens.guardian,
      );
    beforeAll(async () => {
      const db = getDb(),
        passwordHash = await hash(),
        plan = await db.plan.findUniqueOrThrow({
          where: { code: "TEST_PLAN" },
        });
      for (const id of [tenant, foreign]) {
        await db.tenant.create({
          data: {
            id,
            slug: "assessment-" + id,
            name: "Synthetic assessment centre",
            status: "ACTIVE",
            subscriptionEndsAt: new Date("2028-01-01Z"),
            graceUntil: new Date("2028-02-01Z"),
          },
        });
        await db.subscription.create({
          data: {
            tenantId: id,
            planId: plan.id,
            startsAt: new Date("2020-01-01Z"),
            endsAt: new Date("2028-01-01Z"),
            graceUntil: new Date("2028-02-01Z"),
          },
        });
      }
      for (const [key, role] of [
        ["owner", "owner"],
        ["backup", "owner"],
        ["academic", "academic_staff"],
        ["teacher", "teacher"],
        ["wrong", "teacher"],
        ["student", "student"],
        ["guardian", "guardian"],
        ["accountant", "accountant"],
        ["foreign", "owner"],
      ] as const) {
        await db.user.create({
          data: {
            id: ids[key],
            email: ids[key] + "@example.test",
            displayName: "Original assessment " + key,
            status: "ACTIVE",
            passwordHash,
          },
        });
        await db.membership.create({
          data: {
            tenantId: key === "foreign" ? foreign : tenant,
            userId: ids[key],
            status: "ACTIVE",
            roles: { create: { role } },
          },
        });
        if (key !== "backup" && key !== "foreign") {
          const login = await api(
            "/mobile/auth/login",
            "POST",
            { email: ids[key] + "@example.test", password },
            "",
          );
          expect(login.status).toBe(200);
          const selected = await api(
            "/auth/switch-context",
            "POST",
            { tenantId: tenant, role },
            login.body.data.accessToken,
          );
          expect(selected.status).toBe(200);
          tokens[key] = selected.body.data.accessToken;
        }
      }
      for (const [id, tenantId] of [
        [classId, tenant],
        [foreignClass, foreign],
      ] as const)
        await db.educationClass.create({
          data: {
            id,
            tenantId,
            code: "C" + id.slice(0, 8),
            name: "Synthetic assessment class",
            capacity: 20,
            startDate: new Date("2026-11-01Z"),
            endDate: new Date("2026-12-31Z"),
          },
        });
      for (const [key, from] of [
        ["teacher", "2026-11-01"],
        ["wrong", "2026-12-01"],
      ] as const) {
        const t = await db.teacher.create({
          data: {
            tenantId: tenant,
            userId: ids[key],
            teacherCode: key,
            fullName: "Synthetic " + key,
          },
        });
        await db.classTeacher.create({
          data: {
            tenantId: tenant,
            classId,
            teacherId: t.id,
            effectiveFrom: new Date(from + "T00:00:00Z"),
            effectiveTo: new Date("2026-12-31Z"),
          },
        });
      }
      for (const [id, tenantId, code, userId] of [
        [s1, tenant, "AS1", ids.student],
        [s2, tenant, "AS2", undefined],
        [foreignStudent, foreign, "ASF", undefined],
      ] as const) {
        await db.student.create({
          data: {
            id,
            tenantId,
            studentCode: code,
            fullName: "Synthetic " + code,
            ...(userId ? { userId } : {}),
          },
        });
        await db.enrollment.create({
          data: {
            tenantId,
            classId: tenantId === tenant ? classId : foreignClass,
            studentId: id,
            joinedAt: new Date("2026-11-01Z"),
          },
        });
        if (tenantId === tenant)
          await db.guardianLink.create({
            data: {
              tenantId: tenant,
              studentId: id,
              guardianUserId: ids.guardian,
              status: "ACTIVE",
              verifiedAt: new Date(),
              verifiedBy: ids.owner,
              verificationMethod: "Synthetic verified assessment guardian",
            },
          });
      }
    });
    it("saves partial drafts with exact zero/maximum, rolls back a bad batch, hides drafts and publishes only authorized results", async () => {
      expect(
        (
          await api(`/classes/${classId}/assessments`, "POST", {
            title: "   ",
            heldAt: "2026-11-15",
            maxScore: "10",
          })
        ).status,
      ).toBe(422);
      expect(
        (
          await api(`/classes/${classId}/assessments`, "POST", {
            title: "Invalid scale",
            heldAt: "2026-11-15",
            maxScore: "0",
          })
        ).status,
      ).toBe(422);
      const created = await create("  Exact assessment  ");
      primary = created.id;
      expect(created).toMatchObject({
        title: "Exact assessment",
        status: "DRAFT",
        version: 1,
        publishedAt: null,
      });
      expect(
        (await api(`/assessments/${primary}/results`)).body.data,
      ).toMatchObject({ className: "Synthetic assessment class" });
      const first = await api(`/assessments/${primary}/results`, "PUT", {
        version: 1,
        records: [{ studentId: s1, score: "0", comment: "" }],
      });
      expect(first.status).toBe(200);
      expect(first.body.data.assessment.version).toBe(2);
      expect(
        first.body.data.rows.find(
          (r: { studentId: string }) => r.studentId === s1,
        ).score,
      ).toBe("0.00");
      for (const route of ["/mobile/my/grades"])
        expect(
          (await api(route, "GET", undefined, tokens.student)).body.data,
        ).toEqual([]);
      expect((await guardianGrades()).body.data).toEqual([]);
      expect((await api(`/students/${s1}/grades`)).body.data).toEqual([]);
      expect(
        (await api(`/assessments/${primary}/publish`, "POST", { version: 2 }))
          .status,
      ).toBe(422);
      const second = await api(`/assessments/${primary}/results`, "PUT", {
        version: 2,
        records: [{ studentId: s2, score: "10.00", comment: "Exact maximum" }],
      });
      expect(second.status).toBe(200);
      for (const records of [
        [
          { studentId: s1, score: "8.00", comment: "Must roll back" },
          { studentId: s2, score: "11.00", comment: "Too high" },
        ],
        [{ studentId: s1, score: null, comment: "" }],
        [
          {
            studentId: foreignStudent,
            score: "8.00",
            comment: "Foreign student",
          },
        ],
      ])
        expect(
          (
            await api(`/assessments/${primary}/results`, "PUT", {
              version: 3,
              records,
            })
          ).status,
        ).toBe(422);
      expect(
        (await getDb().assessment.findUniqueOrThrow({ where: { id: primary } }))
          .version,
      ).toBe(3);
      expect(
        await getDb().gradeChange.count({
          where: { tenantId: tenant, assessmentId: primary },
        }),
      ).toBe(2);
      expect(
        await getDb().outboxEvent.count({
          where: {
            tenantId: tenant,
            eventType: "GRADE_PUBLISHED",
            aggregateId: primary,
          },
        }),
      ).toBe(0);
      const history = await api(
        `/assessments/${primary}/history?limit=1&page=2`,
      );
      expect(history.status).toBe(200);
      expect(history.body.page).toMatchObject({
        total: 2,
        totalPages: 2,
        page: 2,
      });
      expect(history.body.data[0]).toMatchObject({
        actorUserId: ids.owner,
        actorDisplayName: "Original assessment owner",
        beforeValue: null,
        afterValue: { score: "0.00", comment: "" },
      });
      const publication = await api(`/assessments/${primary}/publish`, "POST", {
        version: 3,
      });
      expect(publication.status).toBe(201);
      expect(publication.body.data.assessment).toMatchObject({
        status: "PUBLISHED",
        version: 4,
      });
      expect(publication.body.data.assessment.publishedAt).toBeTruthy();
      expect((await published()).body.data[0]).toMatchObject({
        id: primary,
        score: "0.00",
        maxScore: "10.00",
      });
      expect((await guardianGrades()).body.data[0].score).toBe("0.00");
      expect(
        (
          await api(
            `/mobile/guardian/students/${s2}/grades`,
            "GET",
            undefined,
            tokens.guardian,
          )
        ).body.data[0].score,
      ).toBe("10.00");
      expect(
        (
          await api(
            `/mobile/guardian/students/${foreignStudent}/grades`,
            "GET",
            undefined,
            tokens.guardian,
          )
        ).status,
      ).toBe(404);
      for (const token of [
        tokens.student,
        tokens.guardian,
        tokens.accountant,
      ]) {
        expect(
          (
            await api(
              `/assessments/${primary}/history`,
              "GET",
              undefined,
              token,
            )
          ).status,
        ).toBe(403);
        expect(
          (
            await api(
              `/assessments/${primary}/lifecycle`,
              "GET",
              undefined,
              token,
            )
          ).status,
        ).toBe(403);
        expect(
          (await api(`/students/${s1}/grades`, "GET", undefined, token)).status,
        ).toBe(403);
      }
    });
    it("reopens only with privileged meaningful reason, keeps exact history/actors and hides corrections until republication", async () => {
      expect(
        (
          await api(`/assessments/${primary}/results`, "PUT", {
            version: 4,
            records: [
              {
                studentId: s1,
                score: "9.00",
                comment: "Denied published write",
              },
            ],
          })
        ).status,
      ).toBe(409);
      for (const token of [tokens.academic, tokens.teacher])
        expect(
          (
            await api(
              `/assessments/${primary}/reopen`,
              "POST",
              { version: 4, reason: "Unauthorized correction attempt" },
              token,
            )
          ).status,
        ).toBe(403);
      expect(
        (
          await api(`/assessments/${primary}/reopen`, "POST", {
            version: 4,
            reason: "x          ",
          })
        ).status,
      ).toBe(422);
      const opened = await api(`/assessments/${primary}/reopen`, "POST", {
        version: 4,
        reason: "Verified correction requested by the centre",
      });
      expect(opened.status).toBe(201);
      expect(opened.body.data.assessment).toMatchObject({
        version: 5,
        status: "DRAFT",
        publishedAt: null,
      });
      expect((await published()).body.data).toEqual([]);
      expect((await guardianGrades()).body.data).toEqual([]);
      expect((await api(`/students/${s1}/grades`)).body.data).toEqual([]);
      const updated = await api(`/assessments/${primary}/results`, "PUT", {
        version: 5,
        records: [
          { studentId: s1, score: "8.25", comment: "Corrected exact score" },
          {
            studentId: s2,
            score: null,
            comment: "Verified absence from the assessment",
          },
        ],
      });
      expect(updated.status).toBe(200);
      expect((await published()).body.data).toEqual([]);
      expect(
        await getDb().outboxEvent.count({
          where: { eventType: "GRADE_PUBLISHED", aggregateId: primary },
        }),
      ).toBe(1);
      expect(
        (await api(`/assessments/${primary}/publish`, "POST", { version: 6 }))
          .status,
      ).toBe(201);
      expect((await published()).body.data[0]).toMatchObject({
        score: "8.25",
        comment: "Corrected exact score",
      });
      expect(
        (
          await api(
            `/mobile/guardian/students/${s2}/grades`,
            "GET",
            undefined,
            tokens.guardian,
          )
        ).body.data[0],
      ).toMatchObject({
        score: null,
        comment: "Verified absence from the assessment",
      });
      await getDb().user.update({
        where: { id: ids.owner },
        data: { displayName: "Renamed owner after recorded events" },
      });
      const history = await api(`/assessments/${primary}/history`);
      expect(history.body.data).toHaveLength(4);
      const corrected = history.body.data.find(
        (r: { studentId: string; version: number }) =>
          r.studentId === s1 && r.version === 6,
      );
      expect(corrected).toMatchObject({
        beforeValue: { score: "0.00", comment: "" },
        afterValue: { score: "8.25", comment: "Corrected exact score" },
        actorDisplayName: "Original assessment owner",
      });
      const lifecycle = await api(`/assessments/${primary}/lifecycle?limit=2`);
      expect(lifecycle.body.page).toMatchObject({ total: 7, totalPages: 4 });
      expect(lifecycle.body.data[0]).toMatchObject({
        action: "grade.published",
        version: 7,
        actorDisplayName: "Original assessment owner",
      });
      const event = await getDb().gradeChange.findFirstOrThrow({
        where: { assessmentId: primary },
      });
      await expect(
        getDb().gradeChange.update({
          where: { id: event.id },
          data: { actorDisplayName: "Forged" },
        }),
      ).rejects.toThrow("append only");
      await expect(
        getDb().gradeChange.delete({ where: { id: event.id } }),
      ).rejects.toThrow("append only");
      await expect(
        getDb().gradeChange.create({
          data: {
            tenantId: tenant,
            assessmentId: primary,
            studentId: s1,
            version: 99,
            beforeValue: Prisma.JsonNull,
            afterValue: { score: "1.00", comment: "Foreign actor" },
            actorId: ids.foreign,
          },
        }),
      ).rejects.toThrow();
      await expect(
        getDb().assessment.create({
          data: {
            tenantId: tenant,
            classId,
            title: "Foreign creator rejected",
            heldAt: new Date("2026-11-15Z"),
            maxScore: "10",
            createdBy: ids.foreign,
          },
        }),
      ).rejects.toThrow();
      const draft = await create("Grader FK validation");
      await expect(
        getDb().assessmentResult.create({
          data: {
            tenantId: tenant,
            assessmentId: draft.id,
            studentId: s1,
            score: "1.00",
            comment: "Foreign grader rejected",
            gradedBy: ids.foreign,
          },
        }),
      ).rejects.toThrow();
    });
    it("serializes edits, filters teacher list by assignment dates, masks foreign objects and enforces READ_ONLY", async () => {
      const a = await create("Concurrent assessment", tokens.teacher);
      const outcomes = await Promise.all([
        api(`/assessments/${a.id}/results`, "PUT", {
          version: 1,
          records: [{ studentId: s1, score: "8.00", comment: "First writer" }],
        }),
        api(`/assessments/${a.id}/results`, "PUT", {
          version: 1,
          records: [{ studentId: s1, score: "9.00", comment: "Second writer" }],
        }),
      ]);
      expect(outcomes.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(
        await getDb().gradeChange.count({ where: { assessmentId: a.id } }),
      ).toBe(1);
      expect(
        (
          await api(
            `/classes/${classId}/assessments?search=Concurrent&status=DRAFT`,
          )
        ).body.data.map((v: { id: string }) => v.id),
      ).toEqual([a.id]);
      expect(
        (await api(`/classes/${classId}/assessments?status=invalid`)).status,
      ).toBe(422);
      expect(
        (
          await api(
            `/classes/${classId}/assessments`,
            "GET",
            undefined,
            tokens.wrong,
          )
        ).body.data,
      ).toEqual([]);
      expect(
        (
          await api(
            `/classes/${classId}/assessments`,
            "POST",
            {
              title: "Outside assignment",
              heldAt: "2026-11-15",
              maxScore: "10",
            },
            tokens.wrong,
          )
        ).status,
      ).toBe(404);
      for (const route of [
        `/assessments/${a.id}/results`,
        `/assessments/${a.id}/history`,
        `/assessments/${a.id}/lifecycle`,
      ])
        expect((await api(route, "GET", undefined, tokens.wrong)).status).toBe(
          404,
        );
      const other = await getDb().assessment.create({
        data: {
          tenantId: foreign,
          classId: foreignClass,
          title: "Private foreign assessment",
          heldAt: new Date("2026-11-15Z"),
          maxScore: "10",
          createdBy: ids.foreign,
        },
      });
      for (const route of [
        `/assessments/${other.id}/results`,
        `/assessments/${other.id}/history`,
        `/assessments/${other.id}/lifecycle`,
        `/students/${foreignStudent}/grades`,
      ])
        expect((await api(route)).status).toBe(404);
      await getDb().tenant.update({
        where: { id: tenant },
        data: { status: "READ_ONLY" },
      });
      try {
        expect((await api(`/assessments/${a.id}/results`)).status).toBe(200);
        expect((await api(`/assessments/${a.id}/history`)).status).toBe(200);
        expect(
          (await api(`/assessments/${a.id}/publish`, "POST", { version: 2 }))
            .status,
        ).toBe(403);
        expect(
          (
            await api(`/assessments/${a.id}/results`, "PUT", {
              version: 2,
              records: [],
            })
          ).status,
        ).toBe(403);
      } finally {
        await getDb().tenant.update({
          where: { id: tenant },
          data: { status: "ACTIVE" },
        });
      }
    });
    it("rechecks the live actor after waiting for create/save/publish/reopen and commits no revoked write", async () => {
      const draft = await create("Waiting draft"),
        ready = await create("Waiting publication");
      expect(
        (
          await api(`/assessments/${ready.id}/results`, "PUT", {
            version: 1,
            records: [
              { studentId: s1, score: "8.00", comment: "" },
              { studentId: s2, score: "9.00", comment: "" },
            ],
          })
        ).status,
      ).toBe(200);
      const member = await getDb().membership.findUniqueOrThrow({
        where: { tenantId_userId: { tenantId: tenant, userId: ids.owner } },
      });
      for (const [route, method, body] of [
        [
          `/classes/${classId}/assessments`,
          "POST",
          {
            title: "Denied waiting creation",
            heldAt: "2026-11-15",
            maxScore: "10.00",
          },
        ],
        [
          `/assessments/${draft.id}/results`,
          "PUT",
          {
            version: 1,
            records: [
              { studentId: s1, score: "7.00", comment: "Denied waiting draft" },
            ],
          },
        ],
        [`/assessments/${ready.id}/publish`, "POST", { version: 2 }],
        [
          `/assessments/${primary}/reopen`,
          "POST",
          { version: 7, reason: "Denied waiting correction request" },
        ],
      ] as const) {
        let pending: ReturnType<typeof api> | undefined;
        try {
          await getDb().$transaction(
            async (tx) => {
              await tx.$queryRaw`SELECT id FROM tenants WHERE id=${tenant}::uuid FOR UPDATE`;
              pending = api(route, method, body);
              await expect
                .poll(async () => {
                  const rows = await tx.$queryRaw<
                    { waiting: bigint }[]
                  >`SELECT count(*) AS waiting FROM pg_locks pending JOIN pg_locks held ON held.locktype=pending.locktype AND held.transactionid=pending.transactionid AND held.granted WHERE NOT pending.granted AND held.pid=pg_backend_pid()`;
                  return Number(rows[0]?.waiting ?? 0n);
                })
                .toBeGreaterThan(0);
              await tx.membership.update({
                where: { id: member.id },
                data: { status: "SUSPENDED", version: { increment: 1 } },
              });
            },
            { timeout: 10000 },
          );
          expect((await pending!).status).toBe(403);
        } finally {
          await getDb().membership.update({
            where: { id: member.id },
            data: { status: "ACTIVE", version: { increment: 1 } },
          });
        }
      }
      expect(
        await getDb().assessment.count({
          where: { tenantId: tenant, title: "Denied waiting creation" },
        }),
      ).toBe(0);
      expect(
        (
          await getDb().assessment.findUniqueOrThrow({
            where: { id: draft.id },
          })
        ).version,
      ).toBe(1);
      expect(
        await getDb().assessment.findUniqueOrThrow({ where: { id: ready.id } }),
      ).toMatchObject({ version: 2, status: "DRAFT" });
      expect(
        await getDb().assessment.findUniqueOrThrow({ where: { id: primary } }),
      ).toMatchObject({ version: 7, status: "PUBLISHED" });
    });
  });
}
