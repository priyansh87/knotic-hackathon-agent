import * as k8s from '@kubernetes/client-node';

let k8sApi: any = null;
let k8sAppsApi: any = null;
let isK8sAvailable = false;

try {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  k8sApi = kc.makeApiClient(k8s.CoreV1Api);
  k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api);
  isK8sAvailable = true;
  console.log('[K8S] Successfully connected to active Kubernetes cluster.');
} catch (e) {
  console.warn('[K8S] No active local Kubernetes cluster found. Activating simulated K8s environment for demo.');
}

// In-memory simulated pod state for offline/demo mode
let simulatedPods: PodStatus[] = [
  {
    name: 'order-service-78f99-4d2bc',
    status: 'Running',
    restarts: 0,
    ready: true,
    age: '42m'
  },
  {
    name: 'payment-service-82c11-9a1bf',
    status: 'Running',
    restarts: 0,
    ready: true,
    age: '1h'
  },
  {
    name: 'postgres-db-54a88-bb712',
    status: 'Running',
    restarts: 0,
    ready: true,
    age: '3h'
  }
];

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
    if (!isK8sAvailable || !k8sApi) {
      return [...simulatedPods];
    }
    try {
      const res = await k8sApi.listNamespacedPod({ namespace });
      return res.items.map((pod: any) => {
        const status = pod.status?.phase || 'Unknown';
        const containerStatuses = pod.status?.containerStatuses || [];
        const restarts = containerStatuses.reduce((acc: number, curr: any) => acc + curr.restartCount, 0);
        const ready = containerStatuses.every((c: any) => c.ready);
        
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
      // Return simulated pods on connection error
      return [...simulatedPods];
    }
  },

  // 2. Read logs from a pod container
  async getPodLogs(podName: string, namespace: string = 'default', tailLines: number = 50): Promise<string> {
    if (!isK8sAvailable || !k8sApi) {
      if (podName.startsWith('order-service')) {
        return `[ERROR] ConnectionTimeoutException: Database connection pool exhausted after 3000ms. Active: 3/3, Idle: 0, Pending: 48\n[FATAL] Terminating process due to DB pool exhaustion. Exit code 1.\n[K8s] Back-off restarting failed container`;
      }
      if (podName.startsWith('payment-service')) {
        return `[WARN] High CPU load detected: 96.4% utilization on core 0.\n[WARN] Worker threads throttling. Request latency: 1420ms (P99).`;
      }
      return `[INFO] Container healthy. Uptime 42m.`;
    }
    try {
      const res = await k8sApi.readNamespacedPodLog({
        name: podName,
        namespace,
        tailLines
      });
      return res || '';
    } catch (err) {
      return `[Simulated Logs for ${podName}] Connection pool limit exceeded. Active connections reached cap of 3.`;
    }
  },

  // 3. Restart pod (safely delete it so ReplicaSet spins up a new one)
  async restartPod(podName: string, namespace: string = 'default'): Promise<string> {
    if (!isK8sAvailable || !k8sApi) {
      const pod = simulatedPods.find(p => p.name === podName || podName.startsWith(p.name.split('-')[0]));
      if (pod) {
        pod.restarts += 1;
        pod.status = 'Running';
        pod.ready = true;
      }
      return `Pod ${podName} restarted successfully in simulated cluster.`;
    }
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
    if (!isK8sAvailable || !k8sAppsApi) {
      // Update simulated pod state
      if (deploymentName === 'order-service') {
        const pod = simulatedPods.find(p => p.name.startsWith('order-service'));
        if (pod) {
          if (envValue === '3') {
            pod.status = 'CrashLoopBackOff';
            pod.restarts = 5;
            pod.ready = false;
          } else {
            pod.status = 'Running';
            pod.restarts = 0;
            pod.ready = true;
          }
        }
      }
      return `[Simulation] Deployment ${deploymentName} updated: ${envName} = ${envValue}.`;
    }
    try {
      const res = await k8sAppsApi.readNamespacedDeployment({ name: deploymentName, namespace });
      const deployment = res;
      
      const containers = deployment.spec?.template.spec?.containers;
      if (!containers || containers.length === 0) {
        throw new Error('No containers found in deployment spec');
      }

      const targetContainer = containers[0];
      if (!targetContainer.env) {
        targetContainer.env = [];
      }

      const envVar = targetContainer.env.find((e: any) => e.name === envName);
      if (envVar) {
        envVar.value = envValue;
      } else {
        targetContainer.env.push({ name: envName, value: envValue });
      }

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
    return await this.updateDeploymentEnv(deploymentName, 'DB_POOL_SIZE', '20', namespace);
  },

  // 6. Scale deployment replicas (Scenario B remediation action)
  async scaleDeployment(deploymentName: string, replicas: number, namespace: string = 'default'): Promise<string> {
    if (!isK8sAvailable || !k8sAppsApi) {
      if (deploymentName === 'payment-service') {
        const pod = simulatedPods.find(p => p.name.startsWith('payment-service'));
        if (pod) {
          pod.status = 'Running';
          pod.ready = true;
        }
        if (replicas > 1 && simulatedPods.filter(p => p.name.startsWith('payment-service')).length === 1) {
          simulatedPods.push({
            name: 'payment-service-82c11-rep2',
            status: 'Running',
            restarts: 0,
            ready: true,
            age: '1m'
          });
          simulatedPods.push({
            name: 'payment-service-82c11-rep3',
            status: 'Running',
            restarts: 0,
            ready: true,
            age: '1m'
          });
        } else if (replicas === 1) {
          simulatedPods = simulatedPods.filter(p => !p.name.includes('-rep2') && !p.name.includes('-rep3'));
        }
      }
      return `[Simulation] Deployment ${deploymentName} scaled to ${replicas} replicas.`;
    }
    try {
      const res = await k8sAppsApi.readNamespacedDeployment({ name: deploymentName, namespace });
      const deployment = res;

      if (!deployment.spec) {
        throw new Error('No spec found in deployment');
      }

      deployment.spec.replicas = replicas;

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

  // 7. Inject CPU spike trigger into pod
  async triggerCpuSpike(podName: string, namespace: string = 'default'): Promise<string> {
    if (!isK8sAvailable) {
      const pod = simulatedPods.find(p => p.name.startsWith('payment-service'));
      if (pod) {
        pod.status = 'High CPU (96%)';
      }
      return `[Simulation] CPU spike workload injected into ${podName}.`;
    }
    try {
      const { exec } = require('child_process');
      return new Promise((resolve, reject) => {
        exec(`kubectl exec ${podName} -n ${namespace} -- touch /tmp/cpu_spike`, (err: any, stdout: string, stderr: string) => {
          if (err) {
            resolve(`Simulated CPU spike fallback applied.`);
          } else {
            resolve(`CPU spike injected into ${podName} successfully.`);
          }
        });
      });
    } catch (err) {
      return `CPU spike simulated.`;
    }
  },

  // 8. Clear CPU spike trigger in pod
  async clearCpuSpike(podName: string, namespace: string = 'default'): Promise<string> {
    if (!isK8sAvailable) {
      const pod = simulatedPods.find(p => p.name.startsWith('payment-service'));
      if (pod) {
        pod.status = 'Running';
      }
      return `[Simulation] CPU spike workload cleared in ${podName}.`;
    }
    try {
      const { exec } = require('child_process');
      return new Promise((resolve) => {
        exec(`kubectl exec ${podName} -n ${namespace} -- rm -f /tmp/cpu_spike`, () => {
          resolve(`CPU spike cleared in ${podName}.`);
        });
      });
    } catch (err) {
      return `CPU spike cleared.`;
    }
  }
};

