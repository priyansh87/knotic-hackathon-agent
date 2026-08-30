const { execSync } = require('child_process');
const path = require('path');

function runCommand(cmd) {
  try {
    console.log(`Running: ${cmd}`);
    const output = execSync(cmd, { encoding: 'utf-8' });
    console.log(output);
  } catch (err) {
    console.error(`Error running command: ${err.message}`);
    if (err.stderr) console.error(err.stderr);
    process.exit(1);
  }
}

console.log('====================================================');
console.log(' Deploying AI Incident Commander Dummy Services');
console.log('====================================================');

// Check if kubectl is connected
try {
  execSync('kubectl get nodes', { stdio: 'ignore' });
} catch (e) {
  console.error('ERROR: Cannot connect to Kubernetes cluster via kubectl.');
  console.error('Make sure Minikube or Kind is running (e.g. run "minikube start" or "kind create cluster").');
  process.exit(1);
}

const k8sDir = path.join(__dirname, '..', 'k8s');

// 1. Deploy Database
console.log('\n--- 1. Deploying PostgreSQL Database ---');
runCommand(`kubectl apply -f "${path.join(k8sDir, 'db-deployment.yaml')}"`);

// 2. Deploy Order Service
console.log('\n--- 2. Deploying Order Service ---');
runCommand(`kubectl apply -f "${path.join(k8sDir, 'order-service-deployment.yaml')}"`);

// 3. Deploy Payment Service
console.log('\n--- 3. Deploying Payment Service ---');
runCommand(`kubectl apply -f "${path.join(k8sDir, 'payment-service-deployment.yaml')}"`);

console.log('\n====================================================');
console.log(' Deployment Complete!');
console.log(' Monitor the pods in the Web Dashboard sidebar.');
console.log('====================================================');
