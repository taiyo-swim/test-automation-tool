-- Phase 1-3 initial schema

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamMember" (
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("teamId","userId")
);

CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "baseUrl" TEXT,
    "appPackage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Environment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    CONSTRAINT "Environment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Test" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "folderId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Test_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TestStep" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "sharedStepId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TestStep_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TestStep_testId_order_idx" ON "TestStep"("testId", "order");

CREATE TABLE "SharedStep" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    CONSTRAINT "SharedStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TestDataSet" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "csvContent" TEXT NOT NULL,
    CONSTRAINT "TestDataSet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TestRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "environment" TEXT,
    "triggeredById" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TestRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TestRun_projectId_createdAt_idx" ON "TestRun"("projectId", "createdAt" DESC);

CREATE TABLE "TestRunResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "videoUrl" TEXT,
    CONSTRAINT "TestRunResult_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TestRunResult_runId_idx" ON "TestRunResult"("runId");

CREATE TABLE "StepResult" (
    "id" TEXT NOT NULL,
    "runResultId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "screenshotPath" TEXT,
    "logText" TEXT,
    "durationMs" INTEGER,
    "executedAt" TIMESTAMP(3),
    CONSTRAINT "StepResult_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StepResult_runResultId_order_idx" ON "StepResult"("runResultId", "order");

CREATE TABLE "VisualBaseline" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VisualBaseline_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VisualBaseline_projectId_testId_stepId_key"
    ON "VisualBaseline"("projectId", "testId", "stepId");

CREATE TABLE "VisualDiff" (
    "id" TEXT NOT NULL,
    "stepResultId" TEXT NOT NULL,
    "baselineId" TEXT NOT NULL,
    "diffImagePath" TEXT,
    "diffPercentage" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VisualDiff_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VisualDiff_stepResultId_key" ON "VisualDiff"("stepResultId");

CREATE TABLE "HealingSuggestion" (
    "id" TEXT NOT NULL,
    "stepResultId" TEXT NOT NULL,
    "originalSelector" TEXT NOT NULL,
    "suggestedSelector" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HealingSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HealingSuggestion_stepResultId_key" ON "HealingSuggestion"("stepResultId");

CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cronExpression" TEXT NOT NULL,
    "environmentId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");

-- Foreign keys
ALTER TABLE "TeamMember"
    ADD CONSTRAINT "TeamMember_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamMember"
    ADD CONSTRAINT "TeamMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Project"
    ADD CONSTRAINT "Project_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Environment"
    ADD CONSTRAINT "Environment_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Test"
    ADD CONSTRAINT "Test_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TestStep"
    ADD CONSTRAINT "TestStep_testId_fkey"
    FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TestStep"
    ADD CONSTRAINT "TestStep_sharedStepId_fkey"
    FOREIGN KEY ("sharedStepId") REFERENCES "SharedStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SharedStep"
    ADD CONSTRAINT "SharedStep_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TestDataSet"
    ADD CONSTRAINT "TestDataSet_testId_fkey"
    FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TestRun"
    ADD CONSTRAINT "TestRun_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TestRun"
    ADD CONSTRAINT "TestRun_triggeredById_fkey"
    FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TestRunResult"
    ADD CONSTRAINT "TestRunResult_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "TestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TestRunResult"
    ADD CONSTRAINT "TestRunResult_testId_fkey"
    FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StepResult"
    ADD CONSTRAINT "StepResult_runResultId_fkey"
    FOREIGN KEY ("runResultId") REFERENCES "TestRunResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StepResult"
    ADD CONSTRAINT "StepResult_stepId_fkey"
    FOREIGN KEY ("stepId") REFERENCES "TestStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VisualBaseline"
    ADD CONSTRAINT "VisualBaseline_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VisualDiff"
    ADD CONSTRAINT "VisualDiff_stepResultId_fkey"
    FOREIGN KEY ("stepResultId") REFERENCES "StepResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisualDiff"
    ADD CONSTRAINT "VisualDiff_baselineId_fkey"
    FOREIGN KEY ("baselineId") REFERENCES "VisualBaseline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HealingSuggestion"
    ADD CONSTRAINT "HealingSuggestion_stepResultId_fkey"
    FOREIGN KEY ("stepResultId") REFERENCES "StepResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Schedule"
    ADD CONSTRAINT "Schedule_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApiToken"
    ADD CONSTRAINT "ApiToken_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
