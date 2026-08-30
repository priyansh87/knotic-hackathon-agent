import dotenv from 'dotenv';
dotenv.config();

export interface PRDetails {
  number: number;
  title: string;
  author: string;
  mergedAt: string;
  service: string;
  description: string;
}

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO; // Format: "owner/repo"

const MOCK_PR: PRDetails = {
  number: 142,
  title: "Optimized db config for dev testing",
  author: "priyansh-dev",
  mergedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 mins ago
  service: "order-service",
  description: "Decreased connection pool limit to reduce idle connection load on db replica."
};

const MOCK_DIFF = `
diff --git a/k8s/order-service-deployment.yaml b/k8s/order-service-deployment.yaml
index a94b23d..c821b01 100644
--- a/k8s/order-service-deployment.yaml
+++ b/k8s/order-service-deployment.yaml
@@ -25,4 +25,4 @@
         env:
         - name: DB_POOL_SIZE
-          value: "20"
+          value: "3"
`;

export const githubTools = {
  // 1. Fetch recent PRs/commits merged in the last N hours
  async getRecentPRs(serviceName: string, hours: number = 24): Promise<PRDetails[]> {
    if (!GITHUB_TOKEN || !GITHUB_REPO) {
      console.log(`[GitHub] Credentials missing. Returning mock PR for service: ${serviceName}`);
      if (serviceName.toLowerCase().includes('order')) {
        return [MOCK_PR];
      }
      return [];
    }

    try {
      const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/pulls?state=closed&per_page=10`, {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'AI-Incident-Commander'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const pulls = await response.json() as any[];
      
      // Filter for merged PRs in the last N hours touching serviceName
      const cutoffTime = Date.now() - hours * 60 * 60 * 1000;
      
      return pulls
        .filter(pr => pr.merged_at && new Date(pr.merged_at).getTime() > cutoffTime)
        .map(pr => ({
          number: pr.number,
          title: pr.title,
          author: pr.user.login,
          mergedAt: pr.merged_at,
          service: serviceName, // Simplified mapping
          description: pr.body || ''
        }));
    } catch (err) {
      console.error('Failed to fetch from GitHub API, falling back to mock:', err);
      if (serviceName.toLowerCase().includes('order')) {
        return [MOCK_PR];
      }
      return [];
    }
  },

  // 2. Fetch the diff for a specific PR
  async getPRDiff(prId: number): Promise<string> {
    if (!GITHUB_TOKEN || !GITHUB_REPO || prId === 142) {
      console.log(`[GitHub] Returning mock diff for PR #${prId}`);
      return MOCK_DIFF;
    }

    try {
      const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/pulls/${prId}`, {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3.diff', // Request diff format
          'User-Agent': 'AI-Incident-Commander'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const diffText = await response.text();
      return diffText;
    } catch (err) {
      console.error(`Failed to fetch diff for PR #${prId}, falling back to mock:`, err);
      return MOCK_DIFF;
    }
  }
};
