-- 001_initial_schema.sql
-- Creates the Starmans MSSQL schema (14 tables, per ANALYSIS.md / EFFORT_ANALYSIS.md §1).
-- Safe to re-run: every CREATE is guarded so this won't error on an already-provisioned database.
--
-- Run with:
--   sqlcmd -C -S <server> -U <user> -P <password> -i 001_initial_schema.sql
--
-- See DECISIONS.md ("MSSQL data-access approach") for why INT IDENTITY ids and
-- hand-written migrations were chosen over an ORM.

IF DB_ID('starmans') IS NULL
BEGIN
    CREATE DATABASE starmans;
END
GO

USE starmans;
GO

-- ─── Settings (singleton — app enforces single-row convention, see EFFORT_ANALYSIS.md §1.1) ───
IF OBJECT_ID('dbo.Settings', 'U') IS NULL
CREATE TABLE dbo.Settings (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    Username     NVARCHAR(100)  NOT NULL,
    PasswordHash NVARCHAR(255)  NOT NULL
);
GO

-- ─── Articles ───
-- UNIQUE on Name: slips.js looks up articles by name for stock deduction (an
-- existing data-integrity gap, never enforced under Mongo — fixed here, see
-- EFFORT_ANALYSIS.md §1.2 item 6).
IF OBJECT_ID('dbo.Articles', 'U') IS NULL
CREATE TABLE dbo.Articles (
    Id    INT IDENTITY(1,1) PRIMARY KEY,
    Name  NVARCHAR(255)  NOT NULL,
    Price DECIMAL(10,2)  NOT NULL DEFAULT 0,
    Stock INT            NOT NULL DEFAULT 0,
    Color NVARCHAR(100)  NOT NULL DEFAULT '',
    Size  NVARCHAR(50)   NOT NULL DEFAULT '',
    CONSTRAINT UQ_Articles_Name UNIQUE (Name)
);
GO

