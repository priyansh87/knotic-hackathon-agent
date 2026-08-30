const http = require('http');

const scenario = process.argv[2];

if (scenario !== 'config_error' && scenario !== 'cpu_spike') {
  console.error('Usage: node simulate-alert.js [config_error | cpu_spike]');
  process.exit(1);
}

const data = JSON.stringify({ scenario });

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/incidents/trigger',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log(`Successfully triggered scenario: ${scenario}`);
      console.log(body);
    } else {
      console.error(`Failed to trigger scenario. Status: ${res.statusCode}`);
      console.error(body);
    }
  });
});

req.on('error', (e) => {
  console.error(`Error connecting to backend: ${e.message}`);
});

req.write(data);
req.end();
