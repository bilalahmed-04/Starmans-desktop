import { getPool, sql } from '../mssqlDb.js';

function mapEntryRow(row) {
  return {
    articleId: row.ArticleId !== null ? String(row.ArticleId) : null,
    articleName: row.ArticleName,
    qty: row.Qty,
  };
}

function mapProductionRow(row, entries) {
  return {
    id: String(row.Id),
    date: row.Date.toISOString().slice(0, 10),
    entries,
  };
}

// { month: 'YYYY-MM' } or { start, end } ('YYYY-MM-DD') — real DATE
// comparisons, not the old string-regex match (EFFORT_ANALYSIS.md §1.2 item 4).
export async function findProductions({ month, start, end } = {}) {
  const pool = getPool();
  const request = pool.request();
  let query = 'SELECT Id, Date FROM dbo.Productions WHERE 1=1';
  if (month) {
    const monthStart = `${month}-01`;
    request.input('monthStart', sql.Date, monthStart);
    query += ' AND Date >= @monthStart AND Date < DATEADD(MONTH, 1, @monthStart)';
  } else if (start && end) {
    request.input('start', sql.Date, start);
    request.input('end', sql.Date, end);
    query += ' AND Date >= @start AND Date <= @end';
  }
  query += ' ORDER BY Date, Id';
  const productionsResult = await request.query(query);
  const productionIds = productionsResult.recordset.map(r => r.Id);

  const entriesByProduction = new Map();
  if (productionIds.length > 0) {
    const entriesResult = await pool.request().query(
      'SELECT ProductionId, ArticleId, ArticleName, Qty FROM dbo.ProductionEntries ORDER BY ProductionId, Id'
    );
    for (const row of entriesResult.recordset) {
      if (!entriesByProduction.has(row.ProductionId)) entriesByProduction.set(row.ProductionId, []);
      entriesByProduction.get(row.ProductionId).push(mapEntryRow(row));
    }
  }

  return productionsResult.recordset.map(row => mapProductionRow(row, entriesByProduction.get(row.Id) || []));
}

export class ArticleNotFoundError extends Error {
  constructor(articleId) {
    super(`Article ${articleId} not found`);
    this.code = 'article_not_found';
    this.articleId = articleId;
  }
}

// Per-entry stock increment + parent/child insert, all in one transaction —
// if any entry's article is missing, every increment made so far in this
// call is rolled back (the old Mongo version had no such rollback: a mid-loop
// failure left earlier entries' stock already incremented with no production
// record created for them — fixed here as part of the transaction wrap).
export async function createProductionWithEntries({ date, entries }) {
  const pool = getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const resolvedEntries = [];
    for (const entry of entries) {
      const articleId = Number(entry.articleId);
      const articleResult = await new sql.Request(transaction)
        .input('articleId', sql.Int, articleId)
        .query('SELECT Id, Name FROM dbo.Articles WITH (UPDLOCK, ROWLOCK) WHERE Id = @articleId');
      const article = articleResult.recordset[0];
      if (!article) throw new ArticleNotFoundError(entry.articleId);

      await new sql.Request(transaction)
        .input('articleId', sql.Int, articleId)
        .input('qty', sql.Int, Number(entry.qty))
        .query('UPDATE dbo.Articles SET Stock = Stock + @qty WHERE Id = @articleId');

      resolvedEntries.push({ articleId, articleName: article.Name, qty: Number(entry.qty) });
    }

    const productionResult = await new sql.Request(transaction)
      .input('date', sql.Date, date)
      .query('INSERT INTO dbo.Productions (Date) OUTPUT INSERTED.Id, INSERTED.Date VALUES (@date)');
    const productionRow = productionResult.recordset[0];

    for (const entry of resolvedEntries) {
      await new sql.Request(transaction)
        .input('productionId', sql.Int, productionRow.Id)
        .input('articleId', sql.Int, entry.articleId)
        .input('articleName', sql.NVarChar(255), entry.articleName)
        .input('qty', sql.Int, entry.qty)
        .query('INSERT INTO dbo.ProductionEntries (ProductionId, ArticleId, ArticleName, Qty) VALUES (@productionId, @articleId, @articleName, @qty)');
    }

    await transaction.commit();
    return mapProductionRow(productionRow, resolvedEntries.map(e => ({
      articleId: String(e.articleId), articleName: e.articleName, qty: e.qty,
    })));
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}
