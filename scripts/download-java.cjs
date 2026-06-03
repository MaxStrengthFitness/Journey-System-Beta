const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

async function downloadJava() {
  console.log('Downloading Java...');
  const url = 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.8.1%2B1/OpenJDK17U-jre_x64_linux_hotspot_17.0.8.1_1.tar.gz';
  
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        https.get(res.headers.location, (redirectRes) => {
          const file = fs.createWriteStream('jre.tar.gz');
          redirectRes.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        }).on('error', reject);
      } else {
        const file = fs.createWriteStream('jre.tar.gz');
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }
    }).on('error', reject);
  });
}

async function main() {
  if (!fs.existsSync('jre')) {
    await downloadJava();
    console.log('Extracting Java...');
    execSync('tar -xzf jre.tar.gz');
    execSync('mv jdk-* jre');
    execSync('rm jre.tar.gz');
  }
  console.log('Java installed at /app/applet/jre');
}

main().catch(console.error);
