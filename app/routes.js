//
// For guidance on how to create routes see:
// https://prototype-kit.service.gov.uk/docs/create-routes
//

const govukPrototypeKit = require("govuk-prototype-kit");
const router = govukPrototypeKit.requests.setupRouter();
const db = require("./assets/data/db");
const fs = require("fs").promises;
const path = require("path");
const fetch = require("node-fetch");
require("dotenv").config();
const bcrypt = require("bcrypt");

// Add filters to the prototype kit
const filters = require("./filters.js")(govukPrototypeKit.views);

// Move API configuration to environment variables
const API_URL =
  process.env.CDP_API_URL ||
  "https://data-sharing.dev.supplier.information.findatender.codatt.net";
const API_KEY = process.env.CDP_API_KEY || "d87221c57b5642c48f2d7c0ae5e3b890";

// Mock database for users (replace with real database in production)
let users = [
  {
    id: "1",
    fullName: "Test User",
    email: "test@localauthority.gov.uk",
    authority: "Random Authority",
    password: "password123", // In a real app, this would be hashed
  },
];

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.session.user) {
    next();
  } else {
    res.redirect("/login");
  }
};

// Initialize database with sample data if empty
async function initializeDatabase() {
  try {
    const suppliers = await db.getPendingSuppliers();
    if (suppliers.length === 0) {
      const sampleData = await fs.readFile(
        path.join(__dirname, "./assets/data/sample.json"),
        "utf8"
      );
      const supplierData = JSON.parse(sampleData);
      await db.storeSupplier(supplierData);
      console.log("Database initialized with sample data");
    }
  } catch (error) {
    console.error("Error initializing database:", error);
  }
}

// Initialize on startup
initializeDatabase();

// Authentication Routes
router.get("/login", (req, res) => {
  // Clear any existing session
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
    }
    res.render("login.html", { error: null });
  });
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.render("login.html", {
        error: "Please enter both email and password",
      });
    }

    // Get user
    const user = await db.getUserByEmail(email);
    if (!user) {
      return res.render("login.html", {
        error: "Invalid email or password",
      });
    }

    // Check password
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.render("login.html", {
        error: "Invalid email or password",
      });
    }

    // Update last login
    await db.updateLastLogin(user.id);

    // Set session
    req.session.user = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      authority: user.authority,
    };

    res.redirect("/dashboard");
  } catch (error) {
    console.error("Login error:", error);
    res.render("login.html", {
      error: "An error occurred. Please try again.",
    });
  }
});

// Add logout route
router.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
    }
    res.redirect("/login");
  });
});

// Register routes
router.get("/register", (req, res) => {
  res.render("register.html", { error: null });
});

router.post("/register", async (req, res) => {
  try {
    const { fullName, email, authority, password, confirmPassword } = req.body;

    // Validation
    if (!email.endsWith("@gov.uk")) {
      return res.render("register.html", {
        error: "Email must be a valid local authority email address",
        values: { fullName, email, authority },
      });
    }

    if (password !== confirmPassword) {
      return res.render("register.html", {
        error: "Passwords do not match",
        values: { fullName, email, authority },
      });
    }

    // Check if user exists
    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      return res.render("register.html", {
        error: "Email already registered",
        values: { fullName, email, authority },
      });
    }

    // Create user
    const userId = await db.createUser({
      fullName,
      email,
      authority,
      password,
    });

    // Set session
    req.session.user = {
      id: userId,
      email,
      fullName,
      authority,
    };

    res.redirect("/dashboard");
  } catch (error) {
    console.error("Registration error:", error);
    res.render("register.html", {
      error: "Error creating account. Please try again.",
      values: { fullName, email, authority },
    });
  }
});

