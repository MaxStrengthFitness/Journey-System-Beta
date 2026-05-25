import fs from "fs";
import path from "path";

function processFile(filePath) {
  let content = fs.readFileSync(filePath, "utf-8");
  let modified = false;

  const lines = content.split('\n');
  const newLines = lines.filter(line => !line.includes("studioId: typeof activeStudioId"));
  
  if (lines.length !== newLines.length) {
    fs.writeFileSync(filePath, newLines.join('\n'), "utf-8");
    console.log(`Reverted ${filePath}`);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else if (fullPath.endsWith('.tsx')) {
      processFile(fullPath);
    }
  }
}

walkDir("src");

