import * as k8s from '@kubernetes/client-node';

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
const k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api);

export interface PodStatus {
  name: string;
  status: string;
  restarts: number;
  ready: boolean;
  age: string;
}

export const k8sTools = {
  // 1. List pods in a namespace
  async listPods(namespace: string = 'default'): Promise<PodStatus[]> {
    try {
      const res = await k8sApi.listNamespacedPod({ namespace });
      return res.items.map(pod => {
        const status = pod.status?.phase || 'Unknown';
        const containerStatuses = pod.status?.containerStatuses || [];
        const restarts = containerStatuses.reduce((acc, curr) => acc + curr.restartCount, 0);
        const ready = containerStatuses.every(c => c.ready);
        
        // Age calculation
        const creationTimestamp = pod.metadata?.creationTimestamp;
        let age = 'Unknown';
        if (creationTimestamp) {
          const diffMs = Date.now() - new Date(creationTimestamp).getTime();
          const diffMins = Math.floor(diffMs / 60000);
          age = diffMins < 60 ? `${diffMins}m` : `${Math.floor(diffMins / 60)}h`;
        }

        return {
          name: pod.metadata?.name || 'unknown',
          status,
          restarts,
          ready,
          age
        };
      });
    } catch (err) {
      console.error('Failed to list pods:', err);
      throw new Error(`K8s: Failed to list pods: ${(err as Error).message}`);
    }
  },

  // 2. Read logs from a pod container
  async getPodLogs(podName: string, namespace: string = 'default', tailLines: number = 50): Promise<string> {
    try {
      const res = await k8sApi.readNamespacedPodLog({
        name: podName,
        namespace,
        tailLines
      });
      return res || '';
    } catch (err) {
      console.error(`Failed to get logs for pod ${podName}:`, err);
      throw new Error(`K8s: Failed to read logs for pod ${podName}: ${(err as Error).message}`);
    }
  },

  // 3. Restart pod (safely delete it so ReplicaSet spins up a new one)
  async restartPod(podName: string, namespace: string = 'default'): Promise<string> {
    try {
      await k8sApi.deleteNamespacedPod({ name: podName, namespace });
      return `Pod ${podName} deleted successfully (restart triggered).`;
    } catch (err) {
      console.error(`Failed to delete pod ${podName}:`, err);
      throw new Error(`K8s: Failed to restart pod ${podName}: ${(err as Error).message}`);
    }
  },

  // 4. Update an environment variable on a deployment (Scenario A fix)
  async updateDeploymentEnv(deploymentName: string, envName: string, envValue: string, namespace: string = 'default'): Promise<string> {
    try {
      // 1. Fetch deployment
      const res = await k8sAppsApi.readNamespacedDeployment({ name: deploymentName, namespace });
      const deployment = res;
      
      const containers = deployment.spec?.template.spec?.containers;
      if (!containers || containers.length === 0) {
        throw new Error('No containers found in deployment spec');
      }

      // 2. Modify container env array
      const targetContainer = containers[0];
      if (!targetContainer.env) {
        targetContainer.env = [];
      }

      const envVar = targetContainer.env.find(e => e.name === envName);
      if (envVar) {
        envVar.value = envValue;
      } else {
        targetContainer.env.push({ name: envName, value: envValue });
      }

      // 3. Update deployment
      await k8sAppsApi.replaceNamespacedDeployment({
        name: deploymentName,
        namespace,
        body: deployment
      });

      return `Deployment ${deploymentName} updated: environment variable ${envName} set to ${envValue}.`;
    } catch (err) {
      console.error(`Failed to update environment for deployment ${deploymentName}:`, err);
      throw new Error(`K8s: Failed to update deployment ${deploymentName} environment: ${(err as Error).message}`);
    }
  },

  // 5. Rollback deployment to previous config (Scenario A rollback option)
  async rollbackDeployment(deploymentName: string, namespace: string = 'default'): Promise<string> {
    try {
      // For the demo simulation, we roll back DB_POOL_SIZE env value to 20 if it was 3
      return await this.updateDeploymentEnv(deploymentName, 'DB_POOL_SIZE', '20', namespace);
    } catch (err) {
      console.error(`Failed to rollback deployment ${deploymentName}:`, err);
      throw new Error(`K8s: Failed to rollback deployment ${deploymentName}: ${(err as Error).message}`);
    }
  },

  // 6. Scale deployment replicas (Scenario B remediation action)
  async scaleDeployment(deploymentName: string, replicas: number, namespace: string = 'default'): Promise<string> {
    try {
      // Fetch deployment
      const res = await k8sAppsApi.readNamespacedDeployment({ name: deploymentName, namespace });
      const deployment = res;

      if (!deployment.spec) {
        throw new Error('No spec found in deployment');
      }

      deployment.spec.replicas = replicas;

      // Replace deployment
      await k8sAppsApi.replaceNamespacedDeployment({
        name: deploymentName,
        namespace,
        body: deployment
      });

      return `Deployment ${deploymentName} scaled to ${replicas} replicas.`;
    } catch (err) {
      console.error(`Failed to scale deployment ${deploymentName}:`, err);
      throw new Error(`K8s: Failed to scale deployment ${deploymentName}: ${(err as Error).message}`);
    }
  },

  // 7. Inject CPU spike trigger into pod (simulating the issue for Scenario B)
  // We do this by creating a mock file /tmp/cpu_spike inside the target pod
  async triggerCpuSpike(podName: string, namespace: string = 'default'): Promise<string> {
    try {
      // Normally we would exec, but since we want the backend to trigger it cleanly,
      // we can run a kubectl command or use the CoreV1Api exec.
      // To bypass complex WebSockets exec client logic, we can spawn a process to run kubectl
      // or we can write a simple wrapper. Spawning kubectl exec is much more robust for Windows kind.
      const { exec } = require('child_process');
      return new Promise((resolve, reject) => {
        exec(`kubectl exec ${podName} -n ${namespace} -- touch /tmp/cpu_spike`, (err: any, stdout: string, stderr: string) => {
          if (err) {
            console.error('Kubectl exec CPU spike failed:', stderr);
            reject(new Error(`Failed to inject CPU spike: ${stderr}`));
          } else {
            resolve(`CPU spike injected into ${podName} successfully.`);
          }
        });
      });
    } catch (err) {
      throw new Error(`Failed to trigger CPU spike: ${(err as Error).message}`);
    }
  },

  // 8. Clear CPU spike trigger in pod
  async clearCpuSpike(podName: string, namespace: string = 'default'): Promise<string> {
    try {
      const { exec } = require('child_process');
      return new Promise((resolve, reject) => {
        exec(`kubectl exec ${podName} -n ${namespace} -- rm -f /tmp/cpu_spike`, (err: any, stdout: string, stderr: string) => {
          if (err) {
            console.error('Kubectl exec clear CPU spike failed:', stderr);
            reject(new Error(`Failed to clear CPU spike: ${stderr}`));
          } else {
            resolve(`CPU spike cleared in ${podName}.`);
          }
        });
      });
    } catch (err) {
      throw new Error(`Failed to clear CPU spike: ${(err as Error).message}`);
    }
  }
};
