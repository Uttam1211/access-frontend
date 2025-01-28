const express = require("express");
const router = express.Router();
const db = require("../assets/data/db");
const fs = require("fs").promises;
const path = require("path");
const fetch = require("node-fetch");
require("dotenv").config();

// Move API configuration to environment variables
const API_URL =
  process.env.CDP_API_URL ||
  "https://data-sharing.dev.supplier.information.findatender.codatt.net";
const API_KEY = process.env.CDP_API_KEY;

// Initialize database with sample data if empty
async function initializeDatabase() {
  try {
    const suppliers = await db.getPendingSuppliers();
    if (suppliers.length === 0) {
      // Load sample data
      const sampleData = await fs.readFile(
        path.join(__dirname, "../assets/data/sample.json"),
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

// Middleware to parse JSON bodies
router.use(express.json());

// Fetch supplier data endpoint
router.post("/api/fetch-supplier", async (req, res) => {
  try {
    console.log("Fetching supplier data" + req.body +API_URL);
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
        path.join(__dirname, "../assets/data/sample.json"),
        "utf8"
      );
      const sampleSupplier = JSON.parse(sampleData);
      if (sampleSupplier.supplierInformationData.form.shareCode === sharecode) {
        await db.storeSupplier(sampleSupplier);
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
    await db.storeSupplier(supplierData);
    res.json({ success: true });
  } catch (error) {
    console.error("Error fetching supplier data:", error);
    res.status(500).json({
      success: false,
      error: "Error fetching supplier data. Please try again.",
    });
  }
});

// Store supplier data
router.post("/api/suppliers/store", async (req, res) => {
  try {
    await db.storeSupplier(req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get pending suppliers
router.get("/api/suppliers/pending", async (req, res) => {
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
router.get("/api/suppliers/:id", async (req, res) => {
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
router.post("/api/suppliers/:id/decision", async (req, res) => {
  try {
    const { decision, rejectionReason } = req.body;
    await db.updateSupplierStatus(
      req.params.id,
      decision,
      req.user.name,
      rejectionReason
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get sample data
router.get("/api/sample-data", async (req, res) => {
  try {
    const sampleData = await fs.readFile(
      path.join(__dirname, "../assets/data/sample.json"),
      "utf8"
    );
    res.json(JSON.parse(sampleData));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export the router
module.exports = router;
