import axios from "axios";
import { prisma } from "../db.js";

export interface RunSummary {
  runId: string;
  projectId: string;
  status: "passed" | "failed" | "cancelled";
  previousStatus?: "passed" | "failed" | null; // for recovery detection
  trigger: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  durationMs: number;
  appUrl: string;
}

/**
 * Determine if notification should fire based on project settings + event type.
 * Returns the webhook URL to use, or null if notification should be suppressed.
 */
async function resolveWebhookUrl(
  projectId: string,
  summary: RunSummary
): Promise<string | null> {
  // Fetch per-project notification settings
  const setting = await prisma.notificationSetting.findUnique({
    where: { projectId },
  });

  // Determine event type
  const isRecovery =
    summary.status === "passed" && summary.previousStatus === "failed";

  // Check per-project toggles (fall back to "always notify" if no setting)
  if (setting) {
    if (summary.status === "failed" && !setting.notifyOnFailure) return null;
    if (summary.status === "passed" && isRecovery && !setting.notifyOnRecovery) return null;
    if (summary.status === "passed" && !isRecovery && !setting.notifyOnSuccess) return null;
    if (summary.status === "cancelled") return null; // never notify on cancel via project settings
  }

  // Webhook URL: project-specific > global env
  const webhookUrl = setting?.slackWebhookUrl ?? process.env.SLACK_WEBHOOK_URL ?? null;
  return webhookUrl;
}

export async function notifySlack(summary: RunSummary) {
  const webhookUrl = await resolveWebhookUrl(summary.projectId, summary);
  if (!webhookUrl) return;

  const project = await prisma.project.findUnique({
    where: { id: summary.projectId },
    select: { name: true },
  });

  const isRecovery =
    summary.status === "passed" && summary.previousStatus === "failed";

  const statusEmoji = isRecovery
    ? "🔄"
    : summary.status === "passed"
    ? "✅"
    : summary.status === "failed"
    ? "❌"
    : "⚠️";

  const statusText = isRecovery
    ? "復旧"
    : { passed: "成功", failed: "失敗", cancelled: "キャンセル" }[summary.status] ?? summary.status;

  const triggerText =
    { manual: "手動", schedule: "スケジュール", api: "API", ci: "CI/CD" }[summary.trigger] ??
    summary.trigger;
  const durationSec = (summary.durationMs / 1000).toFixed(1);
  const runUrl = `${summary.appUrl}/projects/${summary.projectId}/runs/${summary.runId}`;

  const payload = {
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${statusEmoji} *E2Eテスト実行結果: ${statusText}*\n*プロジェクト:* ${project?.name ?? summary.projectId}`,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*結果*\n✅ ${summary.passedTests} / ❌ ${summary.failedTests} / 合計 ${summary.totalTests}`,
          },
          { type: "mrkdwn", text: `*実行時間*\n${durationSec}秒` },
          { type: "mrkdwn", text: `*トリガー*\n${triggerText}` },
          { type: "mrkdwn", text: `*実行ID*\n\`${summary.runId.slice(-8)}\`` },
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "レポートを見る" },
            url: runUrl,
            style: summary.status === "passed" ? "primary" : "danger",
          },
        ],
      },
    ],
  };

  try {
    await axios.post(webhookUrl, payload, { timeout: 10_000 });
  } catch (err) {
    console.error("[slack] Notification failed:", err instanceof Error ? err.message : err);
  }
}
