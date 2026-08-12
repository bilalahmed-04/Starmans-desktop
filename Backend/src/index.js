import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDB } from './db.js';

import authRouter        from './routes/auth.js';
import articlesRouter    from './routes/articles.js';
import clientsRouter     from './routes/clients.js';
import slipsRouter       from './routes/slips.js';
import productionsRouter from './routes/productions.js';
import expensesRouter    from './routes/expenses.js';
import billsRouter       from './routes/bills.js';
import chemicalsRouter   from './routes/chemicals.js';
import paymentsRouter    from './routes/payments.js';
import profitRouter      from './routes/profit.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/auth',        authRouter);
app.use('/articles',    articlesRouter);
app.use('/clients',     clientsRouter);
app.use('/slips',       slipsRouter);
app.use('/productions', productionsRouter);
app.use('/expenses',    expensesRouter);
app.use('/bills',       billsRouter);
app.use('/chemicals',   chemicalsRouter);
app.use('/payments',    paymentsRouter);
app.use('/profit',      profitRouter);

app.get('/health', (_, res) => res.json({ status: 'ok' }));

app.use((req, res) => res.status(404).json({ error: `Route ${req.method} ${req.path} not found` }));

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => app.listen(PORT, () => console.log(`Starmans API running on http://localhost:${PORT}`)))
  .catch(err => { console.error('DB connection failed:', err.message); process.exit(1); });