-- ─── Clients ───
IF OBJECT_ID('dbo.Clients', 'U') IS NULL
CREATE TABLE dbo.Clients (
    Id    INT IDENTITY(1,1) PRIMARY KEY,
    Name  NVARCHAR(255) NOT NULL,
    Phone NVARCHAR(50)  NOT NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Clients_Phone')
    CREATE INDEX IX_Clients_Phone ON dbo.Clients(Phone);
GO

-- ─── Slips (parent) ───
IF OBJECT_ID('dbo.Slips', 'U') IS NULL
CREATE TABLE dbo.Slips (
    Id       INT IDENTITY(1,1) PRIMARY KEY,
    No       NVARCHAR(50)   NOT NULL,
    ClientId INT            NOT NULL,
    Date     DATE           NOT NULL,
    Time     NVARCHAR(20)   NOT NULL,
    Total    DECIMAL(12,2)  NOT NULL,
    CONSTRAINT FK_Slips_Clients FOREIGN KEY (ClientId) REFERENCES dbo.Clients(Id)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Slips_Date')
    CREATE INDEX IX_Slips_Date ON dbo.Slips(Date);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Slips_ClientId')
    CREATE INDEX IX_Slips_ClientId ON dbo.Slips(ClientId);
GO

-- ─── SlipItems (child — was Slip.items[] embedded array in Mongo) ───
IF OBJECT_ID('dbo.SlipItems', 'U') IS NULL
CREATE TABLE dbo.SlipItems (
    Id             INT IDENTITY(1,1) PRIMARY KEY,
    SlipId         INT             NOT NULL,
    Name           NVARCHAR(255)   NOT NULL,
    Qty            INT             NOT NULL,
    Price          DECIMAL(10,2)   NOT NULL,
    Subtotal       DECIMAL(12,2)   NOT NULL,
    DiscountType   NVARCHAR(5)     NULL,
    DiscountAmount DECIMAL(10,2)   NOT NULL DEFAULT 0,
    DiscountPct    DECIMAL(5,2)    NOT NULL DEFAULT 0,
    Amount         DECIMAL(12,2)   NOT NULL,
    Description    NVARCHAR(500)   NOT NULL DEFAULT '',
    Size           NVARCHAR(50)    NOT NULL DEFAULT '',
    Color          NVARCHAR(100)   NOT NULL DEFAULT '',
    CONSTRAINT FK_SlipItems_Slips FOREIGN KEY (SlipId) REFERENCES dbo.Slips(Id) ON DELETE CASCADE,
    CONSTRAINT CK_SlipItems_DiscountType CHECK (DiscountType IN ('%', 'Rs') OR DiscountType IS NULL)
);
GO

-- ─── Productions (parent) ───
IF OBJECT_ID('dbo.Productions', 'U') IS NULL
CREATE TABLE dbo.Productions (
    Id   INT IDENTITY(1,1) PRIMARY KEY,
    Date DATE NOT NULL
);
GO

-- ─── ProductionEntries (child — was Production.entries[] embedded array) ───
-- ArticleId is ON DELETE SET NULL, not CASCADE: deleting an article must NOT
-- silently delete production history. ArticleName is a point-in-time snapshot,
-- same as the Mongo version. The "delete the whole production if it becomes
-- empty" rule from articles.js stays application logic, not a DB constraint
-- (see EFFORT_ANALYSIS.md §1.2 item 9) — that's part of the articles.js
-- migration task, not this schema.
IF OBJECT_ID('dbo.ProductionEntries', 'U') IS NULL
CREATE TABLE dbo.ProductionEntries (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    ProductionId INT           NOT NULL,
    ArticleId    INT           NULL,
    ArticleName  NVARCHAR(255) NOT NULL,
    Qty          INT           NOT NULL,
    CONSTRAINT FK_ProductionEntries_Productions FOREIGN KEY (ProductionId) REFERENCES dbo.Productions(Id) ON DELETE CASCADE,
    CONSTRAINT FK_ProductionEntries_Articles FOREIGN KEY (ArticleId) REFERENCES dbo.Articles(Id) ON DELETE SET NULL
);
GO

-- ─── Expenses (parent) ───
IF OBJECT_ID('dbo.Expenses', 'U') IS NULL
CREATE TABLE dbo.Expenses (
    Id   INT IDENTITY(1,1) PRIMARY KEY,
    Date DATE          NOT NULL,
    Time NVARCHAR(20)  NOT NULL
);
GO

-- ─── ExpenseRows (child — was Expense.rows[] embedded array) ───
IF OBJECT_ID('dbo.ExpenseRows', 'U') IS NULL
CREATE TABLE dbo.ExpenseRows (
    Id          INT IDENTITY(1,1) PRIMARY KEY,
    ExpenseId   INT           NOT NULL,
    Description NVARCHAR(500) NOT NULL,
    Price       DECIMAL(10,2) NOT NULL,
    CONSTRAINT FK_ExpenseRows_Expenses FOREIGN KEY (ExpenseId) REFERENCES dbo.Expenses(Id) ON DELETE CASCADE
);
GO

-- ─── Bills (parent) ───
IF OBJECT_ID('dbo.Bills', 'U') IS NULL
CREATE TABLE dbo.Bills (
    Id    INT IDENTITY(1,1) PRIMARY KEY,
    Date  DATE          NOT NULL,
    Month NVARCHAR(50)  NOT NULL
);
GO

-- ─── BillEntries (child — was Bill.entries[] embedded array) ───
IF OBJECT_ID('dbo.BillEntries', 'U') IS NULL
CREATE TABLE dbo.BillEntries (
    Id     INT IDENTITY(1,1) PRIMARY KEY,
    BillId INT           NOT NULL,
    Name   NVARCHAR(255) NOT NULL,
    Amount DECIMAL(10,2) NOT NULL,
    CONSTRAINT FK_BillEntries_Bills FOREIGN KEY (BillId) REFERENCES dbo.Bills(Id) ON DELETE CASCADE
);
GO

-- ─── ChemPurchases ───
IF OBJECT_ID('dbo.ChemPurchases', 'U') IS NULL
CREATE TABLE dbo.ChemPurchases (
    Id   INT IDENTITY(1,1) PRIMARY KEY,
    Date DATE          NOT NULL,
    Qty  DECIMAL(10,2) NOT NULL,
    Cost DECIMAL(10,2) NOT NULL
);
GO

-- ─── ChemUsages ───
IF OBJECT_ID('dbo.ChemUsages', 'U') IS NULL
CREATE TABLE dbo.ChemUsages (
    Id   INT IDENTITY(1,1) PRIMARY KEY,
    Date DATE          NOT NULL,
    Qty  DECIMAL(10,2) NOT NULL
);
GO

-- ─── Payments ───
-- ClientName/ClientPhone are a deliberate denormalized snapshot (matches the
-- Mongo model) — do NOT normalize these away, historical payments must show
-- the client's details as they were at the time, not live-joined current data.
-- See ANALYSIS.md §7 / EFFORT_ANALYSIS.md §1.1.
IF OBJECT_ID('dbo.Payments', 'U') IS NULL
CREATE TABLE dbo.Payments (
    Id             INT IDENTITY(1,1) PRIMARY KEY,
    ClientId       INT            NOT NULL,
    Date           DATE           NOT NULL,
    Time           NVARCHAR(20)   NOT NULL,
    ClientName     NVARCHAR(255)  NOT NULL,
    ClientPhone    NVARCHAR(50)   NOT NULL,
    Method         NVARCHAR(20)   NOT NULL,
    Amount         DECIMAL(12,2)  NOT NULL,
    Description    NVARCHAR(500)  NOT NULL DEFAULT '',
    CollectionDate DATE           NULL,
    ChequeDate     DATE           NULL,
    CONSTRAINT FK_Payments_Clients FOREIGN KEY (ClientId) REFERENCES dbo.Clients(Id),
    CONSTRAINT CK_Payments_Method CHECK (Method IN ('Cash', 'Cheque', 'Online', 'Slip'))
);
GO
