import fs from 'node:fs';

const file = 'server/h2adsWorkerRoute.ts';
let source = fs.readFileSync(file, 'utf8');

const oldText = `    } catch (error) {\n      res.status(409).json({ error: error instanceof Error ? error.message : \"Não foi possível salvar o snapshot H2ADS.\" });\n    }\n  });\n\n  app.get(\"/api/h2ads/worker/profiles/:instanceId/snapshot\"`;

const newText = `    } catch (error) {\n      const message = error instanceof Error ? error.message : \"Não foi possível salvar o snapshot H2ADS.\";\n      const safeMessage = message.replace(/[\\r\\n]+/g, \" \").slice(0, 300);\n      console.warn(\`[H2ADS][Snapshot] rejected instanceId=\${instanceId} workerId=\${worker.id} reason=\${safeMessage}\`);\n      res.status(409).json({ error: message });\n    }\n  });\n\n  app.get(\"/api/h2ads/worker/profiles/:instanceId/snapshot\"`;

const count = source.split(oldText).length - 1;
if (count !== 1) {
  throw new Error(`[h2ads-snapshot-diagnostics] bloco esperado 1 vez, encontrado ${count}`);
}

source = source.replace(oldText, newText);
fs.writeFileSync(file, source, 'utf8');
console.log('[h2ads-snapshot-diagnostics] OK: falhas de snapshot agora registram apenas motivo sanitizado.');
