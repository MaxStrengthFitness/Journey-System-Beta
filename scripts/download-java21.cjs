const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

async function downloadJava() {
  console.log('Downloading Java 21...');
  const url = 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.1%2B12/OpenJDK21U-jre_x64_linux_hotspot_21.0.1_12.tar.gz';
  
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        https.get(res.headers.location, (redirectRes) => {
          const file = fs.createWriteStream('jre21.tar.gz');
          redirectRes.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        }).on('error', reject);
      } else {
        const file = fs.createWriteStream('jre21.tar.gz');
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
  if (!fs.existsSync('jre21')) {
    await downloadJava();
    console.log('Extracting Java...');
    execSync('tar -xzf jre21.tar.gz');
    execSync('mv jdk-* jre21');
    execSync('rm jre21.tar.gz');
  }
  console.log('Java 21 installed at /app/applet/jre21');
}

main().catch(console.error);
