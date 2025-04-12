const pool = require('../config/database');

const searchProducts = async (req, res) => {
  const { q } = req.query;
  
  if (!q) {
    return res.status(400).json({
      success: false,
      message: 'Por favor proporciona un término de búsqueda'
    });
  }

  try {
    const [rows] = await pool.query(
      `SELECT * FROM products 
       WHERE title LIKE ? OR description LIKE ?`,
      [`%${q}%`, `%${q}%`]
    );

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Error en la búsqueda:', error);
    res.status(500).json({
      success: false,
      message: 'Error al buscar productos'
    });
  }
};

module.exports = {
  searchProducts
}; 