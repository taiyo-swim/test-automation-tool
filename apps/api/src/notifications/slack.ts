import axios from "axios";
import { prisma } from "../db.js";

export interface RunSummary {
  runId: string;
  projectId: string;
  status: "passed" | "failed" | "cancelled";
  trigger: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  durationMs: number;
  appUrl: string;
}

export async function notifySlack(summary: RunSummary) {
  // Get project's Slack webhook from settings
  const project = await prisma.project.findUnique({
    where: { id: summary.projectId },
    select: { name: true },
  });

  // Webhook URL stored in environment variables or project settings
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const statusEmoji = summary.status === "passed" ? "✅" : summary.status === "failed" ? "❌" : "⚠️";
  const statusText = { passed: "成功", failed: "失敗", cancelled: "キャンセル" }[summary.status] ?? summary.status;
  const triggerText = { manual: "手動", schedule: "スケジュール", api: "API", ci: "CI/CD" }[summary.trigger] ?? summary.trigger;
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
          { type: "mrkdwn", text: `*結果*\n✅ ${summary.passedTests} / ❌ ${summary.failedTests} / 合計 ${summary.totalTests}` },
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
