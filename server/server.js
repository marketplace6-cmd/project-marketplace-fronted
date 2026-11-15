/**
 * Uvikart Backend Server
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
  res.json({ status: 'healthy', service: 'Uvikart Authentication API', time: new Date().toISOString() });
});

// Mount authentication routes
app.use('/api/auth', authRoutes);

// Start server if executed directly
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[Uvikart API] Server is active and listening on http://localhost:${PORT}`);
  });
}

export default app;
