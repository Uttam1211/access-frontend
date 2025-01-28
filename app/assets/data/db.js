const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// Create database connection
const db = new sqlite3.Database(path.join(__dirname, "suppliers.db"), (err) => {
  if (err) {
    console.error("Error connecting to database:", err);
  } else {
    console.log("Connected to SQLite database");
    // Initialize database schema
    const schema = require("fs").readFileSync(
      path.join(__dirname, "schema.sql"),
      "utf8"
    );
    db.exec(schema, (err) => {
      if (err) {
        console.error("Error initializing database schema:", err);
      } else {
        console.log("Database schema initialized");
      }
    });
  }
});

// Helper functions for database operations
const dbHelper = {
  // Store supplier data
  storeSupplier: (supplierData) => {
    return new Promise((resolve, reject) => {
      const {
        id,
        supplierInformationData: {
          form: { shareCode },
        },
      } = supplierData;

      db.run(
        `INSERT INTO suppliers (id, share_code, data) 
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
         data = excluded.data,
         status = 'pending'`,
        [id, shareCode, JSON.stringify(supplierData)],
        function (err) {
          if (err) {
            reject(err);
          } else {
            // Add audit log entry
            db.run(
              `INSERT INTO audit_log (action, user_name, details) 
               VALUES (?, ?, ?)`,
              [
                "SUPPLIER_ADDED",
                "system",
                `Added supplier ${supplierData.name} with share code ${shareCode}`,
              ]
            );
            resolve(this.lastID);
          }
        }
      );
    });
  },

  // Get pending suppliers
  getPendingSuppliers: () => {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT id, json_extract(data, '$.name') as name, 
         share_code, created_at as submissionDate
         FROM suppliers 
         WHERE status = 'pending' 
         ORDER BY created_at DESC`,
        [],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  },

  // Get supplier by ID
  getSupplier: (id) => {
    return new Promise((resolve, reject) => {
      db.get(`SELECT data FROM suppliers WHERE id = ?`, [id], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row ? JSON.parse(row.data) : null);
        }
      });
    });
  },

  // Update supplier status
  updateSupplierStatus: (id, decision, reviewedBy, rejectionReason = null) => {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE suppliers 
         SET status = ?, 
             reviewed_at = CURRENT_TIMESTAMP,
             reviewed_by = ?,
             review_decision = ?,
             rejection_reason = ?
         WHERE id = ?`,
        [
          decision === "approve" ? "approved" : "rejected",
          reviewedBy,
          decision,
          rejectionReason,
          id,
        ],
        function (err) {
          if (err) {
            reject(err);
          } else {
            // Add audit log entry
            db.run(
              `INSERT INTO audit_log (action, user_name, details) 
               VALUES (?, ?, ?)`,
              [
                decision === "approve"
                  ? "SUPPLIER_APPROVED"
                  : "SUPPLIER_REJECTED",
                reviewedBy,
                `${
                  decision === "approve" ? "Approved" : "Rejected"
                } supplier ${id}`,
              ]
            );
            resolve(this.changes);
          }
        }
      );
    });
  },

  // Get recent audit log entries
  getRecentAuditLog: (limit = 10) => {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM audit_log 
         ORDER BY created_at DESC 
         LIMIT ?`,
        [limit],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  },
};

module.exports = dbHelper;
