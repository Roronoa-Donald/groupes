const http = require('http');

async function testPing() {
  console.log('Testing /api/ping...');
  const start = Date.now();

  try {
    await new Promise((resolve, reject) => {
      const req = http.get('http://localhost:3000/api/ping', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const duration = Date.now() - start;
          console.log(`Response received in ${duration}ms`);
          console.log(`Status: ${res.statusCode}`);
          console.log(`Body: ${data}`);
          resolve();
        });
      });
      req.on('error', reject);
      req.end();
    });
  } catch (e) {
    console.error('Error during request:', e.message);
    process.exit(1);
  }
}

testPing().then(() => process.exit(0));
