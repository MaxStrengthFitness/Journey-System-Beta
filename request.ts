import http from 'http';
http.get('http://localhost:3000/src/main.tsx', res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log("Main tsx status:", res.statusCode, "Length:", data.length));
}).on('error', err => console.log('ERROR:', err.message));
