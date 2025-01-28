const Auth = {
  // Get the current user
  getUser: function () {
    const userData = localStorage.getItem("user");
    return userData ? JSON.parse(userData) : null;
  },

  // Check if user is logged in
  isAuthenticated: function () {
    return !!this.getUser();
  },

  // Log out user
  logout: function () {
    localStorage.removeItem("user");
    window.location.href = "/login";
  },

  // Check if the current page requires authentication
  requireAuth: function () {
    if (!this.isAuthenticated()) {
      window.location.href = "/login";
      return false;
    }
    return true;
  },
};

// Add logout functionality to logout buttons
document.addEventListener("DOMContentLoaded", function () {
  const logoutButtons = document.querySelectorAll('[data-action="logout"]');
  logoutButtons.forEach((button) => {
    button.addEventListener("click", function (e) {
      e.preventDefault();
      Auth.logout();
    });
  });

  // Check authentication for protected pages
  if (document.body.hasAttribute("data-require-auth")) {
    Auth.requireAuth();
  }
});
