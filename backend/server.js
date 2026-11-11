require('dotenv').config({
  path: require('path').join(__dirname, '../.env')
});

const express = require('express');
const path = require('path');
const authRoutes = require('./routes/auth');
const customersRoutes = require('./routes/customers');
const employeesRoutes = require('./routes/employees');
const appointmentsRoutes = require('./routes/appointments');
const salesRoutes = require('./routes/sales');
const reportsRoutes = require('./routes/reports');
const dashboardRoutes = require('./routes/dashboard');
const servicesRoutes = require('./routes/services');

const app = express();

app.disable('x-powered-by');

app.use(express.json({
  limit: '10kb'
}));

app.use('/api/auth', authRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/employees', employeesRoutes);
app.use('/api/appointments', appointmentsRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/services', servicesRoutes);

app.use(express.static(
  path.join(__dirname, '../frontend')
));

app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    message: 'BarberPro API is running',
    version: '1.0.0'
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`BarberPro server running on port ${PORT}`);
});
