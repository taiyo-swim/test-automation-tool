import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Create demo user
  const passwordHash = await bcrypt.hash("password123", 10);
  const user = await prisma.user.upsert({
    where: { email: "demo@example.com" },
    update: {},
    create: {
      email: "demo@example.com",
      name: "Demo User",
      passwordHash,
    },
  });

  // Create team
  const team = await prisma.team.upsert({
    where: { id: "team_demo" },
    update: {},
    create: {
      id: "team_demo",
      name: "Demo Team",
    },
  });

  // Add user to team
  await prisma.teamMember.upsert({
    where: { teamId_userId: { teamId: team.id, userId: user.id } },
    update: {},
    create: { teamId: team.id, userId: user.id, role: "owner" },
  });

  // Create sample web project
  const project = await prisma.project.upsert({
    where: { id: "proj_demo_web" },
    update: {},
    create: {
      id: "proj_demo_web",
      teamId: team.id,
      name: "デモ Webプロジェクト",
      platform: "web",
      baseUrl: "https://example.com",
    },
  });

  // Create environments
  for (const envName of ["development", "staging", "production"]) {
    await prisma.environment.upsert({
      where: { id: `env_${project.id}_${envName}` },
      update: {},
      create: {
        id: `env_${project.id}_${envName}`,
        projectId: project.id,
        name: envName,
        variables:
          envName === "development"
            ? { BASE_URL: "http://localhost:3000", TEST_EMAIL: "test@example.com" }
            : {},
      },
    });
  }

  // Create sample test
  const test = await prisma.test.upsert({
    where: { id: "test_demo_login" },
    update: {},
    create: {
      id: "test_demo_login",
      projectId: project.id,
      name: "ログインフロー",
      description: "メールとパスワードでログインするテスト",
      tags: ["smoke", "auth"],
    },
  });

  // Create sample steps
  await prisma.testStep.deleteMany({ where: { testId: test.id } });
  await prisma.testStep.createMany({
    data: [
      {
        testId: test.id,
        order: 0,
        action: "navigate",
        params: { url: "{{BASE_URL}}/login" },
      },
      {
        testId: test.id,
        order: 1,
        action: "input",
        params: { selector: "input[type=email]", value: "{{TEST_EMAIL}}" },
      },
      {
        testId: test.id,
        order: 2,
        action: "input",
        params: { selector: "input[type=password]", value: "password123", secret: true },
      },
      {
        testId: test.id,
        order: 3,
        action: "click",
        params: { selector: "button[type=submit]", wait_for: "navigation" },
      },
      {
        testId: test.id,
        order: 4,
        action: "assert_url",
        params: { expected: "/dashboard", mode: "contains" },
      },
      {
        testId: test.id,
        order: 5,
        action: "screenshot",
        params: { name: "ログイン後ダッシュボード", visual_regression: true },
      },
    ],
  });

  console.log("✅ Seed complete!");
  console.log("   Email:    demo@example.com");
  console.log("   Password: password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
