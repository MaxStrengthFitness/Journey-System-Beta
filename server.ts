
import fs from 'fs';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import ical from 'node-ical';
import axios from 'axios';
import path from 'path';
import { 
  generateExecutionGuide, 
  generateClinicalStrategy, 
  generateMachineSetupGuide, 
  processLegacyChart, 
  extractMachineSettingsFromImage 
} from './server/gemini.ts';

// Error Handling: Prevent process crash on unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json({ limit: '50mb' }));

  app.post('/api/gemini/executionGuide', async (req, res) => {
    try {
      const { machineName, referenceText } = req.body;
      const data = await generateExecutionGuide(machineName, referenceText);
      res.json(data);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/gemini/clinicalStrategy', async (req, res) => {
    try {
      const { machineName, clientDetails, referenceText, clientAilments, machineContraindications } = req.body;
      const data = await generateClinicalStrategy(machineName, clientDetails, referenceText, clientAilments, machineContraindications);
      res.json(data);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/gemini/machineSetup', async (req, res) => {
    try {
      const { machineName, clientDetails, referenceText, clientAilments, machineContraindications } = req.body;
      const data = await generateMachineSetupGuide(machineName, clientDetails, referenceText, clientAilments, machineContraindications);
      res.json(data);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/gemini/processChart', async (req, res) => {
    try {
      const { images, expectedSessions, pageIndex, totalPages } = req.body;
      const data = await processLegacyChart(images, expectedSessions, pageIndex, totalPages);
      res.json(data);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/gemini/extractSettings', async (req, res) => {
    try {
      const { images } = req.body;
      const data = await extractMachineSettingsFromImage(images);
      res.json(data);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/log-error', (req, res) => {
    console.log('CLIENT ERROR:', req.body);
    fs.appendFileSync('client-errors.log', JSON.stringify(req.body) + '\n');
    res.json({ ok: true });
  });

  // Background Task: Run Master Sync every 60 minutes
  /*
  const SYNC_INTERVAL = 60 * 60 * 1000;
  setInterval(async () => {
    try {
      // await masterSync();
    } catch (error: any) {
      if (error.code === 'resource-exhausted' || error.message?.toLowerCase().includes('quota')) {
        console.error('Scheduled Master Sync failed due to Quota Exceeded. Skipping until reset.');
      } else {
        console.error('Scheduled Master Sync failed:', error);
      }
    }
  }, SYNC_INTERVAL);

  // Initial sync on startup (optional but recommended)
  // masterSync().catch(err => {
    if (err.code === 'resource-exhausted' || err.message?.toLowerCase().includes('quota')) {
      console.error('Initial Master Sync skipped: Quota Limit Exceeded.');
    } else {
      console.error('Initial Master Sync failed:', err);
    }
  });
  */

  app.post('/api/parse-ical', async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: 'URL is required' });
      const response = await axios.get(url);
      const data = ical.parseICS(response.data);
      const events = Object.values(data).filter((ev: any) => ev.type === 'VEVENT');
      res.json({ events });
    } catch (e: any) {
      console.error('iCal fetch error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // API Route for Triggering Master Sync Manually
  app.post('/api/trigger-master-sync', async (req, res) => {
    try {
      const { trainerId, hardReset } = req.body;
      // Feature deprecated on server-side. Call handled by frontend.
      res.json({ 
        success: true, 
        message: hardReset 
          ? 'Master Schedule Hard Reset & Resync triggered successfully' 
          : `${trainerId ? 'Trainer' : 'Master Schedule'} Sync triggered successfully` 
      });
    } catch (error: any) {
      console.error('Manual Sync failed:', error);
      res.status(500).json({ error: error.message || 'Sync failed' });
    }
  });

  // Removed diagnostic endpoint that depended on backend sync-logic.ts

  // API Route for Individual Calendar Sync (legacy/on-demand)
  app.post('/api/sync-calendar', async (req, res) => {
    try {
      const { url, trainerId, trainerName } = req.body;
      if (!url) return res.status(400).json({ error: 'URL is required' });

      const response = await axios.get(url);
      const data = ical.parseICS(response.data);
      
      const events = [];

      // MindBody RegEx patterns for Client Names
      const patterns = [
        /Client:\s*([^(\r\n]+)/i,          // Description: Client: John Doe
        /\(([^)]+)\)/,                     // Summary: Personal Training (John Doe)
        /^([^(:|\n]+)[:|-]/,               // Summary: John Doe: Personal Training
        /for\s+([^(\r\n]+)/i,              // Summary: Training for John Doe
      ];

      const extractClientName = (summary: string, description: string) => {
        const fullText = `${summary}\n${description}`;
        
        for (const pattern of patterns) {
          const match = fullText.match(pattern);
          if (match && match[1]) {
            const name = match[1].trim();
            // Basic validation to avoid matching service names
            if (name.length > 2 && !name.toLowerCase().includes('training') && !name.toLowerCase().includes('workout')) {
              return name;
            }
          }
        }
        
        // Fallback: use summary but strip common prefixes
        return summary.replace(/Personal Training|Workout|Session/gi, '').trim();
      };

      for (const k in data) {
        if (data.hasOwnProperty(k)) {
          const ev = data[k];
          if (ev.type === 'VEVENT') {
            const rawSummary = ev.summary;
            const summary = typeof rawSummary === 'object' && rawSummary !== null ? (rawSummary as any).val : (rawSummary || '');
            
            const rawDescription = ev.description;
            const description = typeof rawDescription === 'object' && rawDescription !== null ? (rawDescription as any).val : (rawDescription || '');
            
            const clientName = extractClientName(summary, description);

            events.push({
              clientName,
              startTime: ev.start,
              endTime: ev.end,
              trainerName: trainerName || description || 'Assigned Staff',
              trainerId: trainerId || null,
              serviceName: summary.includes('(') ? summary.split('(')[0].trim() : (ev.location || 'Training Session'),
              status: 'Scheduled',
              source: 'Subscription'
            });
          }
        }
      }

      res.json({ events });
    } catch (error: any) {
      console.error('Sync error:', error);
      res.status(500).json({ error: error.message || 'Failed to sync calendar' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
