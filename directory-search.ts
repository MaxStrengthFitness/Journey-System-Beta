import fs from 'fs';

const filePath = 'src/components/ClientDirectoryView.tsx';
let content = fs.readFileSync(filePath, 'utf-8');

// Add imports
if (!content.includes('import { db }')) {
  content = content.replace(
    /import { Client, Trainer } from '\.\.\/types';/,
    `import { Client, Trainer } from '../types';\nimport { db } from '../lib/firebase';\nimport { collection, query, where, getDocs, limit } from 'firebase/firestore';`
  );
}

// Add state for db search
if (!content.includes('dbSearchResults')) {
  content = content.replace(
    /const \[isGlobalSearch, setIsGlobalSearch\] = useState\(false\);/,
    `const [isGlobalSearch, setIsGlobalSearch] = useState(false);\n  const [dbSearchResults, setDbSearchResults] = useState<Client[]>([]);\n  const [isSearchingDb, setIsSearchingDb] = useState(false);\n\n  React.useEffect(() => {\n    if (!searchTerm.trim()) {\n      setDbSearchResults([]);\n      return;\n    }\n    setIsSearchingDb(true);\n    const delayDebounceFn = setTimeout(async () => {\n      try {\n        const term = searchTerm.trim().toLowerCase();\n        const alphaOnly = term.replace(/[^a-z]/g, "");\n        const prefixLen = alphaOnly.length > 3 ? 3 : alphaOnly.length;\n        const prefix = alphaOnly.slice(0, prefixLen);\n        const prefixCapitalized = prefix.charAt(0).toUpperCase() + prefix.slice(1);\n\n        if (!prefixCapitalized) {\n          setDbSearchResults([]);\n          setIsSearchingDb(false);\n          return;\n        }\n\n        const clientsRef = collection(db, "clients");\n        const q1 = query(\n          clientsRef,\n          where("firstName", ">=", prefixCapitalized),\n          where("firstName", "<=", prefixCapitalized + "\\uf8ff"),\n          limit(30)\n        );\n        const q2 = query(\n          clientsRef,\n          where("lastName", ">=", prefixCapitalized),\n          where("lastName", "<=", prefixCapitalized + "\\uf8ff"),\n          limit(30)\n        );\n\n        const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);\n        const uniqueDocs = new Map<string, any>();\n        [...snap1.docs, ...snap2.docs].forEach((d) => {\n          uniqueDocs.set(d.id, { id: d.id, ...d.data() });\n        });\n\n        const candidates = Array.from(uniqueDocs.values());\n        const fetched = candidates.filter((c) => {\n          const first = (c.firstName || "").toLowerCase();\n          const last = (c.lastName || "").toLowerCase();\n          const full = \`\${first} \${last}\`;\n          const mb = (c.mindbody_name || "").toLowerCase();\n\n          return (\n            first.includes(term) ||\n            last.includes(term) ||\n            full.includes(term) ||\n            mb.includes(term) ||\n            term.includes(first) ||\n            term.includes(last)\n          );\n        });\n\n        setDbSearchResults(fetched);\n      } catch (err) {\n        console.error(err);\n      } finally {\n        setIsSearchingDb(false);\n      }\n    }, 300);\n    return () => clearTimeout(delayDebounceFn);\n  }, [searchTerm]);`
  );
}

// Modify displayClients logic to merge clients arrays
if (!content.includes('...dbSearchResults')) {
  content = content.replace(
    /let filtered = clients;/,
    `let filtered = Array.from(new Map([...clients, ...dbSearchResults].map(c => [c.id, c])).values());`
  );
}

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Modified ClientDirectoryView.tsx');
