const express          = require('express');
const path             = require('path');
const expensesRouter   = require('./routes/expenses');
const categoriesRouter = require('./routes/categories');
const analyticsRouter  = require('./routes/analytics');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', expensesRouter);
app.use('/api', categoriesRouter);
app.use('/api/analytics', analyticsRouter);

app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Expense Tracker running at http://localhost:${PORT}`);
});
