import nodemailer from "nodemailer";
import { prisma } from "../db.js";
import type { RunSummary } from "./slack.js";

/**
 * Send email notifications to project recipients.
 * Requires SMTP_HOST (or AWS SES SMTP endpoint) to be configured.
 * Falls back to no-op if SMTP_HOST is not set.
 */
export async function notifyEmail(summary: RunSummary): Promise<void> {
  const smtpHost = process.env.SMTP_HOST;
  if (!smtpHost) return; // Email notifications disabled

  // Fetch per-project notification settings
  const setting = await prisma.notificationSetting.findUnique({
    where: { projectId: summary.projectId },
    select: {
      emailRecipients: true,
      notifyOnFailure: true,
      notifyOnRecovery: true,
      notifyOnSuccess: true,
    },
  });

  const recipients = setting?.emailRecipients ?? [];
  if (recipients.length === 0) return;

  // Check event toggles
  const isRecovery = summary.status === "passed" && summary.previousStatus === "failed";
  if (summary.status === "failed" && setting && !setting.notifyOnFailure) return;
  if (summary.status === "passed" && isRecovery && setting && !setting.notifyOnRecovery) return;
  if (summary.status === "passed" && !isRecovery && setting && !setting.notifyOnSuccess) return;
  if (summary.status === "cancelled") return;

  const project = await prisma.project.findUnique({
    where: { id: summary.projectId },
    select: { name: true },
  });

  const transport = nodemailer.createTransport({
    host: smtpHost,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS ?? "",
        }
      : undefined,
  });

  const statusLabel = isRecovery
    ? "復旧"
    : { passed: "成功", failed: "失敗" }[summary.status] ?? summary.status;
  const statusEmoji = isRecovery ? "🔄" : summary.status === "passed" ? "✅" : "❌";
  const durationSec = (summary.durationMs / 1000).toFixed(1);
  const runUrl = `${summary.appUrl}/projects/${summary.projectId}/runs/${summary.runId}`;
  const projectName = project?.name ?? summary.projectId;

  const subject = `${statusEmoji} [${projectName}] E2Eテスト ${statusLabel} — ${summary.passedTests}/${summary.totalTests} 件成功`;

  const html = `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><style>
  body { font-family: sans-serif; color: #1f2937; background: #f9fafb; padding: 24px; }
  .card { background: #fff; border-radius: 12px; padding: 24px; max-width: 560px; margin: 0 auto; border: 1px solid #e5e7eb; }
  .header { font-size: 18px; font-weight: 700; margin-bottom: 16px; }
  .stat { display: inline-block; margin-right: 20px; }
  .stat-label { font-size: 11px; color: #6b7280; text-transform: uppercase; }
  .stat-value { font-size: 20px; font-weight: 700; }
  .btn { display: inline-block; margin-top: 20px; background: ${summary.status === "passed" ? "#059669" : "#dc2626"}; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600; }
  .footer { font-size: 11px; color: #9ca3af; margin-top: 20px; }
</style></head>
<body>
  <div class="card">
    <div class="header">${statusEmoji} ${projectName} — ${statusLabel}</div>
    <div>
      <div class="stat">
        <div class="stat-label">成功</div>
        <div class="stat-value" style="color:#059669">${summary.passedTests}</div>
      </div>
      <div class="stat">
        <div class="stat-label">失敗</div>
        <div class="stat-value" style="color:#dc2626">${summary.failedTests}</div>
      </div>
      <div class="stat">
        <div class="stat-label">合計</div>
        <div class="stat-value">${summary.totalTests}</div>
      </div>
      <div class="stat">
        <div class="stat-label">実行時間</div>
        <div class="stat-value">${durationSec}s</div>
      </div>
    </div>
    <a class="btn" href="${runUrl}">レポートを見る</a>
    <div class="footer">
      実行ID: ${summary.runId} &nbsp;·&nbsp; トリガー: ${{ manual: "手動", schedule: "スケジュール", api: "API", ci: "CI/CD" }[summary.trigger] ?? summary.trigger}
    </div>
  </div>
</body>
</html>`;

  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM ?? `"E2E Tool" <noreply@${smtpHost}>`,
      to: recipients.join(", "),
      subject,
      html,
    });
    console.log(`[email] Sent to ${recipients.length} recipient(s) for run ${summary.runId}`);
  } catch (err) {
    console.error("[email] Notification failed:", err instanceof Error ? err.message : err);
  }
}
