import fs from "fs";
import path from "path";

function processFile(filePath) {
  let content = fs.readFileSync(filePath, "utf-8");
  let modified = false;

  const replaceTarget = "client?.homeStudioId || client?.studioId || ''";
  if (content.includes(replaceTarget)) {
    content = content.replace(new RegExp(replaceTarget.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1"), "g"), "client?.homeStudioId || ''");
    modified = true;
  }
  
  // also fix { merge: true, studioId: ... }
  const badMerge = /{\s*merge:\s*true,\s*studioId:\s*.*?\s*}/g;
  if (badMerge.test(content)) {
     content = content.replace(badMerge, "{ merge: true }");
     modified = true;
  }

  if (modified) {
    fs.writeFileSync(filePath, content, "utf-8");
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