// Supplier Routes (Protected)
router.post("/api/fetch-supplier", isAuthenticated, async (req, res) => {
  try {
    const { sharecode } = req.body;

    if (!sharecode) {
      return res.status(400).json({
        success: false,
        error: "Share code is required",
      });
    }

    // First check sample data
    try {
      const sampleData = await fs.readFile(
        path.join(__dirname, "./assets/data/sample.json"),
        "utf8"
      );
      const sampleSupplier = JSON.parse(sampleData);
      if (sampleSupplier.supplierInformationData.form.shareCode === sharecode) {
        await db.storeSupplier(sampleSupplier, req.session.user.fullName);
        return res.json({ success: true });
      }
    } catch (error) {
      console.error("Error checking sample data:", error);
    }

    // If no matching sample data, call CDP API
    if (!API_KEY) {
      return res.status(500).json({
        success: false,
        error: "CDP API key not configured",
      });
    }

    const response = await fetch(`${API_URL}/share/data/${sharecode}`, {
      headers: {
        "CDP-Api-Key": API_KEY,
        accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`CDP API error: ${response.statusText}`);
    }

    const supplierData = await response.json();
    await db.storeSupplier(supplierData, req.session.user.fullName);
    res.json({ success: true });
  } catch (error) {
    console.error("Error fetching supplier data:", error);
    res.status(500).json({
      success: false,
      error: "Error fetching supplier data. Please try again.",
    });
  }
});

// Get pending suppliers
router.get("/api/suppliers/pending", isAuthenticated, async (req, res) => {
  try {
    const suppliers = await db.getPendingSuppliers();
    res.json(suppliers);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get supplier details
router.get("/api/suppliers/:id", isAuthenticated, async (req, res) => {
  try {
    const supplier = await db.getSupplier(req.params.id);
    if (!supplier) {
      res.status(404).json({ error: "Supplier not found" });
    } else {
      res.json(supplier);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update supplier status
router.post(
  "/api/suppliers/:id/decision",
  isAuthenticated,
  async (req, res) => {
    try {
      const { decision, rejectionReason } = req.body;
      await db.updateSupplierStatus(
        req.params.id,
        decision,
        req.session.user.fullName,
        rejectionReason
      );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Page Routes (Protected)
router.get("/dashboard", isAuthenticated, (req, res) => {
  res.render("dashboard.html", {
    user: req.session.user,
    success: req.query.success,
    error: req.query.error,
  });
});

router.get("/add-sharecode", isAuthenticated, (req, res) => {
  res.render("add-sharecode.html", {
    user: req.session.user,
    errors: req.query.error,
    success: req.query.success === "true",
  });
});

router.get("/suppliers/review/:id", isAuthenticated, async (req, res) => {
  try {
    const supplier = await db.getSupplier(req.params.id);
    if (!supplier) {
      res.redirect("/dashboard?error=Supplier not found");
    } else {
      res.render("supplier-review.html", {
        user: req.session.user,
        supplier: supplier,
      });
    }
  } catch (error) {
    res.redirect("/dashboard?error=" + encodeURIComponent(error.message));
  }
});

// Add this route for audit logs
router.get("/api/audit-logs", isAuthenticated, async (req, res) => {
  try {
    const logs = await db.getAuditLogs();
    res.json(logs);
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    res.status(500).json({ error: error.message });
  }
});

// Add this route for supplier-specific audit logs
router.get(
  "/api/suppliers/:id/audit-logs",
  isAuthenticated,
  async (req, res) => {
    try {
      const logs = await db.getSupplierAuditLogs(req.params.id);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching supplier audit logs:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Add system status endpoint
router.get("/api/system-status", isAuthenticated, async (req, res) => {
  try {
    const status = await db.getSystemStatus(); // Use the helper function
    res.json(status);
  } catch (error) {
    console.error("Error fetching system status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get approved suppliers
router.get(
  "/api/suppliers/status/approved",
  isAuthenticated,
  async (req, res) => {
    try {
      const suppliers = await db.getApprovedSuppliers();
      res.json(suppliers);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// Get rejected suppliers
router.get(
  "/api/suppliers/status/rejected",
  isAuthenticated,
  async (req, res) => {
    try {
      const suppliers = await db.getRejectedSuppliers();
      res.json(suppliers);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// Generic status route that handles both approved and rejected
router.get(
  "/api/suppliers/status/:status",
  isAuthenticated,
  async (req, res) => {
    try {
      const status = req.params.status.toLowerCase();
      if (status === "approved") {
        const suppliers = await db.getApprovedSuppliers();
        res.json(suppliers);
      } else if (status === "rejected") {
        const suppliers = await db.getRejectedSuppliers();
        res.json(suppliers);
      } else {
        res.status(400).json({
          success: false,
          error: 'Invalid status. Must be either "approved" or "rejected"',
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// Supplier list routes for approved/rejected
router.get("/suppliers/status/:status", isAuthenticated, async (req, res) => {
  const { status } = req.params;

  try {
    // Validate status
    if (!["approved", "rejected"].includes(status)) {
      return res.redirect("/dashboard");
    }

    let suppliers;
    if (status === "approved") {
      suppliers = await db.getApprovedSuppliers();
    } else {
      suppliers = await db.getRejectedSuppliers();
    }

    res.render("supplier-list.html", {
      title: `${status.charAt(0).toUpperCase() + status.slice(1)} Suppliers`,
      suppliers,
      status,
      currentPage: 1,
      hasNextPage: false,
      pagination: null,
    });
  } catch (error) {
    console.error(`Error fetching ${status} suppliers:`, error);
    res.redirect("/dashboard");
  }
});

// Supplier details route
router.get("/suppliers/:id/details", isAuthenticated, async (req, res) => {
  try {
    const supplier = await db.getSupplier(req.params.id);
    if (!supplier) {
      console.log("Supplier not found:", req.params.id);
      return res.redirect("/dashboard");
    }

    // Get additional supplier info
    const supplierInfo = await db.getSupplierInfo(req.params.id);

    // Format the data for the template
    const formattedSupplier = {
      id: req.params.id,
      name: supplier.identifier?.legalName || "Unknown",
      share_code: supplierInfo?.share_code || "N/A",
      status: supplierInfo?.status || "pending",
      reviewDate: supplierInfo?.reviewed_at,
      reviewedBy: supplierInfo?.reviewed_by,
      rejectionReason: supplierInfo?.rejection_reason,
      data: supplier,
    };

    res.render("supplier-details.html", {
      supplier: formattedSupplier,
      error: req.query.error,
      success: req.query.success,
    });
  } catch (error) {
    console.error("Error fetching supplier:", error);
    res.redirect("/dashboard");
  }
});

// Get supplier audit logs with better error handling
router.get("/api/audit-log/supplier/:id", isAuthenticated, async (req, res) => {
  try {
    const logs = await db.getSupplierAuditLogs(req.params.id);
    res.json(
      logs.map((log) => {
        try {
          return {
            ...log,
            details:
              typeof log.details === "string"
                ? JSON.parse(log.details)
                : log.details,
          };
        } catch (e) {
          return {
            ...log,
            details: { error: "Invalid log data" },
          };
        }
      })
    );
  } catch (error) {
    console.error("Error fetching supplier audit logs:", error);
    res.status(500).json([]);
  }
});

module.exports = router;
