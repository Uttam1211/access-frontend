const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// Create database connection
const db = new sqlite3.Database(
  path.join(__dirname, "suppliers.db"),
  sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
  (err) => {
    if (err) {
      console.error("Error connecting to database:", err);
    } else {
      console.log("Connected to SQLite database");
      // Initialize database schema
      const schema = `
        CREATE TABLE IF NOT EXISTS suppliers (
          id TEXT PRIMARY KEY,
          share_code TEXT NOT NULL,
          data JSON NOT NULL,
          status TEXT DEFAULT 'pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          reviewed_at DATETIME,
          reviewed_by TEXT,
          review_decision TEXT,
          rejection_reason TEXT
        );

        CREATE TABLE IF NOT EXISTS audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          action TEXT NOT NULL,
          user_name TEXT NOT NULL,
          details TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          full_name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          authority TEXT NOT NULL,
          password TEXT NOT NULL,
          role TEXT DEFAULT 'local-authority',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_login DATETIME
        );
      `;

      db.exec(schema, (err) => {
        if (err) {
          console.error("Error initializing database schema:", err);
        } else {
          console.log("Database schema initialized");
        }
      });
    }
  }
);

// Helper functions for database operations
const dbHelper = {
  // Store supplier data
  storeSupplier: (supplierData, userName = "system") => {
    return new Promise((resolve, reject) => {
      try {
        const { id, supplierInformationData } = supplierData;
        const shareCode = supplierInformationData?.form?.shareCode || "UNKNOWN";

        db.run(
          `INSERT OR REPLACE INTO suppliers (id, share_code, data) 
           VALUES (?, ?, ?)`,
          [id, shareCode, JSON.stringify(supplierData)],
          function (err) {
            if (err) {
              reject(err);
            } else {
              // Add audit log entry with better formatting
              db.run(
                `INSERT INTO audit_log (action, user_name, details) 
                 VALUES (?, ?, ?)`,
                [
                  "SUPPLIER_ADDED",
                  userName,
                  JSON.stringify({
                    supplier_id: id,
                    share_code: shareCode,
                    company_name:
                      supplierData.identifier?.legalName || "Unknown Company",
                  }),
                ]
              );
              resolve(this.lastID);
            }
          }
        );
      } catch (error) {
        reject(error);
      }
    });
  },

  // Get pending suppliers
  getPendingSuppliers: () => {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT id, 
                json_extract(data, '$.name') as name,
                share_code,
                created_at as submissionDate
         FROM suppliers 
         WHERE status = 'pending' 
         ORDER BY created_at DESC`,
        [],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []); // Return empty array if no results
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

  // Update supplier status with better audit logging
  updateSupplierStatus: (id, decision, reviewedBy, rejectionReason = null) => {
    return new Promise((resolve, reject) => {
      // First get the supplier details
      db.get(`SELECT data FROM suppliers WHERE id = ?`, [id], (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        const supplierData = JSON.parse(row.data);
        const shareCode = supplierData.supplierInformationData?.form?.shareCode;
        const companyName = supplierData.identifier?.legalName;

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
              // Add audit log entry with better formatting
              db.run(
                `INSERT INTO audit_log (action, user_name, details) 
                   VALUES (?, ?, ?)`,
                [
                  decision === "approve"
                    ? "SUPPLIER_APPROVED"
                    : "SUPPLIER_REJECTED",
                  reviewedBy,
                  JSON.stringify({
                    supplier_id: id,
                    share_code: shareCode,
                    company_name: companyName,
                    reason: rejectionReason,
                  }),
                ]
              );
              resolve(this.changes);
            }
          }
        );
      });
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

  // Get all audit logs
  getAuditLogs: () => {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM audit_log ORDER BY created_at DESC`,
        [],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        }
      );
    });
  },

  // Get supplier-specific audit logs
  getSupplierAuditLogs: (supplierId) => {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM audit_log 
         WHERE json_extract(details, '$.supplier_id') = ?
         ORDER BY created_at DESC`,
        [supplierId],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        }
      );
    });
  },

  // Add audit log entry
  addAuditLog: (action, userName, details) => {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO audit_log (action, user_name, details)
         VALUES (?, ?, ?)`,
        [action, userName, JSON.stringify(details)],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.lastID);
          }
        }
      );
    });
  },

  getSystemStatus: () => {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT 
          (SELECT COUNT(*) FROM suppliers WHERE status = 'pending') as pendingCount,
          (SELECT created_at FROM suppliers ORDER BY created_at DESC LIMIT 1) as lastSync`,
        [],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve({
              pendingCount: row ? row.pendingCount : 0,
              lastSync:
                row && row.lastSync ? row.lastSync : new Date().toISOString(),
            });
          }
        }
      );
    });
  },

  // Create new user
  createUser: (userData) => {
    return new Promise(async (resolve, reject) => {
      const { fullName, email, authority, password } = userData;
      const bcrypt = require("bcrypt");
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      const userId = require("crypto").randomUUID();

      db.run(
        `INSERT INTO users (id, full_name, email, authority, password) 
         VALUES (?, ?, ?, ?, ?)`,
        [userId, fullName, email, authority, hashedPassword],
        function (err) {
          if (err) {
            reject(err);
          } else {
            // Add audit log for user creation
            db.run(
              `INSERT INTO audit_log (action, user_name, details) 
               VALUES (?, ?, ?)`,
              [
                "USER_CREATED",
                email,
                JSON.stringify({
                  user_id: userId,
                  authority: authority,
                }),
              ]
            );
            resolve(userId);
          }
        }
      );
    });
  },

  // Get user by email
  getUserByEmail: (email) => {
    return new Promise((resolve, reject) => {
      db.get("SELECT * FROM users WHERE email = ?", [email], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  },

  // Update last login
  updateLastLogin: (userId) => {
    return new Promise((resolve, reject) => {
      db.run(
        "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?",
        [userId],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.changes);
          }
        }
      );
    });
  },

  // Get suppliers by status with pagination
  getSuppliersByStatus: (status, limit, offset) => {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM suppliers 
         WHERE status = ? 
         ORDER BY reviewed_at DESC 
         LIMIT ? OFFSET ?`,
        [status, limit, offset],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(
              rows.map((row) => ({
                ...row,
                data: JSON.parse(row.data),
              }))
            );
          }
        }
      );
    });
  },

  // Get total count of suppliers by status
  getSupplierCountByStatus: (status) => {
    return new Promise((resolve, reject) => {
      db.get(
        "SELECT COUNT(*) as count FROM suppliers WHERE status = ?",
        [status],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row.count);
          }
        }
      );
    });
  },
};

module.exports = dbHelper;
