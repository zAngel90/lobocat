const pool = require('../src/config/db');

const searchProducts = async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere un término de búsqueda'
      });
    }

    const searchTerm = `%${q}%`;
    const [rows] = await pool.query(
      `SELECT * FROM products 
       WHERE title LIKE ? OR description LIKE ?`,
      [searchTerm, searchTerm]
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