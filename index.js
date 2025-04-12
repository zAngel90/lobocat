const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const pool = require('./src/config/db');
const adminRoutes = require('./src/routes/admin');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const axios = require('axios');
require('dotenv').config();

const app = express();

// Middleware de autenticación para admin
const authenticateAdmin = (req, res, next) => {
  const username = req.headers.username;
  const password = req.headers.password;

  if (!username || !password) {
    return res.status(401).json({ 
      success: false, 
      message: 'Credenciales no proporcionadas' 
    });
  }

  // Verificar las credenciales (usando las mismas que usas para el login)
  if (username === 'admin' && password === 'admin123') {
    next();
  } else {
    res.status(401).json({ 
      success: false, 
      message: 'Credenciales inválidas' 
    });
  }
};

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

// Endpoint para obtener un producto por ID
app.get('/products/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM products WHERE id = ?',
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Producto no encontrado'
      });
    }

    res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error('Error al obtener el producto:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el producto'
    });
  }
});

// Endpoint para crear pedido con información de Minecraft
app.post('/api/orders', async (req, res) => {
  const { product_id, quantity, total, product_type, minecraft_info } = req.body;
  
  try {
    const connection = await pool.getConnection();
    
    // Iniciar transacción
    await connection.beginTransaction();
    
    try {
      // Insertar pedido
      const [orderResult] = await connection.execute(
        'INSERT INTO orders (product_id, quantity, total, product_type) VALUES (?, ?, ?, ?)',
        [product_id, quantity, total, product_type]
      );
      
      const orderId = orderResult.insertId;
      
      // Si es un pedido de Minecraft, insertar la información adicional
      if (product_type === 'minecraft' && minecraft_info) {
        await connection.execute(
          'INSERT INTO minecraft_info (order_id, xbox_email, xbox_password, contact_info) VALUES (?, ?, ?, ?)',
          [orderId, minecraft_info.xbox_email, minecraft_info.xbox_password, minecraft_info.contact_info]
        );
      }
      
      await connection.commit();
      
      res.status(201).json({
        success: true,
        message: 'Pedido creado exitosamente',
        order_id: orderId
      });
      
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    
  } catch (error) {
    console.error('Error al crear pedido:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear el pedido'
    });
  }
});

// Endpoint para obtener información de Minecraft de un pedido
app.get('/api/orders/:orderId/minecraft-info', async (req, res) => {
  const { orderId } = req.params;
  
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM minecraft_info WHERE order_id = ?',
      [orderId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontró información de Minecraft para este pedido'
      });
    }
    
    res.json({
      success: true,
      data: rows[0]
    });
    
  } catch (error) {
    console.error('Error al obtener información de Minecraft:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener la información'
    });
  }
});

// Endpoint para obtener todos los pedidos con su información de Minecraft
app.get('/api/orders', async (req, res) => {
  try {
    const [orders] = await pool.execute(`
      SELECT o.*, mi.xbox_email, mi.xbox_password, mi.contact_info, p.title as product_title
      FROM orders o
      LEFT JOIN minecraft_info mi ON o.id = mi.order_id
      LEFT JOIN products p ON o.product_id = p.id
      ORDER BY o.created_at DESC
    `);
    
    res.json({
      success: true,
      data: orders
    });
    
  } catch (error) {
    console.error('Error al obtener pedidos:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener los pedidos'
    });
  }
});

// Endpoint para actualizar el estado de una orden
app.put('/api/orders/:orderId/status', authenticateAdmin, async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;

  if (!['pending', 'completed', 'cancelled'].includes(status)) {
    return res.status(400).json({ 
      success: false, 
      message: 'Estado no válido. Debe ser: pending, completed o cancelled' 
    });
  }

  try {
    const [result] = await pool.query(
      'UPDATE orders SET status = ? WHERE id = ?',
      [status, orderId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Orden no encontrada' 
      });
    }

    res.json({ 
      success: true, 
      message: 'Estado actualizado correctamente',
      data: { id: orderId, status } 
    });
  } catch (error) {
    console.error('Error al actualizar el estado de la orden:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al actualizar el estado de la orden' 
    });
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