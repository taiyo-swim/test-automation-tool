-- Phase 4: parallel execution, auto-retry, notification settings, audit log

-- Test: add maxRetries column
ALTER TABLE "Test" ADD COLUMN "maxRetries" INTEGER NOT NULL DEFAULT 0;

-- TestRun: add parallelism column
ALTER TABLE "TestRun" ADD COLUMN "parallelism" INTEGER NOT NULL DEFAULT 1;

-- NotificationSetting: per-project notification config
CREATE TABLE "NotificationSetting" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "slackWebhookUrl" TEXT,
    "notifyOnFailure" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnRecovery" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnSuccess" BOOLEAN NOT NULL DEFAULT false,
    "emailRecipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    CONSTRAINT "NotificationSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationSetting_projectId_key" ON "NotificationSetting"("projectId");

ALTER TABLE "NotificationSetting"
    ADD CONSTRAINT "NotificationSetting_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Schedule: add testIds column (specific test IDs to execute)
ALTER TABLE "Schedule" ADD COLUMN "testIds" JSONB NOT NULL DEFAULT '[]';

-- AuditLog: action history per project
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_projectId_createdAt_idx" ON "AuditLog"("projectId", "createdAt" DESC);

ALTER TABLE "AuditLog"
    ADD CONSTRAINT "AuditLog_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
