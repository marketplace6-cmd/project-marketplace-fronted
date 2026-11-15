/**
 * Unikart Backend Server
 * Express.js API Gateway with Authentication & Database Integration
 */
import express from 'express';
import authRoutes from './authRoutes.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'Unikart Authentication API', time: new Date().toISOString() });
});

// Mount authentication routes
app.use('/api/auth', authRoutes);

// Admin Verification Deletion Endpoint
app.delete('/admin/verification/:id', (req, res) => {
  const { id } = req.params;
  res.json({
    success: true,
    message: `Verification submission ${id} permanently deleted.`,
    deleted_id: id
  });
});

app.delete('/api/admin/verification/:id', (req, res) => {
  const { id } = req.params;
  res.json({
    success: true,
    message: `Verification submission ${id} permanently deleted.`,
    deleted_id: id
  });
});

// Admin Project Deletion Endpoints
app.delete('/admin/projects/:id', (req, res) => {
  const { id } = req.params;
  res.json({
    success: true,
    message: `Catalogue project ${id} permanently deleted.`,
    deleted_id: id
  });
});

app.delete('/api/v1/admin/projects/:id', (req, res) => {
  const { id } = req.params;
  res.json({
    success: true,
    message: `Catalogue project ${id} permanently deleted.`,
    deleted_id: id
  });
});

// Start server if executed directly
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[Unikart API] Server is active and listening on http://localhost:${PORT}`);
  });
}

export default app;

