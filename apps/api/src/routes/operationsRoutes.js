const { Router } = require('express');

function createOperationsRoutes(deps) {
  const {
    validateBody,
    validateCreatePillTypeBody,
    validateRegisterMachineBody,
    validateHeartbeatBody,
    validateCreateRecordBody,
    validateCreateJobBody,
    validateFinishJobBody,
    validateIngestEventBody,
    operationsService,
    logError,
    logWarn
  } = deps;

  const router = Router();

  router.get('/pill-types', async (_req, res) => {
    const rows = await operationsService.getPillTypes();
    res.json(rows);
  });

  router.post('/pill-types', validateBody(validateCreatePillTypeBody), async (req, res) => {
    try {
      await operationsService.createPillType(req.body || {});
      return res.status(201).json({ ok: true });
    } catch (error) {
      if (String(error.message).includes('UNIQUE')) {
        return res.status(409).json({ error: 'pill type code already exists' });
      }
      logError('Failed to create pill type', {
        error,
        requestId: req.requestId,
        route: req.path
      });
      return res.status(500).json({ error: 'failed to create pill type' });
    }
  });

  router.get('/machines', async (_req, res) => {
    const rows = await operationsService.getMachines();
    res.json(rows);
  });

  router.post('/machines/register', validateBody(validateRegisterMachineBody), async (req, res) => {
    const payload = await operationsService.registerMachine(req.body || {});
    res.status(201).json({ ok: true, ...payload });
  });

  router.post('/iot/heartbeat', validateBody(validateHeartbeatBody), async (req, res) => {
    const payload = await operationsService.createHeartbeat(req.body || {});
    res.json({ ok: true, ...payload });
  });

  router.post('/records', validateBody(validateCreateRecordBody), async (req, res) => {
    try {
      const created = await operationsService.createRecord(req.body || {});
      return res.status(201).json({ ok: true, ...created });
    } catch (error) {
      if ((error.status || 500) >= 500) {
        logError('Failed to create record', {
          error,
          requestId: req.requestId,
          route: req.path
        });
      } else {
        logWarn('Record rejected', {
          error: error.message,
          requestId: req.requestId,
          route: req.path
        });
      }
      return res.status(error.status || 500).json({ error: error.message || 'failed to create record' });
    }
  });

  router.get('/records', async (req, res) => {
    const rows = await operationsService.getRecords(req.query.limit);
    res.json(rows);
  });

  router.get('/stats', async (_req, res) => {
    const stats = await operationsService.getStats();
    res.json(stats);
  });

  router.get('/events', async (req, res) => {
    const rows = await operationsService.getEvents(req.query.limit);
    res.json(rows);
  });

  router.post('/events/ingest', validateBody(validateIngestEventBody), async (req, res) => {
    try {
      const payload = await operationsService.ingestEvent(req.body || {});
      return res.status(202).json({ ok: true, ...payload });
    } catch (error) {
      if ((error.status || 500) >= 500) {
        logError('Failed to ingest event', {
          error,
          requestId: req.requestId,
          route: req.path
        });
      } else {
        logWarn('Event ingestion rejected', {
          error: error.message,
          requestId: req.requestId,
          route: req.path
        });
      }
      return res.status(error.status || 500).json({ error: error.message || 'failed to ingest event' });
    }
  });

  router.get('/jobs', async (req, res) => {
    const rows = await operationsService.getJobs(req.query.limit);
    res.json(rows);
  });

  router.post('/jobs', validateBody(validateCreateJobBody), async (req, res) => {
    try {
      const created = await operationsService.createJob(req.body || {});
      return res.status(201).json({ ok: true, ...created });
    } catch (error) {
      if ((error.status || 500) >= 500) {
        logError('Failed to create job', {
          error,
          requestId: req.requestId,
          route: req.path
        });
      } else {
        logWarn('Job creation rejected', {
          error: error.message,
          requestId: req.requestId,
          route: req.path
        });
      }
      return res.status(error.status || 500).json({ error: error.message || 'failed to create job' });
    }
  });

  router.post('/jobs/:jobId/start', async (req, res) => {
    try {
      const payload = await operationsService.startJob(req.params.jobId, req.body || {});
      return res.json({ ok: true, ...payload });
    } catch (error) {
      if ((error.status || 500) >= 500) {
        logError('Failed to start job', {
          error,
          requestId: req.requestId,
          route: req.path
        });
      } else {
        logWarn('Start job rejected', {
          error: error.message,
          requestId: req.requestId,
          route: req.path
        });
      }
      return res.status(error.status || 500).json({ error: error.message || 'failed to start job' });
    }
  });

  router.post('/jobs/:jobId/finish', validateBody(validateFinishJobBody), async (req, res) => {
    try {
      const payload = await operationsService.finishJob(req.params.jobId, req.body || {});
      return res.json({ ok: true, ...payload });
    } catch (error) {
      if ((error.status || 500) >= 500) {
        logError('Failed to finish job', {
          error,
          requestId: req.requestId,
          route: req.path
        });
      } else {
        logWarn('Finish job rejected', {
          error: error.message,
          requestId: req.requestId,
          route: req.path
        });
      }
      return res.status(error.status || 500).json({ error: error.message || 'failed to finish job' });
    }
  });

  router.get('/inventory/balances', async (req, res) => {
    const rows = await operationsService.getInventoryBalances(req.query.limit);
    res.json(rows);
  });

  return router;
}

module.exports = {
  createOperationsRoutes
};
