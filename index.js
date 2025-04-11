const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const pool = require('./src/config/db');
const adminRoutes = require('./src/routes/admin');

const app = express();

// CORS configuration
app.use(cors({
  origin: ['http://localhost:5173', 'https://lobomatshop.com'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization', 'username', 'password'],
  preflightContinue: false,
  optionsSuccessStatus: 200
}));

app.use(express.json());

// API Configuration
const BOLD_API_URL = 'https://integrations.api.bold.co';
const BOLD_API_KEY = 'vURGPfDvUzY92kzQYbm-rssxGSM8D2-IvXEN2KEP3zE';

// Rutas del panel admin
app.use('/admin', adminRoutes);

// Ruta de prueba para verificar la conexión a la base de datos
app.get('/test-connection', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    res.json({ message: 'Conexión exitosa a la base de datos' });
  } catch (error) {
    console.error('Error al conectar con la base de datos:', error);
    res.status(500).json({ error: 'Error al conectar con la base de datos' });
  }
});

// Endpoint para crear el pago con Bold
app.post('/api/payment/create', async (req, res) => {
  console.log('Creando pago con datos:', req.body);
  
  try {
    const paymentData = req.body;
    
    // Validar datos requeridos
    if (!paymentData.metadata?.username || !paymentData.metadata?.offerId || !paymentData.metadata?.price) {
      return res.status(400).json({ error: 'Metadata incompleta' });
    }

    const response = await fetch(`${BOLD_API_URL}/online/link/v1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `x-api-key ${BOLD_API_KEY}`
      },
      body: JSON.stringify({
        amount_type: "CLOSE",
        amount: {
          currency: "COP",
          total_amount: paymentData.metadata.price,
          tip_amount: 0
        },
        description: paymentData.description,
        metadata: { reference: 'LNK_' + Math.random().toString(36).substr(2, 9).toUpperCase() },
        callback_url: 'https://lobomatshop.com/success'
      })
    });

    if (!response.ok) {
      console.error('Error creando pago en Bold:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('Detalles del error:', errorText);
      return res.status(response.status).json({ error: 'Error creando pago', errors: JSON.parse(errorText).errors });
    }

    const boldResponse = await response.json();
    console.log('Respuesta de Bold:', boldResponse);

    // Guardar la información del pago en la base de datos
    const connection = await pool.getConnection();
    try {
      await connection.execute(
        'INSERT INTO pagos (payment_link, username, offer_id, price, status) VALUES (?, ?, ?, ?, ?)',
        [boldResponse.payload.payment_link, paymentData.metadata.username, paymentData.metadata.offerId, paymentData.metadata.price, 'pending']
      );
    } finally {
      connection.release();
    }

    // Formatear la respuesta
    res.json({
      success: true,
      payload: {
        url: boldResponse.payload.url,
        payment_link: boldResponse.payload.payment_link
      }
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Endpoint público para obtener productos
app.get('/products', async (req, res) => {
  try {
    const [products] = await pool.execute(
      'SELECT id, title, description, image_url, type, original_price, discount_price, discount_percentage FROM products ORDER BY created_at DESC'
    );
    res.json(products);
  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
  console.log('Endpoints disponibles:');
  console.log('- GET  /test-connection');
  console.log('- POST /api/payment/create');
  console.log('- POST /admin/login');
  console.log('- GET  /admin/products');
  console.log('- POST /admin/products');
  console.log('- PUT  /admin/products/:id');
  console.log('- DELETE /admin/products/:id');
}); 