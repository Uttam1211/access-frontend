const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");

// Mock database (replace with real database in production)
let users = [];

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.session.user) {
    next();
  } else {
    res.redirect("/login");
  }
};

// Login routes
router.get("/login", (req, res) => {
  if (req.session.user) {
    return res.redirect("/dashboard");
  }
  res.render("login.html", { error: null });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email.endsWith(".gov.uk")) {
    return res.render("login.html", {
      error: "Email must be a valid local authority email address",
    });
  }

  const user = users.find((u) => u.email === email);

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.render("login.html", {
      error: "Invalid email or password",
    });
  }

  req.session.user = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    authority: user.authority,
  };

  res.redirect("/dashboard");
});

// Register routes
router.get("/register", (req, res) => {
  res.render("register.html", { error: null });
});

router.post("/register", async (req, res) => {
  const { fullName, email, authority, password, confirmPassword } = req.body;

  // Validation
  if (!email.endsWith(".gov.uk")) {
    return res.render("register.html", {
      error: "Email must be a valid local authority email address",
    });
  }

  if (password !== confirmPassword) {
    return res.render("register.html", {
      error: "Passwords do not match",
    });
  }

  if (users.some((u) => u.email === email)) {
    return res.render("register.html", {
      error: "Email already registered",
    });
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create user
  const user = {
    id: Date.now().toString(),
    fullName,
    email,
    authority,
    password: hashedPassword,
    createdAt: new Date(),
  };

  users.push(user);

  // Log user in
  req.session.user = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    authority: user.authority,
  };

  res.redirect("/dashboard");
});

// Forgot password routes
router.get("/forgot-password", (req, res) => {
  res.render("forgot-password.html", { error: null });
});

router.post("/forgot-password", (req, res) => {
  const { email } = req.body;

  if (!email.endsWith(".gov.uk")) {
    return res.render("forgot-password.html", {
      error: "Email must be a valid local authority email address",
    });
  }

  // Add forgot password logic here
});

module.exports = router;
