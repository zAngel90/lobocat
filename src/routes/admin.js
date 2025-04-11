const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Middleware de autenticación simple
const authenticateAdmin = async (req, res, next) => {
  const { username, password } = req.headers;
  
  if (!username || !password) {
    return res.status(401).json({ error: 'Credenciales requeridas' });
  }

  try {
    const [admins] = await pool.execute(
      'SELECT * FROM admins WHERE username = ? AND password = ?',
      [username, password]
    );

    if (admins.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    next();
  } catch (error) {
    console.error('Error de autenticación:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
};

// Login de administrador
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const [admins] = await pool.execute(
      'SELECT id, username FROM admins WHERE username = ? AND password = ?',
      [username, password]
    );

    if (admins.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    res.json({ success: true, admin: admins[0] });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Obtener todos los productos
router.get('/products', authenticateAdmin, async (req, res) => {
  try {
    const [products] = await pool.execute('SELECT * FROM products ORDER BY created_at DESC');
    res.json(products);
  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Crear nuevo producto
router.post('/products', authenticateAdmin, async (req, res) => {
  const { title, description, image_url, type, original_price, discount_price, discount_percentage } = req.body;

  try {
    const [result] = await pool.execute(
      'INSERT INTO products (title, description, image_url, type, original_price, discount_price, discount_percentage) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [title, description, image_url, type, original_price, discount_price, discount_percentage]
    );

    const product = {
      id: result.insertId,
      title,
      description,
      image_url,
      type,
      original_price,
      discount_price,
      discount_percentage
    };

    console.log('Producto creado:', product); // Para debugging
    res.json({ success: true, product });
  } catch (error) {
    console.error('Error al crear producto:', error);
    res.status(500).json({ error: 'Error en el servidor', details: error.message });
  }
});

// Actualizar producto
router.put('/products/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { original_price, discount_price, discount_percentage } = req.body;

  try {
    // Validar que los precios sean números
    if (isNaN(original_price) || isNaN(discount_price) || isNaN(discount_percentage)) {
      return res.status(400).json({ error: 'Los precios deben ser números válidos' });
    }

    const [result] = await pool.execute(
      'UPDATE products SET original_price = ?, discount_price = ?, discount_percentage = ? WHERE id = ?',
      [original_price, discount_price, discount_percentage, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const product = {
      id,
      original_price,
      discount_price,
      discount_percentage
    };

    console.log('Producto actualizado:', product); // Para debugging
    res.json({ success: true, product });
  } catch (error) {
    console.error('Error al actualizar producto:', error);
    res.status(500).json({ error: 'Error en el servidor', details: error.message });
  }
});

// Eliminar producto
router.delete('/products/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    await pool.execute('DELETE FROM products WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error al eliminar producto:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

module.exports = router; 