const pool = require('../src/config/db');

const searchProducts = async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({ message: 'Se requiere un término de búsqueda' });
    }

    const searchTerm = `%${query}%`;
    const [results] = await pool.query(
      `SELECT * FROM products WHERE title LIKE ? OR description LIKE ?`,
      [searchTerm, searchTerm]
    );

    res.json(results);
  } catch (error) {
    console.error('Error en la búsqueda:', error);
    res.status(500).json({ message: 'Error al buscar productos' });
  }
};

module.exports = {
  searchProducts
}; 