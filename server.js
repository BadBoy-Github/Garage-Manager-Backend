const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

require('dotenv').config();
const app = express();

// CORS Configuration
const corsOptions = {
    origin: process.env.ALLOWED_ORIGIN || ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/garage-db')
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// --- Schemas & Models ---
const CustomerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, default: '', unique: true, sparse: true },
    phone: { type: String, default: '', unique: true, sparse: true },
    address: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

const RepairSchema = new mongoose.Schema({
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    customerName: { type: String, required: true },
    vehicle: { type: String, required: true },
    status: { type: String, enum: ['Pending', 'In Progress', 'Finished'], default: 'Pending' },
    priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
    description: { type: String, default: '' },
    cost: { type: Number, default: 0 },
    date: { type: Date, default: Date.now }
});

const Customer = mongoose.model('Customer', CustomerSchema);
const Repair = mongoose.model('Repair', RepairSchema);

// --- API Routes ---

// Get Stats
app.get('/api/stats', async (req, res) => {
    try {
        const total = await Repair.countDocuments();
        const active = await Repair.countDocuments({ status: 'In Progress' });
        const pending = await Repair.countDocuments({ status: 'Pending' });
        const finished = await Repair.countDocuments({ status: 'Finished' });

        // Calculate revenue from finished repairs
        const finishedRepairs = await Repair.find({ status: 'Finished' });
        const revenue = finishedRepairs.reduce((sum, r) => sum + (r.cost || 0), 0);

        res.json({
            total,
            active,
            pending,
            finished,
            revenue: `$${revenue.toLocaleString()}`
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ CUSTOMERS CRUD ============

// Get all customers
app.get('/api/customers', async (req, res) => {
    try {
        const customers = await Customer.find().sort({ createdAt: -1 });
        res.json(customers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single customer
app.get('/api/customers/:id', async (req, res) => {
    try {
        const customer = await Customer.findById(req.params.id);
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        res.json(customer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create customer
app.post('/api/customers', async (req, res) => {
    try {
        const { email, phone } = req.body;

        // Check for unique email
        if (email && email.trim()) {
            const existingEmail = await Customer.findOne({ email: email.trim() });
            if (existingEmail) {
                return res.status(400).json({ error: 'Email already exists' });
            }
        }

        // Check for unique phone
        if (phone && phone.trim()) {
            const existingPhone = await Customer.findOne({ phone: phone.trim() });
            if (existingPhone) {
                return res.status(400).json({ error: 'Phone number already exists' });
            }
        }

        const customer = new Customer(req.body);
        await customer.save();
        res.status(201).json(customer);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Update customer
app.put('/api/customers/:id', async (req, res) => {
    try {
        const { email, phone } = req.body;

        // Check for unique email (excluding current customer)
        if (email && email.trim()) {
            const existingEmail = await Customer.findOne({
                email: email.trim(),
                _id: { $ne: req.params.id }
            });
            if (existingEmail) {
                return res.status(400).json({ error: 'Email already exists' });
            }
        }

        // Check for unique phone (excluding current customer)
        if (phone && phone.trim()) {
            const existingPhone = await Customer.findOne({
                phone: phone.trim(),
                _id: { $ne: req.params.id }
            });
            if (existingPhone) {
                return res.status(400).json({ error: 'Phone number already exists' });
            }
        }

        const customer = await Customer.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        res.json(customer);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Delete customer
app.delete('/api/customers/:id', async (req, res) => {
    try {
        const customer = await Customer.findByIdAndDelete(req.params.id);
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        // Also delete related repairs
        await Repair.deleteMany({ customerId: req.params.id });
        res.json({ message: 'Customer deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ REPAIRS CRUD ============

// Get all repairs
app.get('/api/repairs', async (req, res) => {
    try {
        const repairs = await Repair.find().populate('customerId').sort({ date: -1 });
        res.json(repairs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single repair
app.get('/api/repairs/:id', async (req, res) => {
    try {
        const repair = await Repair.findById(req.params.id).populate('customerId');
        if (!repair) {
            return res.status(404).json({ error: 'Repair not found' });
        }
        res.json(repair);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create repair
app.post('/api/repairs', async (req, res) => {
    try {
        const repair = new Repair(req.body);
        await repair.save();
        res.status(201).json(repair);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Update repair
app.put('/api/repairs/:id', async (req, res) => {
    try {
        const repair = await Repair.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
        if (!repair) {
            return res.status(404).json({ error: 'Repair not found' });
        }
        res.json(repair);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Update repair status only
app.patch('/api/repairs/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const repair = await Repair.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true }
        );
        if (!repair) {
            return res.status(404).json({ error: 'Repair not found' });
        }
        res.json(repair);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Delete repair
app.delete('/api/repairs/:id', async (req, res) => {
    try {
        const repair = await Repair.findByIdAndDelete(req.params.id);
        if (!repair) {
            return res.status(404).json({ error: 'Repair not found' });
        }
        res.json({ message: 'Repair deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ SEARCH ============

// Search repairs
app.get('/api/search/repairs', async (req, res) => {
    try {
        const { q } = req.query;
        const costQuery = !isNaN(q) ? parseFloat(q) : null;

        const searchConditions = [
            { customerName: { $regex: q, $options: 'i' } },
            { vehicle: { $regex: q, $options: 'i' } },
            { description: { $regex: q, $options: 'i' } },
            { status: { $regex: q, $options: 'i' } },
            { priority: { $regex: q, $options: 'i' } }
        ];

        // Add cost search if q is a number
        if (costQuery !== null) {
            searchConditions.push({ cost: costQuery });
        }

        const repairs = await Repair.find({
            $or: searchConditions
        }).populate('customerId');
        res.json(repairs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Search customers
app.get('/api/search/customers', async (req, res) => {
    try {
        const { q } = req.query;
        const customers = await Customer.find({
            $or: [
                { name: { $regex: q, $options: 'i' } },
                { email: { $regex: q, $options: 'i' } },
                { phone: { $regex: q, $options: 'i' } }
            ]
        });
        res.json(customers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============ AUTHENTICATION ============

// Admin login
app.post('/api/auth/login', (req, res) => {
    try {
        const { email, password } = req.body;

        if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
            res.json({
                success: true,
                admin: {
                    email: process.env.ADMIN_EMAIL,
                    name: process.env.ADMIN_NAME
                }
            });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get admin info
app.get('/api/auth/admin', (req, res) => {
    try {
        res.json({
            email: process.env.ADMIN_EMAIL,
            name: process.env.ADMIN_NAME
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update admin name
app.put('/api/auth/admin/name', (req, res) => {
    try {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }
        // Note: In production, you'd write this to a file or database
        // For now, we'll just return success (the name change won't persist across restarts)
        res.json({ success: true, name });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
