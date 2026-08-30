import dotenv from 'dotenv';
dotenv.config();

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

export const slackTools = {
  async sendEscalation(serviceName: string, title: string, likelyCause: string, confidence: number, dbConstraints: string[]): Promise<string> {
    const payload = {
      text: `🚨 *AI Incident Commander Escalation Alert* 🚨`,
      attachments: [
        {
          color: "#FF0000",
          title: `Service: ${serviceName} - ${title}`,
          fields: [
            {
              title: "Suspected Cause",
              value: likelyCause || "Unknown - Human review needed",
              short: false
            },
            {
              title: "Confidence Level",
              value: `${confidence}%`,
              short: true
            },
            {
              title: "Triggered Constraints",
              value: dbConstraints.length > 0 ? dbConstraints.join('\n') : "None",
              short: true
            }
          ],
          footer: "Agora Conversational AI Incident Assistant",
          ts: Math.floor(Date.now() / 1000)
        }
      ]
    };

    if (!SLACK_WEBHOOK_URL) {
      console.log(`[Slack Escalation] SLACK_WEBHOOK_URL not configured. Simulated Slack message:`, JSON.stringify(payload, null, 2));
      return `Escalation successfully logged. (Mock channel: #oncall-escalations)`;
    }

    try {
      const response = await fetch(SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Slack webhook returned status: ${response.status}`);
      }

      return `Escalation message sent to Slack channel.`;
    } catch (err) {
      console.error('Failed to send Slack escalation, falling back to mock:', err);
      return `Escalation triggered (Slack send failed: ${(err as Error).message})`;
    }
  }
};
