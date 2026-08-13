import { getPool, sql } from '../mssqlDb.js';

function mapRow(row) {
  return {
    id: String(row.Id),
    name: row.Name,
    price: Number(row.Price),
    stock: row.Stock,
    color: row.Color,
    size: row.Size,
  };
}

export async function findArticles({ color, maxStock } = {}) {
  const request = getPool().request();
  let query = 'SELECT Id, Name, Price, Stock, Color, Size FROM dbo.Articles WHERE 1=1';
  if (color) {
    query += ' AND Color = @color';
    request.input('color', sql.NVarChar(100), color);
  }
  if (maxStock !== undefined) {
    query += ' AND Stock <= @maxStock';
    request.input('maxStock', sql.Int, maxStock);
  }
  query += ' ORDER BY Id';
  const result = await request.query(query);
  return result.recordset.map(mapRow);
}

export async function createArticle({ name, price, stock, color, size }) {
  const result = await getPool().request()
    .input('name', sql.NVarChar(255), name)
    .input('price', sql.Decimal(10, 2), price)
    .input('stock', sql.Int, stock)
    .input('color', sql.NVarChar(100), color)
    .input('size', sql.NVarChar(50), size)
    .query(`INSERT INTO dbo.Articles (Name, Price, Stock, Color, Size)
            OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.Price, INSERTED.Stock, INSERTED.Color, INSERTED.Size
            VALUES (@name, @price, @stock, @color, @size)`);
  return mapRow(result.recordset[0]);
}

// Deletes the article and any production entries that reference it, dropping
// productions that become empty as a result — mirrors the old Mongo behavior.
// Done as application logic (not FK CASCADE) per 001_initial_schema.sql comments.
export async function deleteArticleCascade(id) {
  const pool = getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const articleResult = await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .query('SELECT Id FROM dbo.Articles WHERE Id = @id');
    if (!articleResult.recordset[0]) {
      await transaction.rollback();
      return false;
    }

    const affectedResult = await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .query('SELECT DISTINCT ProductionId FROM dbo.ProductionEntries WHERE ArticleId = @id');
    const affectedProductionIds = affectedResult.recordset.map(r => r.ProductionId);

    await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .query('DELETE FROM dbo.ProductionEntries WHERE ArticleId = @id');

    for (const productionId of affectedProductionIds) {
      const remaining = await new sql.Request(transaction)
        .input('productionId', sql.Int, productionId)
        .query('SELECT COUNT(*) AS cnt FROM dbo.ProductionEntries WHERE ProductionId = @productionId');
      if (remaining.recordset[0].cnt === 0) {
        await new sql.Request(transaction)
          .input('productionId', sql.Int, productionId)
          .query('DELETE FROM dbo.Productions WHERE Id = @productionId');
      }
    }

    await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .query('DELETE FROM dbo.Articles WHERE Id = @id');

    await transaction.commit();
    return true;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}
